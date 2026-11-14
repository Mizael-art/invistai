"""E2E da Busca global (Etapa 12). Servidor mock (tests/mock-server.mjs). Requer `npm run build`."""
import json, re, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
OK = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "SEARCH_RATE_PER_MIN": "1000"}
s1 = start(3931, OK); s2 = start(3932, {**OK, "COINGECKO_BASE_URL": "http://127.0.0.1:4010/rl"}); s3 = start(3933, {**OK, "SEARCH_RATE_PER_MIN": "30"})
B, B2, B3 = "http://127.0.0.1:3931", "http://127.0.0.1:3932", "http://127.0.0.1:3933"
def calls(): return json.loads(urllib.request.urlopen("http://127.0.0.1:4010/__search_calls").read())["n"]
def box(pg): return pg.locator("header").get_by_role("combobox")
def opts(pg): return pg.locator("[role=option]")
def wait_opts(pg, timeout=8000): pg.wait_for_selector("[role=option], [data-testid=search-empty], [data-testid=search-panel] [role=alert]", timeout=timeout)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; reqs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80] + " @ " + pg.url))
        pg.on("request", lambda r: reqs.append(r.url) if "/api/search" in r.url else None)
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000)
        sb = box(pg)
        check("campo de busca habilitado no cabeçalho, com rótulo acessível (combobox)", sb.is_enabled() and sb.get_attribute("aria-label") == "Buscar ativos e mercados")
        sb.click(); sb.type("b", delay=30); pg.wait_for_selector("[data-testid=search-panel]")
        check("1 caractere: pede ao menos 2 e não consulta a API", "ao menos 2 caracteres" in pg.inner_text("[data-testid=search-panel]") and reqs == [])
        # debounce: digitar rápido = uma requisição
        sb.type("itcoin", delay=40); wait_opts(pg); pg.wait_for_timeout(400)
        check("debounce: digitação contínua (7 teclas) gera 1 requisição", len(reqs) == 1, f"{len(reqs)} reqs")
        check("resultado: nome, símbolo e categoria", "BTC" in opts(pg).first.inner_text() and "Bitcoin" in opts(pg).first.inner_text() and "Criptomoedas (spot)" in opts(pg).first.inner_text())
        check("somente ativos e mercados (sem notícias/conteúdos/sinais)", pg.locator("[data-testid=search-panel] a[href^='https://']").count() == 0 and all(o.get_attribute("data-href").startswith("/mercado") for o in opts(pg).all()))
        # clique abre detalhe
        opts(pg).first.click(); pg.wait_for_url("**/mercado/bitcoin"); pg.wait_for_selector("#dados", timeout=20000)
        check("selecionar resultado abre o detalhe do ativo e limpa a busca", box(pg).input_value() == "" and pg.locator("[data-testid=search-panel]").count() == 0)
        # símbolo exato primeiro / busca por símbolo
        reqs.clear(); box(pg).fill("eth"); wait_opts(pg); check("busca por símbolo: ETH primeiro", opts(pg).first.get_attribute("data-href") == "/mercado/ethereum")
        # forex e mercados
        box(pg).fill("real"); pg.wait_for_selector("[role=option][data-href='/mercado/usd-brl']", timeout=8000); check("forex: 'real' encontra USD/BRL", "USD/BRL" in pg.inner_text("[data-testid=search-panel]"))
        box(pg).fill("forex"); pg.wait_for_selector("[role=option][data-href='/mercado?cat=forex']", timeout=8000); check("mercados: 'forex' encontra a categoria", "Forex e moedas" in pg.inner_text("[data-testid=search-panel]"))
        box(pg).fill("ações"); pg.wait_for_selector("[role=option][data-href='/mercado?cat=stocks_br']", timeout=8000)
        check("categoria sem fonte aparece marcada como 'pendente' (não inventa ativos)", "pendente" in pg.locator("[role=option][data-href='/mercado?cat=stocks_br']").inner_text() and pg.locator("[role=option][data-href^='/mercado/']").count() == 0)
        pg.locator("[role=option][data-href='/mercado?cat=forex']").count() == 0
        box(pg).fill("forex"); pg.wait_for_selector("[role=option][data-href='/mercado?cat=forex']", timeout=8000); pg.locator("[role=option][data-href='/mercado?cat=forex']").click(); pg.wait_for_url("**/mercado?cat=forex"); check("selecionar mercado abre a categoria no Mercado", True)
        # sem resultados
        box(pg).fill("zzzzqq"); pg.wait_for_selector("[data-testid=search-empty]", timeout=8000); check("sem resultados: mensagem simples", "Nenhum resultado encontrado." in pg.inner_text("[data-testid=search-panel]"))
        # limpar
        pg.get_by_role("button", name="Limpar busca").click(); check("limpar apaga a consulta e mantém o foco", box(pg).input_value() == "" and pg.evaluate("document.activeElement.getAttribute('role')") == "combobox")
        # cache: repetir consulta não chama de novo
        box(pg).fill("solana"); wait_opts(pg); n1 = calls(); box(pg).fill(""); box(pg).fill("solana"); wait_opts(pg); pg.wait_for_timeout(500)
        check("consulta repetida usa cache (sem nova requisição ao provedor)", calls() == n1)
        # teclado
        box(pg).fill("bitcoin"); wait_opts(pg); pg.keyboard.press("ArrowDown"); pg.keyboard.press("ArrowDown")
        sel = pg.locator("[role=option][aria-selected=true]"); check("setas navegam e marcam a opção (aria-selected/activedescendant)", sel.count() == 1 and box(pg).get_attribute("aria-activedescendant") == sel.get_attribute("id"))
        href = sel.get_attribute("data-href"); pg.keyboard.press("Enter"); pg.wait_for_url("**" + href); check("Enter abre a opção marcada", pg.url.endswith(href))
        box(pg).fill("bitcoin"); wait_opts(pg); pg.keyboard.press("Escape"); check("Esc limpa; segundo Esc fecha", box(pg).input_value() == "") ; pg.keyboard.press("Escape"); check("painel fechado", pg.locator("[data-testid=search-panel]").count() == 0)
        box(pg).fill("bitcoin"); wait_opts(pg); pg.mouse.click(700, 600); check("clicar fora fecha o painel", pg.locator("[data-testid=search-panel]").count() == 0)
        pg.keyboard.press("Control+k"); check("Ctrl+K foca a busca", pg.evaluate("document.activeElement.getAttribute('role')") == "combobox")
        # corrida: resposta antiga não sobrescreve a nova
        box(pg).fill("slowcoin"); pg.wait_for_timeout(350); box(pg).fill("ethereum"); pg.wait_for_selector("[role=option][data-href='/mercado/ethereum']", timeout=8000); pg.wait_for_timeout(1200)
        check("requisição anterior cancelada: resultado final é da última consulta", opts(pg).first.get_attribute("data-href") == "/mercado/ethereum")
        # API
        r = pg.request.get(B + "/api/search"); check("API: sem q → 400", r.status == 400)
        r = pg.request.get(B + "/api/search?q=a"); check("API: q curto → lista vazia (sem chamar o provedor)", r.status == 200 and r.json()["assets"] == [])
        r = pg.request.get(B + "/api/search?q=" + "%00%01bit"); check("API: caracteres de controle são removidos", r.status == 200 and r.json()["q"] == "bit")
        r = pg.request.get(B + "/api/search?q=" + "x" * 300); check("API: consulta limitada a 60 caracteres", r.status == 200 and len(r.json()["q"]) == 60)
        j = pg.request.get(B + "/api/search?q=bitcoin").json(); check("API: só os campos q/markets/assets/errors", sorted(j.keys()) == ["assets", "errors", "markets", "q"])
        r = pg.request.get(B + "/api/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E"); check("API: entrada maliciosa tratada como texto (sem erro)", r.status == 200)
        codes = [pg.request.get(B3 + f"/api/search?q=abc{i}").status for i in range(35)]; check("API: limite por IP → 429", 429 in codes[30:] and 429 not in codes[:30], str(codes[28:33]))
        # falha do provedor de cripto
        p2 = ctx.new_page(); p2.goto(B2 + "/mercado"); p2.wait_for_selector("main"); box(p2).fill("real"); p2.wait_for_selector("[data-testid=search-partial]", timeout=8000)
        check("provedor de cripto fora (429): aviso parcial e forex continua", "Criptomoedas indisponíveis" in p2.inner_text("[data-testid=search-panel]") and p2.locator("[role=option][data-href='/mercado/usd-brl']").count() == 1)
        box(p2).fill("bitcoin"); p2.wait_for_function("!document.querySelector(\"[role=option][data-href='/mercado/usd-brl']\") && !!document.querySelector('[data-testid=search-partial]')", timeout=8000); check("provedor fora e sem outros resultados: só o aviso, sem resultados inventados", opts(p2).count() == 0)
        p4 = ctx.new_page(); p4.goto(B3 + "/"); p4.wait_for_selector("main"); box(p4).fill("bitcoin"); p4.wait_for_selector("[data-testid=search-panel] [role=alert]", timeout=8000)
        check("limite atingido: mensagem de aguardar", "Aguarde um instante" in p4.inner_text("[data-testid=search-panel]"))
        # páginas de autenticação não têm a busca; páginas internas têm
        pa = ctx.new_page(); pa.goto(B + "/login"); pa.wait_for_selector("form"); check("telas de login não exibem a busca global", pa.get_by_role("combobox").count() == 0)
        # EN / claro / mobile
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = ectx.new_page()
        pe.goto(B + "/"); pe.wait_for_selector("main"); box(pe).fill("bitcoin"); wait_opts(pe)
        check("inglês e tema claro", "Crypto (spot)" in pe.inner_text("[data-testid=search-panel]") and "assets" in pe.inner_text("[data-testid=search-panel]").lower() and pe.evaluate("document.documentElement.dataset.theme") == "light")
        pe.screenshot(path="docs/screenshots/etapa12_desktop_light_en.png")
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/"); mb.wait_for_selector(".lrow", timeout=20000)
        check("mobile: busca fica atrás de um botão de ícone", box(mb).is_hidden() and mb.get_by_role("button", name="Abrir busca").is_visible())
        mb.get_by_role("button", name="Abrir busca").click(); check("mobile: abre em tela cheia com foco no campo", box(mb).is_visible() and mb.evaluate("document.activeElement.getAttribute('role')") == "combobox")
        box(mb).fill("bitcoin"); wait_opts(mb); check("mobile: resultados visíveis e sem rolagem horizontal", opts(mb).first.is_visible() and not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        mb.screenshot(path="docs/screenshots/etapa12_mobile.png")
        opts(mb).first.click(); mb.wait_for_url("**/mercado/bitcoin"); check("mobile: tocar no resultado abre o detalhe e fecha a busca", box(mb).is_hidden())
        mb.get_by_role("button", name="Abrir busca").click(); mb.get_by_role("button", name="Fechar").click(); check("mobile: 'Fechar' recolhe a busca", box(mb).is_hidden())
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, s3, m): stop(s)
finish()
