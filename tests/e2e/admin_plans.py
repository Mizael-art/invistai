"""E2E: admin troca o plano de usuários (cortesia PRO/MAX, sem cobrança) e o painel admin no celular sem cortes. Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "REGISTER_RATE_IP_PER_HOUR": "1000"}
s1 = start(3976, ENV); B = "http://127.0.0.1:3976"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
_n = [9500]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=15000); pg.wait_for_load_state("networkidle")
def go(pg, path, sel="main h1"): pg.goto(B + path); pg.wait_for_selector(sel, timeout=25000); pg.wait_for_load_state("networkidle")
def api(pg, method, path, body=None): return pg.evaluate("([m,p,b])=>fetch(p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>[r.status,await r.text()])", [method, path, body])
def row(pg, email): return pg.locator("[data-testid=adm-users] tr", has_text=email)
def set_plan(pg, email, plan, days=None):
    r = row(pg, email); r.get_by_test_id("adm-plan-sel").select_option(plan)
    if days is not None: r.get_by_test_id("adm-plan-days").select_option(days)
    r.get_by_test_id("adm-plan-apply").click(); pg.wait_for_timeout(600); pg.wait_for_load_state("networkidle")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        mk("/__reset")
        uA, uF, uP = fresh(), fresh(), fresh(); mk(f"/__set_plan?email={uA}&plan=free"); mk(f"/__set_admin?email={uA}"); mk(f"/__set_plan?email={uF}&plan=free"); mk(f"/__set_plan?email={uP}&plan=pro")
        A = b.new_context(viewport={"width": 1440, "height": 900}); pa = A.new_page(); pa.on("pageerror", lambda e: errs.append(str(e)[:80])); pa.on("dialog", lambda d: d.accept()); login(pa, uA)
        F = b.new_context(); pf = F.new_page(); login(pf, uF); P2 = b.new_context(); login(P2.new_page(), uP)
        go(pf, "/corretora"); check("FREE antes: sem acesso ao recurso MAX", pf.get_by_test_id("paywall").is_visible())
        check("usuário comum não altera plano pela API (403)", api(pf, "POST", "/api/admin/users/00000000-0000-4000-8000-000000000000", {"plan": "max"})[0] == 403)
        go(pa, "/admin/usuarios", "[data-testid=adm-users]")
        check("Aplicar desabilitado sem mudança", row(pa, uF).get_by_test_id("adm-plan-apply").is_disabled())
        set_plan(pa, uF, "max", "30")
        check("admin libera MAX por 30 dias: selo MAX e origem 'cortesia até …'", row(pa, uF).get_by_test_id("adm-plan-badge").inner_text() == "MAX" and "cortesia MAX até" in row(pa, uF).get_by_test_id("adm-plan-src").inner_text(), row(pa, uF).inner_text()[:200])
        aud = [a for a in json.loads(mk("/__calls"))["audit"] if a["action"].startswith("plan.")]
        check("ação registrada na auditoria (plan.grant, 30 dias)", len(aud) == 1 and aud[0]["action"] == "plan.grant" and aud[0]["details"]["days"] == 30)
        bill = json.loads(mk("/__billing")); check("nenhum pagamento nem assinatura paga criados (não simula cobrança)", bill["payments"] == [] and not any(x["plan_id"] == "max" for x in bill["subs"].values()))
        go(pf, "/corretora", "main h1"); check("usuário passa a ter o recurso MAX na hora", pf.locator("[data-testid=paywall]").count() == 0 and pf.locator("[data-testid=bk-form]").count() == 1)
        go(pf, "/assinatura", "[data-testid=cur-plan]"); check("assinatura mostra Max e aviso 'liberado pela equipe, sem cobrança'", pf.get_by_test_id("cur-plan").inner_text() == "Max" and "sem cobrança" in pf.get_by_test_id("plan-grant").inner_text())
        go(pa, "/admin/usuarios", "[data-testid=adm-users]"); set_plan(pa, uF, "pro")
        check("troca para PRO sem prazo", row(pa, uF).get_by_test_id("adm-plan-badge").inner_text() == "PRO" and "sem prazo" in row(pa, uF).get_by_test_id("adm-plan-src").inner_text())
        go(pf, "/corretora"); check("PRO volta a ver o convite do MAX", pf.get_by_test_id("paywall").is_visible())
        go(pa, "/admin/usuarios", "[data-testid=adm-users]"); set_plan(pa, uF, "free")
        check("Free retira a cortesia", row(pa, uF).get_by_test_id("adm-plan-badge").inner_text() == "FREE")
        set_plan(pa, uP, "max")
        check("assinante PRO pago recebe MAX: mostra cortesia e pago", row(pa, uP).get_by_test_id("adm-plan-badge").inner_text() == "MAX" and "pago PRO" in row(pa, uP).get_by_test_id("adm-plan-src").inner_text())
        set_plan(pa, uP, "free"); check("retirar cortesia mantém a assinatura paga (PRO)", row(pa, uP).get_by_test_id("adm-plan-badge").inner_text() == "PRO")
        r = api(pa, "POST", "/api/admin/users/00000000-0000-4000-8000-000000000000", {"plan": "gold"}); check("plano inválido recusado (400)", r[0] == 400)
        check("prazo inválido recusado (400)", api(pa, "POST", "/api/admin/users/00000000-0000-4000-8000-000000000000", {"plan": "pro", "days": 0})[0] == 400)
        # celular: abas e páginas do admin sem corte
        M = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True); pm = M.new_page(); pm.on("dialog", lambda d: d.accept()); login(pm, uA)
        for path in ["/admin", "/admin/calls", "/admin/ia", "/admin/usuarios"]:
            go(pm, path, "main h1")
            ok = pm.evaluate("""() => { const w = innerWidth; const main = document.querySelector('main'); const nav = document.querySelector('nav.ctabs[aria-label=Administração]');
              const navOk = nav && nav.getBoundingClientRect().right <= w + 1 && nav.getBoundingClientRect().left >= -1;
              const wide = [...main.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); if (!r.width) return false; let p = e.parentElement; while (p && p !== main) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) return false; p = p.parentElement } return r.right > w + 1 });
              return document.documentElement.scrollWidth <= w + 1 && navOk && wide.length === 0 ? 'ok' : 'nav=' + navOk + ' wide=' + wide.slice(0, 3).map(e => e.tagName + '.' + e.className).join(',') }""")
            check(f"mobile sem corte: {path}", ok == "ok", ok)
        check("mobile: troca de plano utilizável no celular", row(pm, uF).get_by_test_id("adm-plan-sel").is_visible() and row(pm, uF).get_by_test_id("adm-plan-apply").bounding_box()["x"] + row(pm, uF).get_by_test_id("adm-plan-apply").bounding_box()["width"] <= 391)
        pm.screenshot(path="/tmp/claude-0/-home-claude/b159cd62-d4ba-5c1c-be75-ae988aec0a97/scratchpad/adm_users_mobile.png", full_page=True)
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(m); stop(sb)
finish()
