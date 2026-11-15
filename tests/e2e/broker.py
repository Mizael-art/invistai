"""E2E da conexão com corretoras (Bybit e Binance, somente leitura). Simuladores verificam a assinatura HMAC real.
Cobre: plano MAX, validação da chave, recusa de chave com saque, cifragem, visão da conta (saldos, P&L, posições, ordens,
histórico), isolamento entre contas e desconexão. Requer `npm run build`."""
import base64, json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t",
       "REGISTER_RATE_IP_PER_HOUR": "1000", "BILLING_DB_SECRET": "test-billing-secret-0123456789abcdef-0123", "BROKER_ENC_KEY": base64.b64encode(b"k" * 32).decode(),
       "BYBIT_BASE_URL": "http://127.0.0.1:4010/bybitx", "BINANCE_BASE_URL": "http://127.0.0.1:4010/bnx", "BINANCE_FAPI_BASE_URL": "http://127.0.0.1:4010/bnf"}
s1 = start(3977, ENV); B = "http://127.0.0.1:3977"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
_n = [9300]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=15000); pg.wait_for_load_state("networkidle")
def go(pg, path, sel="main h1"): pg.goto(B + path); pg.wait_for_selector(sel, timeout=25000); pg.wait_for_load_state("networkidle")
def connect(pg, ex, key, secret, label="", expect_ok=True):
    go(pg, "/corretora?c=new", "[data-testid=bk-form]"); pg.click(f"label:has(input[value={ex}])")
    pg.fill("[data-testid=bk-key]", key); pg.fill("[data-testid=bk-secret]", secret)
    if label: pg.fill("[data-testid=bk-label]", label)
    pg.click("[data-testid=bk-connect]")
    if expect_ok: pg.wait_for_selector("[data-testid=bk-account]", timeout=25000); pg.wait_for_load_state("networkidle")
    else: pg.wait_for_selector("[data-testid=bk-err]", timeout=15000)
