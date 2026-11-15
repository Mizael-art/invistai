"""E2E da página de detalhes do ativo (Etapa 03). Requer `npm run build`. O script do TradingView é interceptado (rede externa indisponível/instável em CI)."""
import json, re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
OK = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
s1 = start(3301, OK); s2 = start(3302, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/rl"})
B = "http://127.0.0.1:3301"
STUB = "(function(){var s=document.currentScript,w=s.parentElement.querySelector('.tradingview-widget-container__widget');var f=document.createElement('iframe');f.title='tv-stub';f.style.cssText='width:100%;height:100%;border:0';w.appendChild(f);})();"
def cfg(pg):
    t = pg.evaluate("(()=>{const s=document.querySelector('script[data-tv-config]');return s?[s.src,s.text]:null})()")
    return (t[0], json.loads(t[1])) if t else (None, None)
def wait_cfg(pg, key, val):
    pg.wait_for_function(f"(()=>{{const s=document.querySelector('script[data-tv-config]');return s&&JSON.parse(s.text).{key}==={json.dumps(val)}}})()", timeout=5000)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"]); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB))
        pg.goto(B + "/mercado/bitcoin"); pg.wait_for_selector("#grafico iframe", timeout=15000)
        h = pg.inner_text("main").replace("\xa0", " ")
        check("cabeçalho: símbolo, nome, categoria e moeda", "BTC" in pg.inner_text("h1") and "Bitcoin" in h and "Criptomoedas (spot)" in h and "Moeda: USD" in h)
        check("preço com moeda de referência, variação, fonte e horário", "US$ 64.000,00" in h and "+2,40%" in h and "Fonte: CoinGecko" in h and "Atualizado:" in h)
        src, c = cfg(pg)
        check("widget oficial TradingView com símbolo do ativo", src == "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" and c["symbol"] == "BINANCE:BTCUSDT", str(c and c["symbol"]))
        check("config inicial: 15m, velas, EMA 7/14/28, volume, tema escuro, pt, fuso de Brasília, barra do widget oculta", (c["interval"], c["style"], c["theme"], c["locale"], c["timezone"], c["hide_top_toolbar"], c["hide_volume"]) == ("15", "1", "dark", "br", "America/Sao_Paulo", True, False) and [x["inputs"]["length"] for x in c["studies"]] == [7, 14, 28] and "range" not in c)
        check("cabeçalho estilo corretora: máxima, mínima e volume 24h", all(k in pg.get_by_test_id("stats24").inner_text() for k in ["Máx. 24h", "Mín. 24h", "Volume 24h"]))
        bar = pg.locator("#grafico .tf").first
        check("barra de tempos: Linha, 15m, 1h, 4h, 1D e Mais", [t.strip() for t in bar.locator(":scope > button").all_inner_texts()] == ["Linha", "15m", "1h", "4h", "1D"] and pg.get_by_test_id("tf-more").is_visible())
        check("atribuição ao TradingView presente", pg.locator("a[href='https://www.tradingview.com/']").count() == 1)
        check("gráfico carregado: sem aviso de falha/carregando", pg.locator("#grafico [role=alert]").count() == 0 and pg.locator("#grafico [role=status]").count() == 0)
        check("sem botões de compra/venda", pg.get_by_role("button", name=re.compile("compr|vend|buy|sell", re.I)).count() == 0)
        # períodos e tipo reais
        for lab, itv in [("1h", "60"), ("4h", "240"), ("1D", "D"), ("15m", "15")]:
            bar.get_by_role("button", name=lab, exact=True).click(); wait_cfg(pg, "interval", itv)
            check(f"tempo {lab} reconfigura o gráfico", cfg(pg)[1]["interval"] == itv and bar.get_by_role("button", name=lab, exact=True).get_attribute("aria-pressed") == "true")
        pg.get_by_test_id("tf-more").click(); menu = pg.get_by_role("menu")
        check("'Mais' abre 1m, 5m, 30m, 2h, 1S e 1Mês", [t.strip() for t in menu.get_by_role("menuitemradio").all_inner_texts()] == ["1m", "5m", "30m", "2h", "1S", "1Mês"])
        menu.get_by_role("menuitemradio", name="5m").click(); wait_cfg(pg, "interval", "5")
        check("tempo extra aplicado e mostrado no botão 'Mais'", pg.get_by_test_id("tf-more").inner_text().startswith("5m") and pg.get_by_role("menu").count() == 0)
        pg.get_by_test_id("tf-more").click(); pg.keyboard.press("Escape"); check("Esc fecha o menu de tempos", pg.get_by_role("menu").count() == 0)
        bar.get_by_role("button", name="Linha").click(); wait_cfg(pg, "style", "2"); check("alternar para linha", cfg(pg)[1]["style"] == "2")
        pg.get_by_role("button", name="Velas").click(); wait_cfg(pg, "style", "1"); check("alternar para velas", cfg(pg)[1]["style"] == "1")
        pg.get_by_role("button", name=re.compile("^Indicadores")).click(); pg.wait_for_function("(()=>{const s=document.querySelector('script[data-tv-config]');return s&&JSON.parse(s.text).studies.length===0})()", timeout=5000)
        check("indicadores podem ser desligados", cfg(pg)[1]["studies"] == [])
        pg.get_by_role("button", name=re.compile("^Indicadores")).click(); wait_cfg(pg, "interval", "5")
        pg.reload(); pg.wait_for_selector("#grafico iframe", timeout=15000)
        check("tempo e tipo escolhidos são lembrados neste navegador", cfg(pg)[1]["interval"] == "5" and len(cfg(pg)[1]["studies"]) == 3)
        pg.get_by_role("button", name="15m", exact=True).click(); wait_cfg(pg, "interval", "15")
        pg.wait_for_selector("#grafico iframe")
        # dados
        d = pg.inner_text("#dados")
        check("dados: métricas do provedor formatadas", "Capitalização de mercado" in d and "tri" in d and "Máxima histórica" in d and "Oferta circulante" in d)
        check("dados: descrição sem HTML e com fonte/categorias", "Descrição de teste do ativo." in d and "<p>" not in d and "CoinGecko" in d and "Cat A" in d)
        # notícias
        check("notícias relacionadas com links externos seguros", pg.locator("#noticias a[rel*=noopener][href^='https://exemplo.test']").count() == 3)
        # análise
        a = pg.inner_text("#analise")
        check("análise: indicadores calculados e rotulados", "Tendência observada" in a and "Variação no período" in a and "Oscilação" in a and "Pontos analisados" in a)
        check("análise: deixa claro que não é IA nem recomendação", "Não é análise de IA" in a and "IA: indisponível" in a and "nenhuma análise publicada" in a and "recomendação" in a)
        check("análise: fonte e horário", "Fonte: CoinGecko" in a and "Calculado em" in a)
        # navegação interna
        pg.get_by_role("link", name="Análise", exact=True).click(); pg.wait_for_function("location.hash==='#analise'")
        pg.wait_for_function("document.querySelector('#analise').getBoundingClientRect().top < innerHeight*0.6", timeout=5000); check("atalho de seção rola até a análise", True)
        # compartilhar
        pg.get_by_role("button", name="Compartilhar").click(); pg.wait_for_selector("text=Link copiado.", timeout=4000)
        check("compartilhar copia o link da página", pg.evaluate("navigator.clipboard.readText()").startswith(B + "/mercado/bitcoin"))
        # favorito
        fb = pg.get_by_role("button", name="Favoritar"); fb.click(); pg.wait_for_selector(".fav-msg:has-text('não configuradas')")
        check("favorito sem contas reverte e informa", fb.inner_text() == "☆")
        # falha do script: retry
        pf = ctx.new_page(); pf.route("**/embed-widget-advanced-chart.js", lambda r: r.abort()); pf.goto(B + "/mercado/ethereum"); pf.wait_for_selector("#grafico [role=alert]", timeout=15000)
        check("falha do TradingView: mensagem clara + retry, resto da página ok", "Não foi possível carregar o gráfico" in pf.inner_text("#grafico") and "ETH" in pf.inner_text("h1") and "Capitalização" in pf.inner_text("#dados"))
        pf.unroute("**/embed-widget-advanced-chart.js"); pf.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB))
        pf.get_by_role("button", name="Tentar novamente").click(); pf.wait_for_selector("#grafico iframe", timeout=8000); check("retry recarrega o gráfico", pf.locator("#grafico [role=alert]").count() == 0)
        # tema e idioma
        ctx.add_cookies([{"name": "iv_theme", "value": "light", "url": B}, {"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/mercado/bitcoin"); pg.wait_for_selector("#grafico iframe", timeout=15000)
        _, c = cfg(pg); check("tema claro e idioma EN refletidos no widget", c["theme"] == "light" and c["locale"] == "en" and c["backgroundColor"] == "#FFFFFF")
        check("página em inglês", "Educational analysis" in pg.inner_text("#analise") and "$64,000.00" in pg.inner_text("main"))
        pg.screenshot(path="docs/screenshots/etapa03_desktop_light_en.png", full_page=True)
        ctx.clear_cookies()
        # ativo sem mapeamento
        pu = ctx.new_page(); pu.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB)); pu.goto(B + "/mercado/coin-7"); pu.wait_for_selector("#grafico")
        check("ativo não mapeado: sem TradingView, aviso e série do provedor (sem outro ativo)", pu.locator("script[data-tv-config]").count() == 0 and "não mapeado" in pu.inner_text("#grafico") and pu.locator("#grafico svg.linechart").count() == 1)
        # falha parcial dos dados descritivos
        pd = ctx.new_page(); pd.goto(B + "/mercado/coin-9"); pd.wait_for_selector("#dados")
        check("falha dos dados descritivos não derruba a página", "Dados descritivos indisponíveis" in pd.inner_text("#dados") and "C9" in pd.inner_text("h1") and pd.locator("#analise").count() == 1)
        # forex
        px = ctx.new_page(); px.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB)); px.goto(B + "/mercado/usd-brl"); px.wait_for_selector("#grafico iframe", timeout=15000)
        fx = px.inner_text("main").replace("\xa0", " "); _, c = cfg(px)
        check("forex: símbolo FX_IDC:USDBRL, moeda BRL e taxa com 4 casas", c["symbol"] == "FX_IDC:USDBRL" and "BRL" in fx and re.search(r"5,\d{4} BRL", fx) is not None)
        check("forex: extremos do período e análise calculada", "Máxima do período" in px.inner_text("#dados") and "Variação no período" in px.inner_text("#analise"))
        # não encontrado / id inválido
        for path in ["/mercado/ativo-que-nao-existe", "/mercado/BAD_ID", "/mercado/usd-xyz", "/mercado/..%2Fetc"]:
            pn = ctx.new_page(); pn.goto(B + path); pn.wait_for_selector("h1")
            check(f"não encontrado: {path}", "Ativo não encontrado" in pn.inner_text("main") and pn.get_by_role("link", name="Mercado").last.is_visible() and pn.locator("script[data-tv-config]").count() == 0)
        # navegação
        pg2 = ctx.new_page(); pg2.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB)); pg2.goto(B + "/mercado"); pg2.wait_for_selector("tbody tr"); pg2.wait_for_load_state("networkidle")
        pg2.locator("tbody tr").nth(1).locator("a").click(); pg2.wait_for_url("**/mercado/ethereum"); pg2.wait_for_selector("#grafico")
        pg2.get_by_role("link", name="← Mercado").click(); pg2.wait_for_selector("tbody tr"); check("lista → detalhe → voltar", pg2.url.endswith("/mercado"))
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        # mobile
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.route("**/embed-widget-advanced-chart.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB)); mb.goto(B + "/mercado/bitcoin"); mb.wait_for_selector("#grafico iframe", timeout=15000)
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        check("mobile: gráfico com altura utilizável", mb.evaluate("document.querySelector('.tvbox').getBoundingClientRect().height") >= 300)
        mb.screenshot(path="docs/screenshots/etapa03_mobile.png", full_page=True)
        # 429
        r2 = b.new_page(); r2.goto("http://127.0.0.1:3302/mercado/bitcoin"); r2.wait_for_selector(".note", timeout=15000)
        check("429 do provedor: aviso + retry, navegação preservada", "Limite de requisições" in r2.inner_text("main") and r2.get_by_role("button", name="Tentar novamente").count() >= 1 and r2.locator("aside a.nav").count() == 12)
        b.close()
finally:
    for s in (s1, s2, m): stop(s)
finish()
