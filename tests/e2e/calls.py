"""E2E das Calls VIP e do painel administrativo (ecossistema, Etapa 3). Mock do Supabase com RLS e funções admin_* simuladas.
Fluxo real pela interface: admin cria/publica → assinante PRO vê e é notificado → alvos/encerramento → estatísticas. Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "REGISTER_RATE_IP_PER_HOUR": "1000"}
s1 = start(3981, ENV); B = "http://127.0.0.1:3981"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def state(): return json.loads(mk("/__calls"))
_n = [7100]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=15000); pg.wait_for_load_state("networkidle")
def go(pg, path, sel="main h1"): pg.goto(B + path); pg.wait_for_selector(sel, timeout=20000); pg.wait_for_load_state("networkidle")
def api(pg, method, path, body=None): return pg.evaluate("([m,p,b])=>fetch(p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>[r.status,await r.json().catch(()=>({}))])", [method, path, body])
def new_call(pg, sym, direction, entry, stop, tps, lev="", market="crypto_futures", analyst="Analista Teste (CNPI 0000)", publish=True):
    go(pg, "/admin/calls/nova", "[data-testid=f-symbol]")
    pg.fill("[data-testid=f-symbol]", sym); pg.select_option("[data-testid=f-market]", market); pg.click(f"label:has([data-testid=f-dir-{direction}])")
    pg.fill("[data-testid=f-entry]", entry); pg.fill("[data-testid=f-stop]", stop)
    for i, t in enumerate(tps): pg.fill(f"[data-testid=f-tp{i + 1}]", t)
    if lev: pg.fill("[data-testid=f-leverage]", lev)
    pg.fill("[data-testid=f-analyst]", analyst)
    pg.wait_for_function("document.querySelector('[data-testid=f-preview]')?.innerText.includes('NOVA CALL')", timeout=15000)   # formulário hidratado (pré-visualização ao vivo)
    pg.click("[data-testid=f-publish]" if publish else "[data-testid=f-draft]"); pg.wait_for_selector("[data-testid=adm-ok]", timeout=25000)
    return pg.url.split("/admin/calls/")[1].split("?")[0]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        mk("/__reset")
        A = b.new_context(viewport={"width": 1440, "height": 900}); pa = A.new_page(); pa.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pa.url)); pa.on("dialog", lambda d: d.accept())
        F = b.new_context(viewport={"width": 1440, "height": 900}); pf = F.new_page(); pf.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pf.url))
        P = b.new_context(viewport={"width": 1440, "height": 900}); pp = P.new_page(); pp.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pp.url))
        # visitante
        pf.goto(B + "/calls"); pf.wait_for_url(re.compile("/login")); check("visitante em /calls → login", "next=%2Fcalls" in pf.url)
        uA, uF, uP = fresh(), fresh(), fresh(); mk(f"/__set_admin?email={uA}"); mk(f"/__set_plan?email={uP}&plan=pro"); mk(f"/__set_plan?email={uF}&plan=free")
        login(pa, uA); login(pf, uF); login(pp, uP)
        # FREE
        go(pf, "/vip"); check("hub VIP: Calls VIP marcado PRO · MAX para o FREE e módulos futuros como 'Em breve'", "PRO · MAX" in pf.get_by_test_id("vip-calls").inner_text() and "Em breve" in pf.get_by_test_id("vip-bots").inner_text())
        go(pf, "/calls"); check("FREE em /calls: convite de assinatura, sem nenhuma call", pf.get_by_test_id("paywall").is_visible() and pf.locator("[data-testid=cv-card]").count() == 0)
        pf.goto(B + "/admin"); check("FREE em /admin: área inexistente (404)", "404" in pf.inner_text("body") or "não encontrada" in pf.inner_text("body").lower())
        check("FREE não cria call pela API (403)", api(pf, "POST", "/api/admin/calls", {"call": {"market": "crypto_spot", "symbol": "BTC", "direction": "long", "entry": 1, "stop": 0.5, "tp1": 2}})[0] == 403)
        pf.click("header .um-btn, header [aria-haspopup=menu]") if pf.locator("header [aria-haspopup=menu]").count() else None
        check("FREE: sem link de administração no menu", pf.locator("[data-testid=um-admin]").count() == 0)
        # ADMIN: painel
        go(pa, "/admin"); check("admin: visão geral com indicadores do banco", pa.get_by_test_id("adm-kpis").is_visible() and "Receita recorrente" in pa.inner_text("main"))
        pa.locator("header [aria-haspopup=menu]").first.click(); check("admin: link 'Administração' no menu do usuário", pa.locator("[data-testid=um-admin]").is_visible()); pa.keyboard.press("Escape")
        # formulário: validação ao vivo e pré-visualização
        go(pa, "/admin/calls/nova", "[data-testid=f-symbol]")
        pa.fill("[data-testid=f-symbol]", "btc/usdt"); pa.fill("[data-testid=f-entry]", "95000"); pa.fill("[data-testid=f-stop]", "96000"); pa.fill("[data-testid=f-tp1]", "96000")
        check("validação ao vivo: stop do lado errado em LONG", "stop deve ficar abaixo da entrada" in pa.inner_text("form"))
        pa.fill("[data-testid=f-stop]", "93000"); pa.fill("[data-testid=f-tp2]", "97000"); pa.fill("[data-testid=f-tp3]", "98000"); pa.fill("[data-testid=f-tp4]", "100000"); pa.fill("[data-testid=f-leverage]", "10")
        pv = pa.get_by_test_id("f-preview").inner_text()
        check("pré-visualização no formato de publicação", all(x in pv for x in ["🚨 NOVA CALL", "💸 LONG — BTC/USDT", "📍 Entry: 95000", "TP4: 100000", "🛑 Stop: 93000", "⚡ Alavancagem: 10x"]), pv[:120])
        pa.select_option("[data-testid=f-market]", "crypto_spot"); check("alavancagem no spot é bloqueada", "Alavancagem só para" in pa.inner_text("form"))
        c1 = new_call(pa, "btc/usdt", "long", "95000", "93000", ["96000", "97000", "98000", "100000"], lev="10")
        st = state(); call1 = [c for c in st["calls"] if c["id"] == c1][0]
        check("publicar pelo painel: call ativa no banco", call1["status"] == "active" and call1["symbol"] == "BTC/USDT" and call1["leverage"] == 10)
        check("auditoria administrativa: criação e publicação", [a["action"] for a in st["audit"] if a["target_id"] == c1] == ["vip_call.create", "vip_call.publish"])
        check("assinantes PRO notificados; FREE não", len(st["notifs"]) == 1 and st["notifs"][0]["title"] == "Nova call: LONG BTC/USDT" and st["notifs"][0]["target"] == f"/calls/{c1}")
        d1 = new_call(pa, "SOL/USDT", "long", "150", "140", ["160"], market="crypto_spot", publish=False)
        # PRO
        go(pp, "/calls"); cards = pp.locator("[data-testid=cv-card]")
        check("PRO vê a call ativa (rascunho oculto)", cards.count() == 1 and "BTC/USDT" in cards.first.inner_text() and "SOL" not in pp.inner_text("main"))
        t = cards.first.inner_text()
        check("cartão no estilo da referência: LONG, entrada, stop, TP1–TP4, alavancagem, em andamento", all(x in t for x in ["LONG", "95.000", "93.000", "TP4", "100.000", "10x", "Em andamento"]), t[:200])
        pp.goto(B + f"/calls/{d1}"); pp.wait_for_load_state("networkidle"); check("PRO não acessa o rascunho pela URL (página não encontrada)", pp.locator("[data-testid=cv-card]").count() == 0 and "SOL/USDT" not in pp.inner_text("body"))
        go(pp, "/notificacoes"); check("notificação da nova call na central", "Nova call: LONG BTC/USDT" in pp.inner_text("main"))
        go(pp, f"/calls/{c1}"); lv = pp.get_by_test_id("cv-levels").inner_text()
        check("detalhe: níveis com R/R (0.50 / 1.00 / 1.50 / 2.50)", all(x in lv for x in ["0.50", "1.00", "1.50", "2.50"]), lv[:160])
        check("detalhe: responsável técnico, histórico e aviso de risco", "Analista Teste" in pp.get_by_test_id("cv-analyst").inner_text() and "Publicada" in pp.get_by_test_id("cv-timeline").inner_text() and "não é instituição autorizada" in pp.inner_text("main"))
        check("aviso de alavancagem elevada", "Alavancagem elevada" in pp.inner_text("main"))
        # ADMIN: edição de call ativa com motivo
        go(pa, f"/admin/calls/{c1}", "[data-testid=call-actions]")
        pa.fill("[data-testid=f-notes]", "Entrada na retomada do suporte."); pa.fill("[data-testid=f-edit-note]", "Observação adicionada"); pa.click("[data-testid=f-save]"); pa.wait_for_url(re.compile("ok=saved"))
        go(pp, f"/calls/{c1}"); check("edição de call ativa aparece no histórico do assinante", "Editada" in pp.get_by_test_id("cv-timeline").inner_text() and "Observação adicionada" in pp.inner_text("main") and "retomada do suporte" in pp.inner_text("main"))
        # alvos e encerramento
        go(pa, f"/admin/calls/{c1}", "[data-testid=call-actions]")
        pa.click("[data-testid=a-tp]"); pa.wait_for_function("document.querySelector('[data-testid=a-tp]')?.innerText.includes('TP2')", timeout=10000)
        pa.click("[data-testid=a-tp]"); pa.wait_for_function("document.querySelector('[data-testid=a-tp]')?.innerText.includes('TP3')", timeout=10000)
        check("alvos registrados em ordem (TP1, TP2)", [c for c in state()["calls"] if c["id"] == c1][0]["targets_hit"] == 2)
        pa.select_option("[data-testid=a-reason]", "targets"); pa.fill("[data-testid=a-fees]", "0.1"); pa.click("[data-testid=a-close]"); pa.wait_for_selector("[data-testid=call-actions]", state="detached", timeout=10000)
        call1 = [c for c in state()["calls"] if c["id"] == c1][0]
        check("encerramento por alvos: saída no TP2, bruto +21,0526% e líquido +20,0526% (10x, custo 0,1%)", call1["exit_price"] == 97000 and call1["gross_result_pct"] == 21.0526 and call1["net_result_pct"] == 20.0526, json.dumps({k: call1[k] for k in ["exit_price", "gross_result_pct", "net_result_pct"]}))
        c2 = new_call(pa, "ETH/USDT", "short", "3000", "3100", ["2900", "2800"], market="crypto_spot")
        go(pa, f"/admin/calls/{c2}", "[data-testid=call-actions]"); pa.select_option("[data-testid=a-reason]", "stop"); pa.click("[data-testid=a-close]"); pa.wait_for_selector("[data-testid=call-actions]", state="detached", timeout=10000)
        c3 = new_call(pa, "XRP/USDT", "long", "0.6", "0.55", ["0.65"], market="crypto_spot")
        go(pa, f"/admin/calls/{c3}", "[data-testid=call-actions]"); pa.fill("[data-testid=a-note]", "Condição invalidada"); pa.click("[data-testid=a-cancel]"); pa.wait_for_selector("[data-testid=call-actions]", state="detached", timeout=10000)
        # PRO: histórico, resultados, filtros
        go(pp, "/calls?tab=historico"); h = pp.inner_text("main")
        check("histórico: encerradas e canceladas com resultado registrado", pp.locator("[data-testid=cv-card]").count() == 3 and "+21,05%" in h and "−3,33%" in h.replace("-", "−") and "Cancelada" in h, h[:300])
        go(pp, "/calls?tab=historico&symbol=ETH"); check("filtro por ativo", pp.locator("[data-testid=cv-card]").count() == 1 and "ETH/USDT" in pp.inner_text("[data-testid=cv-card]"))
        go(pp, "/calls?tab=historico&market=crypto_futures"); check("filtro por mercado", pp.locator("[data-testid=cv-card]").count() == 1 and "BTC/USDT" in pp.inner_text("[data-testid=cv-card]"))
        go(pp, "/calls?tab=resultados"); r = pp.get_by_test_id("cv-results").inner_text()
        check("resultados: 2 encerradas (1 positiva, 1 negativa), cancelada fora", re.search(r"Encerradas\s*2", r) and re.search(r"Positivas\s*1", r) and re.search(r"Negativas\s*1", r), r[:300])
        check("taxa com critério explícito (50%) e média bruta", pp.get_by_test_id("cv-rate").inner_text() == "50%" and pp.get_by_test_id("cv-avg").inner_text() == "+8,86%", pp.get_by_test_id("cv-avg").inner_text())
        check("líquido só com custos informados (1 de 2) e critérios transparentes", "1 de 2 encerradas com custos informados" in r and "canceladas ficam fora" in pp.get_by_test_id("cv-criteria").inner_text())
        go(pp, "/calls"); check("aba Ativas vazia após encerramentos (estado vazio objetivo)", pp.get_by_test_id("cv-empty").is_visible())
        # PRO não consegue usar ações administrativas
        check("PRO não encerra call pela API (403)", api(pp, "POST", f"/api/admin/calls/{c1}", {"action": "cancel"})[0] == 403)
        # usuários: conceder e remover admin
        go(pa, "/admin/usuarios", "[data-testid=adm-users]")
        row = pa.locator("[data-testid=adm-users] tr", has_text=uP); row.get_by_test_id("adm-toggle").click(); pa.wait_for_timeout(800); pa.reload(); pa.wait_for_selector("[data-testid=adm-users]")
        check("conceder admin pela lista de usuários (auditado)", "admin" in pa.locator("[data-testid=adm-users] tr", has_text=uP).inner_text() and any(a["action"] == "admin.grant" for a in state()["audit"]))
        check("admin não pode remover a si mesmo", pa.locator("[data-testid=adm-users] tr", has_text=uA).get_by_test_id("adm-toggle").is_disabled())
        go(pp, "/admin"); check("novo admin acessa o painel", pp.get_by_test_id("adm-kpis").is_visible())
        go(pa, "/admin"); check("auditoria recente lista as ações", pa.locator("[data-testid=adm-audit] tr").count() >= 8)
        # mobile
        M = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True); pm = M.new_page(); login(pm, uP)
        for path in ["/calls?tab=historico", f"/calls/{c1}", "/calls?tab=resultados", "/admin/calls/nova"]:
            go(pm, path, "main h1"); check(f"mobile sem rolagem horizontal: {path.split('?')[0]}", pm.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(m); stop(sb)
finish()