def api(pg, method, path, body=None): return pg.evaluate("([m,p,b])=>fetch(p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>[r.status,await r.text()])", [method, path, body])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        mk("/__reset")
        uP, uM, uO = fresh(), fresh(), fresh(); mk(f"/__set_plan?email={uP}&plan=pro"); mk(f"/__set_plan?email={uM}&plan=max"); mk(f"/__set_plan?email={uO}&plan=max")
        P = b.new_context(viewport={"width": 1440, "height": 900}); pp = P.new_page(); login(pp, uP)
        go(pp, "/corretora"); check("PRO: convite do plano MAX, sem formulário", pp.get_by_test_id("paywall").is_visible() and pp.locator("[data-testid=bk-form]").count() == 0)
        st = api(pp, "POST", "/api/broker", {"exchange": "bybit", "apiKey": "TESTKEYBYBIT0001", "apiSecret": "TESTSECRETBYBIT0001"})
        check("PRO: API de conexão bloqueada (403 plan_required)", st[0] == 403 and "plan_required" in st[1])
        M = b.new_context(viewport={"width": 1440, "height": 900}); pm = M.new_page(); pm.on("pageerror", lambda e: errs.append(str(e)[:80])); pm.on("dialog", lambda d: d.accept()); login(pm, uM)
        go(pm, "/corretora", "[data-testid=bk-form]")
        check("MAX sem conexão: formulário com passo a passo de chave somente leitura", "SOMENTE LEITURA" in pm.inner_text("[data-testid=bk-form]") and "Saque" in pm.inner_text("[data-testid=bk-form]"))
        connect(pm, "bybit", "BADKEY0000000001", "BADSECRET00000001", expect_ok=False)
        check("chave inválida: mensagem clara e nada salvo", "inválidos" in pm.get_by_test_id("bk-err").inner_text() and json.loads(mk("/__brokers")) == [])
        connect(pm, "bybit", "WITHDRAWKEY00001", "WITHDRAWSECRET0001", expect_ok=False)
        check("chave com permissão de SAQUE é recusada", "SAQUE" in pm.get_by_test_id("bk-err").inner_text() and json.loads(mk("/__brokers")) == [])
        connect(pm, "bybit", "TESTKEYBYBIT0001", "TESTSECRETBYBIT0001", label="Principal")
        rows = json.loads(mk("/__brokers")); r0 = rows[0]
        check("conexão salva com credenciais CIFRADAS (nunca em texto puro)", len(rows) == 1 and r0["key_enc"].startswith("v1:") and "TESTKEY" not in r0["key_enc"] and "TESTSECRET" not in r0["secret_enc"] and r0["key_hint"] == "TEST…0001")
        html = pm.content()
        check("página nunca contém a chave nem o segredo", "TESTKEYBYBIT0001" not in html and "TESTSECRETBYBIT0001" not in html and "v1:" not in html)
        t = pm.get_by_test_id("bk-account").inner_text()
        check("status: conectada, leitura, saque bloqueado, dica da chave", all(x in t for x in ["Conectada", "Leitura", "Saque bloqueado", "TEST…0001"]))
        check("patrimônio e disponível da Bybit", "10.523,45" in pm.get_by_test_id("bk-equity").inner_text() and "8.123,10" in t)
        check("P&L não realizado (+123,45) e realizado 7 dias (48,20 − 10,70 = +37,50)", "+123,45" in pm.get_by_test_id("bk-upnl").inner_text() and "+37,50" in pm.get_by_test_id("bk-rpnl").inner_text())
        pos = pm.get_by_test_id("bk-positions").inner_text()
        check("posição aberta: BTCUSDT LONG 10x, entrada, marca, P&L e %", all(x in pos for x in ["BTCUSDT", "LONG", "10x", "62.000", "64.469", "+123,45"]) and "ETHUSDT" not in pos, pos[:200])
        check("saldos com valor em US$ (zerados ocultos)", "USDT" in pm.get_by_test_id("bk-balances").inner_text() and "1.923,45" in pm.get_by_test_id("bk-balances").inner_text() and "ETH" not in pm.get_by_test_id("bk-balances").inner_text())
        check("ordem aberta e P&L realizado listados", "SOLUSDT" in pm.get_by_test_id("bk-orders").inner_text() and "−10,70".replace("−", "-") in pm.get_by_test_id("bk-closed").inner_text())
        tr = pm.get_by_test_id("bk-trades").inner_text(); check("histórico de trades (futuros e spot)", "Futuros USDT" in tr and "Spot" in tr and tr.count("BTCUSDT") >= 2)
        # Binance
        connect(pm, "binance", "TESTKEYBINANCE01", "TESTSECRETBINANCE1", label="Bin")
        check("Binance: duas conexões em abas", pm.locator("[data-testid=bk-tabs] a").count() == 3)
        check("Binance: patrimônio spot (640 + 520) + futuros (974,50) = 2.134,50", "2.134,50" in pm.get_by_test_id("bk-equity").inner_text(), pm.get_by_test_id("bk-equity").inner_text())
        check("Binance: posição SHORT ETHUSDT 5x com P&L negativo e P&L realizado +15,25", "SHORT" in pm.get_by_test_id("bk-positions").inner_text() and "-25,50" in pm.get_by_test_id("bk-positions").inner_text() and "+15,25" in pm.get_by_test_id("bk-rpnl").inner_text())
        connect(pm, "binance", "BNWITHDRAWKEY001", "BNWITHDRAWSECRET1", expect_ok=False); check("Binance com saque habilitado é recusada", "SAQUE" in pm.get_by_test_id("bk-err").inner_text())
        # isolamento
        cid = json.loads(mk("/__brokers"))[0]["id"]
        O = b.new_context(); po = O.new_page(); login(po, uO)
        st = api(po, "GET", f"/api/broker/{cid}"); check("outra conta não lê a conexão de terceiros (404)", st[0] == 404 and "10523" not in st[1])
        check("outra conta não apaga a conexão de terceiros", api(po, "DELETE", f"/api/broker/{cid}")[0] == 404 and len(json.loads(mk("/__brokers"))) == 2)
        st = api(pm, "GET", f"/api/broker/{cid}"); j = json.loads(st[1])
        check("API de leitura do dono: dados sem segredos", st[0] == 200 and j["equityUsd"] == 10523.45 and "TESTSECRET" not in st[1] and "key_enc" not in st[1])
        check("bots não podem usar chave somente leitura", api(pm, "PATCH", f"/api/broker/{cid}", {"bots_allowed": True})[0] == 400)
        # desconectar
        go(pm, f"/corretora?c={cid}", "[data-testid=bk-account]"); pm.click("[data-testid=bk-delete]"); pm.wait_for_url(re.compile(r"/corretora$"), timeout=15000); pm.wait_for_load_state("networkidle")
        check("desconectar apaga credenciais e conexão", len(json.loads(mk("/__brokers"))) == 1 and all(x["exchange"] == "binance" for x in json.loads(mk("/__brokers"))))
        mb = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True).new_page(); login(mb, uM); go(mb, "/corretora", "[data-testid=bk-account]")
        check("mobile: sem rolagem horizontal", mb.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(m); stop(sb)
finish()
