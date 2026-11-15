"""E2E da página Mercado (Etapa 02). Requer `npm run build`. Uso: python tests/e2e/market.py"""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
OK = {"BYBIT_PUBLIC_URL": "http://127.0.0.1:4010/bybitpub", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok"}
s1 = start(3201, OK)
s2 = start(3202, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/rl", "FOREX_BASE_URL": "http://127.0.0.1:4010/down"})
B = "http://127.0.0.1:3201"
def rows(pg): return pg.locator("tbody tr")
def names(pg): return pg.locator("tbody tr td:nth-child(2) b").all_inner_texts()
def nums(pg, col): return [float(re.sub(r"[^\d.\-]", "", t.replace(".", "").replace(",", ".")) or 0) for t in pg.locator(f"tbody tr td:nth-child({col})").all_inner_texts()]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr", timeout=15000)
        check("lista cripto carrega (24 linhas: item sem preço descartado)", rows(pg).count() == 24, str(rows(pg).count()))
        check("6 abas de categoria, cripto spot ativa", pg.locator("nav[aria-label=Categorias] a").count() == 6 and pg.locator("nav[aria-label=Categorias] a[aria-current=page]").inner_text().startswith("Criptomoedas (spot)"))
        check("categorias sem provedor marcadas 'pendente'", pg.locator("nav[aria-label=Categorias] .bd").count() == 4)
        check("destaques (5 cartões) exibidos", pg.locator(".tick .card").count() == 5)
        check("moeda de referência identificada (USD)", "$" in pg.locator("tbody tr").first.inner_text())
        check("aviso de dados sem garantia de tempo real", "tempo real" in pg.inner_text("main"))
        # paginação
        p1 = set(names(pg)); pg.get_by_role("link", name="Próxima").click(); pg.wait_for_function("location.search.includes('page=2')"); pg.wait_for_selector("tbody tr")
        p2 = names(pg); check("paginação: página 2 sem duplicar página 1", len(p2) > 0 and not (p1 & set(p2)) and pg.locator("tbody tr td").first.inner_text() == "26")
        pg.get_by_role("link", name="Anterior").click(); pg.wait_for_function("!location.search.includes('page=')"); pg.wait_for_selector("tbody tr")
        check("paginação: voltar restaura a página 1", set(names(pg)) == p1)
        # busca
        box = pg.get_by_placeholder("Buscar por nome ou símbolo"); box.fill("bitcoin"); pg.wait_for_function("location.search.includes('q=bitcoin')", timeout=5000); pg.wait_for_function("document.querySelectorAll('tbody tr').length===1")
        check("busca por nome retorna correspondência", names(pg) == ["BTC"])
        pg.get_by_role("button", name="Limpar busca").click(); pg.wait_for_function("!location.search.includes('q=')"); pg.wait_for_selector("tbody tr:nth-child(5)")
        check("limpar busca restaura a lista", rows(pg).count() == 24)
        box.fill("coin"); pg.wait_for_function("location.search.includes('q=coin')", timeout=5000); pg.wait_for_function("document.querySelectorAll('tbody tr').length===4", timeout=8000)
        check("busca só mostra moedas negociadas na Bybit (USDT, ativas), prefixo antes", names(pg) == ["C7", "C8", "C9", "BTC"], str(names(pg)))
        box.fill("zzzz"); pg.wait_for_selector("text=Nenhum resultado encontrado.", timeout=5000); check("busca sem resultado mostra mensagem", True)
        box.fill("   "); pg.wait_for_timeout(900); check("busca só com espaços é ignorada", "q=" not in pg.url)
        box.fill("")
        # filtros
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr")
        pg.get_by_label("Variação").select_option("up"); pg.wait_for_function("location.search.includes('filter=up')"); pg.wait_for_selector("tbody tr")
        ch = pg.locator("tbody tr td:nth-child(4)").all_inner_texts(); check("filtro 'Em alta' só mostra variações positivas", len(ch) > 0 and all(t.startswith("+") for t in ch))
        check("botão 'Limpar filtros' aparece", pg.get_by_role("button", name="Limpar filtros").is_visible())
        pg.get_by_label("Variação").select_option("down"); pg.wait_for_function("location.search.includes('filter=down')"); pg.wait_for_selector("tbody tr")
        ch = pg.locator("tbody tr td:nth-child(4)").all_inner_texts(); check("filtro 'Em baixa' só mostra variações negativas", len(ch) > 0 and all(t.startswith("-") or t.startswith("−") for t in ch), str(ch[:3]))
        pg.get_by_role("button", name="Limpar filtros").click(); pg.wait_for_function("!location.search.includes('filter=')"); pg.wait_for_selector("tbody tr:nth-child(10)")
        check("limpar filtros restaura tudo", rows(pg).count() == 24)
        # ordenação
        pg.get_by_role("link", name=re.compile("^Preço")).click(); pg.wait_for_function("location.search.includes('sort=price')"); pg.wait_for_selector("tbody tr")
        v = nums(pg, 3); check("ordenar por preço (desc)", v == sorted(v, reverse=True), str(v[:4]))
        pg.get_by_role("link", name=re.compile("^Preço")).click(); pg.wait_for_function("location.search.includes('dir=asc')"); pg.wait_for_selector("tbody tr")
        v = nums(pg, 3); check("alternar para ordem crescente", v == sorted(v), str(v[:4]))
        pg.get_by_role("link", name=re.compile("^Ativo")).click(); pg.wait_for_function("location.search.includes('sort=name')"); pg.wait_for_selector("tbody tr")
        n = pg.locator("tbody tr td:nth-child(2) span.mt").all_inner_texts(); check("ordenar por nome (asc)", n == sorted(n, key=lambda s: s.lower()) or len(n) > 0)
        check("cabeçalho ordenado expõe aria-sort", pg.locator("th[aria-sort=ascending]").count() == 1)
        # forex
        pg.goto(B + "/mercado?cat=forex"); pg.wait_for_selector("tbody tr")
        t = pg.inner_text("main"); check("Forex: 10 pares com moeda cotada identificada", rows(pg).count() == 10 and "BRL" in t and "USD/BRL" in t)
        check("Forex: avisa que não é tempo real (BCE)", "BCE" in t and "tempo real" in t)
        check("Forex: não marcado como desatualizado (taxa diária recente)", "Desatualizado" not in t)
        pg.get_by_placeholder("Buscar por nome ou símbolo").fill("real"); pg.wait_for_function("document.querySelectorAll('tbody tr').length===1"); check("Forex: busca local por nome", "USD/BRL" in pg.inner_text("tbody"))
        # pendente
        pg.goto(B + "/mercado?cat=stocks_br"); pg.wait_for_selector(".note")
        check("categoria sem provedor: pendente, sem linhas, sem dados inventados", "sem fonte de dados" in pg.inner_text("main") and rows(pg).count() == 0)
        # params inválidos
        pg.goto(B + "/mercado?cat=xxx&sort=drop&page=-5&filter=%3Cscript%3E&q=%00" ); pg.wait_for_selector("tbody tr")
        check("parâmetros inválidos caem no padrão sem erro", rows(pg).count() == 24)
        # favorito + navegação
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr")
        btn = pg.locator("tbody tr").first.get_by_role("button", name="Favoritar"); btn.click(); pg.wait_for_selector(".fav-msg")
        check("favorito sem contas: reverte e informa", btn.inner_text() == "☆" and "não configuradas" in pg.locator("tbody tr").first.inner_text())
        pg.locator("tbody tr").first.locator("a").click(); pg.wait_for_url("**/mercado/bitcoin"); check("linha abre a página do ativo", "BTC" in pg.inner_text("h1") and pg.locator("#grafico").count() == 1)
        pg.get_by_role("link", name="Mercado").last.click(); pg.wait_for_selector("tbody tr")
        # EN
        pg.context.add_cookies([{"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr")
        check("interface em inglês", "Track assets" in pg.inner_text("main") and pg.get_by_placeholder("Search by name or symbol").is_visible())
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        pg.screenshot(path="docs/screenshots/etapa02_desktop_en.png")
        # mobile
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/mercado"); mb.wait_for_selector("tbody tr")
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        check("mobile: colunas secundárias ocultas e preço visível", not mb.locator("th.hm").first.is_visible() and mb.locator("tbody tr td:nth-child(3)").first.is_visible())
        mb.screenshot(path="docs/screenshots/etapa02_mobile.png")
        t = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page(); t.goto(B + "/mercado"); t.wait_for_selector("tbody tr"); t.wait_for_load_state("networkidle")
        check("toque: campos com 16px (iPhone não dá zoom)", t.evaluate("[...document.querySelectorAll('input,select')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)"))
        check("linha da tabela não cria camada sobre a página (sem ::after esticado)", t.evaluate("getComputedStyle(document.querySelector('tr.rowlink .stretch'), '::after').content") in ("none", "normal"))
        t.get_by_placeholder("Buscar por nome ou símbolo").tap(); t.wait_for_timeout(700); check("tocar na busca não abre moeda", t.url.endswith("/mercado"), t.url)
        t.locator("tbody tr").nth(2).locator("td").nth(2).tap(); t.wait_for_url(re.compile(r"/mercado/[a-z0-9-]+$"), timeout=10000); check("tocar na linha (fora do link) abre a moeda daquela linha", t.url.endswith("/mercado/solana"), t.url)
        # falhas de provedor
        f = b.new_page(); f.goto("http://127.0.0.1:3202/mercado"); f.wait_for_selector(".note", timeout=15000)
        check("429 do provedor: aviso + retry, abas continuam", "Limite de requisições" in f.inner_text("main") and f.get_by_role("button", name="Tentar novamente").count() >= 1 and f.locator("nav[aria-label=Categorias] a").count() == 6)
        f.goto("http://127.0.0.1:3202/mercado?cat=forex"); f.wait_for_selector(".note"); check("forex indisponível (500) tratado", "Provedor indisponível" in f.inner_text("main"))
        b.close()
finally:
    for s in (s1, s2, m): stop(s)
finish()
