"""E2E (Playwright/Python): sobe o Next em modo produção contra o servidor mock e valida a página Início.
Uso: python tests/e2e/run.py   (requer `npm run build` prévio)"""
import subprocess, time, os, sys, signal, urllib.request
from playwright.sync_api import sync_playwright

R = []
def check(name, cond, extra=""):
    R.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

def start(port, env):
    e = {**os.environ, "PORT": str(port), "NEXT_TELEMETRY_DISABLED": "1", **env}
    p = subprocess.Popen(["npx", "next", "start", "-p", str(port)], env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setsid)
    for _ in range(60):
        try: urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2); return p
        except Exception: time.sleep(0.5)
    raise SystemExit("server did not start")
def stop(p): os.killpg(os.getpgid(p.pid), signal.SIGTERM)

mock = subprocess.Popen(["node", "tests/mock-server.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
srv1 = start(3101, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "test"})
srv2 = start(3102, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/rl", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/down", "NEWS_API_KEY": "test"})
srv3 = start(3103, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_PROVIDER": "newsapi"})  # NewsAPI sem chave → "não configurado" (o RSS é testado em news_rss.py)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # --- Cenário A: provedores OK ---
        pg = b.new_page(viewport={"width": 1440, "height": 900}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://127.0.0.1:3101/"); pg.wait_for_selector(".lrow", timeout=15000)
        txt = pg.inner_text("main")
        check("A: saudação genérica para visitante", "Bem-vindo ao TRADEON" in txt)
        check("A: destaque BTC e 5 ativos reais em 'Mercados hoje'", pg.locator(".lrow[data-asset]").count() == 5)
        check("A: preço BTC formatado", "US$" in txt and "64.000" in txt)
        check("A: ativo sem preço descartado (não vira zero)", "Null" not in txt and "NUL" not in txt)
        check("A: fonte e horário exibidos", "Fonte: CoinGecko" in txt and "Atualizado:" in txt)
        check("A: não marca como desatualizado", "Desatualizado" not in txt)
        check("A: mensagem de outras categorias pendentes", "ainda não configurada" in txt)
        check("A: notícias com fonte e link externo seguro", pg.locator("a[href^='https://exemplo.test'][rel*='noopener']").count() == 3)
        check("A: gráfico principal SVG", pg.locator("svg.linechart").count() == 1)
        check("A: sidebar com Início ativo", pg.locator("aside a.nav.on").inner_text().strip() == "Início")
        # favorito sem Supabase -> mensagem e estado revertido
        btn = pg.locator(".lrow button[aria-label='Favoritar']").first; btn.click(); pg.wait_for_selector(".fav-msg", timeout=5000)
        check("A: favorito reverte e informa 'contas não configuradas'", "não configuradas" in pg.inner_text(".lrow") and btn.inner_text() == "☆")
        # atualizar dados
        pg.get_by_role("button", name="Atualizar dados").click(); pg.wait_for_timeout(1200)
        check("A: atualizar dados mantém a página funcional", pg.locator(".lrow[data-asset]").count() == 5)
        # navegação
        pg.get_by_role("link", name="VIP").first.click(); pg.wait_for_url("**/vip"); pg.wait_for_function("document.querySelector('h1')?.innerText === 'VIP'", timeout=8000)
        check("A: VIP abre o hub (Calls VIP + módulos 'Em breve')", pg.get_by_test_id("vip-calls").is_visible() and pg.locator("aside a.nav.on").inner_text().strip() == "VIP")
        pg.get_by_role("link", name="Aprender").first.click(); pg.wait_for_url("**/aprender"); pg.wait_for_function("!!document.querySelector('h1')?.innerText.includes('Em breve')", timeout=8000)
        check("A: Aprender abre 'Em breve'", "Em breve" in pg.inner_text("h1"))
        pg.get_by_role("link", name="Voltar ao Início").click(); pg.wait_for_selector(".lrow")
        # tema e idioma
        pg.get_by_role("button", name="Alternar tema").click(); pg.wait_for_timeout(800)
        check("A: tema claro aplicado", pg.evaluate("document.documentElement.dataset.theme") == "light")
        pg.get_by_role("button", name="Alternar idioma").click(); pg.wait_for_function("document.documentElement.lang==='en' && document.querySelector('main').innerText.includes('Hello! Welcome')", timeout=10000)
        check("A: idioma EN aplicado", "Hello! Welcome" in pg.inner_text("main") and pg.evaluate("document.documentElement.lang") == "en")
        check("A: sem erros de JS", not errs, "; ".join(errs)[:200])
        pg.screenshot(path="tests/e2e/shot_desktop_light_en.png")
        # --- Mobile ---
        ctx = b.new_context(viewport={"width": 390, "height": 844}); m = ctx.new_page()
        m.goto("http://127.0.0.1:3101/"); m.wait_for_selector(".lrow", timeout=15000)
        check("A-mobile: barra inferior com 4 atalhos + 'Mais' visível", m.locator("#bn a").count() == 4 and m.get_by_test_id("bn-more").is_visible() and m.locator("#bn").is_visible())
        check("A-mobile: sidebar oculta", not m.locator("aside").is_visible())
        check("A-mobile: sem rolagem horizontal", not m.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        m.screenshot(path="tests/e2e/shot_mobile_dark.png", full_page=True)
        # --- Cenário B: provedores com falha (429 e 500) ---
        pb = b.new_page(viewport={"width": 1440, "height": 900}); pb.goto("http://127.0.0.1:3102/"); pb.wait_for_selector(".note", timeout=15000)
        t2 = pb.inner_text("main")
        check("B: limite de API (429) tratado", "Limite de requisições" in t2)
        check("B: provedor de notícias indisponível (500) tratado", "Provedor indisponível" in t2)
        check("B: nenhum dado inventado", "US$" not in t2)
        check("B: botão tentar novamente presente", pb.get_by_role("button", name="Tentar novamente").count() >= 1)
        check("B: página e navegação seguem funcionando", pb.get_by_role("link", name="Mercado").first.is_visible())
        pb.screenshot(path="tests/e2e/shot_providers_down.png")
        # --- Cenário C: sem chave de notícias ---
        pc = b.new_page(); pc.goto("http://127.0.0.1:3103/"); pc.wait_for_selector(".lrow", timeout=15000)
        check("C: sem NEWS_API_KEY mostra 'não configurado' e mercado continua", "Provedor não configurado" in pc.inner_text("main") and pc.locator(".lrow[data-asset]").count() == 5)
        # --- API ---
        r = pc.request.post("http://127.0.0.1:3103/api/favorites", data={"itemType": "x", "itemId": "a"}); check("API: favorito inválido -> 400", r.status == 400)
        r = pc.request.post("http://127.0.0.1:3103/api/favorites", data={"itemType": "asset", "itemId": "bitcoin"}); check("API: sem Supabase -> 503", r.status == 503)
        r = pc.request.post("http://127.0.0.1:3103/api/favorites", headers={"content-type": "application/json"}, data="{nao-json"); check("API: JSON inválido -> 400", r.status == 400)
        codes = [pc.request.post("http://127.0.0.1:3103/api/refresh").status for _ in range(5)]; check("API: refresh limita abuso (429)", 429 in codes, str(codes))
        b.close()
finally:
    for s in (srv1, srv2, srv3, mock): stop(s)
fails = [n for n, ok in R if not ok]
print(f"\n{len(R) - len(fails)}/{len(R)} e2e passaram"); sys.exit(1 if fails else 0)
