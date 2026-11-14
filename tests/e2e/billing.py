"""E2E de Assinaturas (ecossistema, Etapa 1). Mock do Supabase (Auth + REST/RPC) e mock da API da Stripe (porta 4010/stripe).
O webhook é assinado aqui com o mesmo HMAC-SHA256 da Stripe — sem assinatura válida nada muda. Requer `npm run build`."""
import json, re, subprocess, os, time, hmac, hashlib, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
from common import *

WH = "whsec_test_e2e_0123456789"
m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE_ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "REGISTER_RATE_IP_PER_HOUR": "1000"}
ENV = {**BASE_ENV, "STRIPE_SECRET_KEY": "sk_test_e2e", "STRIPE_WEBHOOK_SECRET": WH, "STRIPE_PRICE_PRO": "price_pro_test", "STRIPE_PRICE_MAX": "price_max_test",
       "STRIPE_API_BASE": "http://127.0.0.1:4010/stripe", "BILLING_DB_SECRET": "test-billing-secret-0123456789abcdef-0123"}
s1 = start(3961, ENV); B = "http://127.0.0.1:3961"
s2 = start(3962, BASE_ENV); B2 = "http://127.0.0.1:3962"            # sem credenciais da Stripe
def get(url): return urllib.request.urlopen(url).read().decode()
def mk(path): return get("http://127.0.0.1:4020" + path)
def billing(): return json.loads(mk("/__billing"))
def stripe_state(): return json.loads(get("http://127.0.0.1:4010/stripe/__state"))
def put_sub(o): urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:4010/stripe/__sub", data=json.dumps(o).encode(), method="POST"))
def hook(ev, secret=WH, ts=None, base=B):
    body = json.dumps(ev); t = str(ts or int(time.time()))
    sig = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(base + "/api/billing/webhook", data=body.encode(), method="POST", headers={"content-type": "application/json", "stripe-signature": f"t={t},v1={sig}"})
    try: r = urllib.request.urlopen(req); return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode() or "{}")
_n = [3400]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email, base=B):
    pg.goto(base + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(base + "/", timeout=15000); pg.wait_for_load_state("networkidle")
def page(pg, qs="", base=B): pg.goto(base + "/assinatura" + qs); pg.wait_for_selector("[data-testid=sub-summary]", timeout=20000); pg.wait_for_load_state("networkidle")
def api(pg, path, body=None): return pg.evaluate("([p,b])=>fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>[r.status,await r.json().catch(()=>({}))])", [path, body])
NOW = int(time.time())
def sub_obj(sid, cust, user, price="price_pro_test", status="active", end=NOW + 30 * 86400, **kw):
    return {"id": sid, "object": "subscription", "customer": cust, "status": status, "start_date": NOW, "cancel_at_period_end": kw.get("cancel", False), "canceled_at": kw.get("canceled_at"),
            "metadata": {"user_id": user}, "items": {"data": [{"price": {"id": price}, "current_period_start": NOW, "current_period_end": end}]}}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        mk("/__reset"); get("http://127.0.0.1:4010/stripe/__reset")
        # visitante
        pg.goto(B + "/assinatura"); pg.wait_for_url(re.compile("/login")); check("visitante em /assinatura → /login?next=", "next=%2Fassinatura" in pg.url)
        st = pg.evaluate("()=>fetch('/api/ai/quota').then(r=>r.status)"); check("cota da IA exige sessão (401)", st == 401)
        st = api(pg, "/api/billing/checkout", {"plan": "pro"}); check("checkout sem sessão → 401", st[0] == 401, str(st))
        # conta nova: FREE
        uA = fresh(); login(pg, uA); page(pg)
        check("conta nova nasce no FREE (servidor)", pg.get_by_test_id("cur-plan").inner_text() == "Free")
        check("cota exibida: 0 de 3 mensagens", "0" in pg.get_by_test_id("ai-quota").inner_text() and "3" in pg.get_by_test_id("ai-quota").inner_text(), pg.get_by_test_id("ai-quota").inner_text())
        check("três planos com preços reais (R$ 0, R$ 30, R$ 50)", pg.locator(".plan").count() == 3 and all(x in pg.inner_text(".plan-grid").replace(" ", " ") for x in ["R$ 0", "R$ 30", "R$ 50"]))
        check("sem pagamentos: estado vazio (nenhum fictício)", pg.get_by_test_id("no-payments").is_visible())
        q = pg.evaluate("()=>fetch('/api/ai/quota').then(r=>r.json())"); check("API de cota: free, limite 3, restante 3", q.get("plan") == "free" and q.get("limit") == 3 and q.get("remaining") == 3, str(q))
        # validações do checkout
        check("checkout: plano inválido → 400", api(pg, "/api/billing/checkout", {"plan": "free"})[0] == 400)
        check("checkout: campo extra rejeitado → 400", api(pg, "/api/billing/checkout", {"plan": "pro", "price": "price_hack"})[0] == 400)
        cross = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", B + "/api/billing/checkout", "-H", "origin: https://evil.example", "-H", "content-type: application/json", "-d", '{"plan":"pro"}'], capture_output=True, text=True).stdout
        check("checkout de outra origem → 403", cross == "403", cross)
        # clique em Assinar PRO → redireciona ao Checkout da Stripe (interceptado)
        get("http://127.0.0.1:4010/stripe/__reset")
        pg.route("https://checkout.stripe.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<h1>Stripe Checkout (teste)</h1>"))
        page(pg); pg.get_by_test_id("subscribe-pro").click(); pg.wait_for_url(re.compile(r"^https://checkout\.stripe\.test/"), timeout=15000)
        cs = stripe_state()["checkouts"]; f = cs[-1]["form"] if cs else {}
        check("Assinar PRO → sessão de Checkout criada no servidor e redirecionamento", len(cs) == 1 and f.get("mode") == "subscription" and f.get("line_items[0][price]") == "price_pro_test", json.dumps(f)[:200])
        check("checkout leva o usuário, a URL de retorno e chave de idempotência", re.fullmatch(r"[0-9a-f-]{36}", f.get("client_reference_id", "")) and f.get("success_url", "").endswith("/assinatura?checkout=success") and cs[-1]["idem"])
        user = f.get("client_reference_id")
        # voltar do checkout NÃO libera nada sozinho
        page(pg, "?checkout=success")
        check("retorno 'success' sem webhook: continua FREE (front não aprova pagamento)", pg.get_by_test_id("cur-plan").inner_text() == "Free" and pg.get_by_test_id("checkout-success").is_visible())
        # webhooks inválidos
        ev = {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {"mode": "subscription", "client_reference_id": user, "customer": "cus_A", "subscription": "sub_A"}}}
        check("webhook com assinatura inválida → 400 e nada muda", hook(ev, secret="whsec_errado")[0] == 400 and not billing()["webhookEvents"])
        check("webhook com timestamp antigo (replay) → 400", hook(ev, ts=int(time.time()) - 3600)[0] == 400)
        req = urllib.request.Request(B + "/api/billing/webhook", data=json.dumps(ev).encode(), method="POST", headers={"content-type": "application/json"})
        try: urllib.request.urlopen(req); code = 200
        except urllib.error.HTTPError as e: code = e.code
        check("webhook sem cabeçalho de assinatura → 400", code == 400)
        # webhook válido: checkout concluído → busca a assinatura na Stripe e libera PRO
        put_sub(sub_obj("sub_A", "cus_A", user))
        st = hook(ev); bl = billing()
        check("webhook válido: 200 e plano PRO ativo no banco", st[0] == 200 and bl["subs"][user]["plan_id"] == "pro" and bl["subs"][user]["status"] == "active", str(st))
        st2 = hook(ev); check("mesmo evento reenviado: idempotente (duplicate) e sem novo histórico", st2[1].get("duplicate") is True and len([e for e in billing()["subEvents"] if e["user_id"] == user]) == 1, str(st2))
        page(pg); check("página mostra PRO, status Ativa e IA ilimitada", pg.get_by_test_id("cur-plan").inner_text() == "Pro" and "Ativ" in pg.get_by_test_id("cur-status").inner_text() and "lim" in pg.get_by_test_id("ai-quota").inner_text().lower(), pg.get_by_test_id("ai-quota").inner_text())
        check("com assinatura: botão de gerenciar (Portal) em vez de novo checkout", pg.get_by_test_id("portal").is_visible() and pg.get_by_test_id("subscribe-max").count() == 0)
        check("novo checkout com assinatura ativa → 409", api(pg, "/api/billing/checkout", {"plan": "max"})[0] == 409)
        st = api(pg, "/api/billing/portal"); check("Portal da Stripe: sessão criada com o cliente da conta", st[0] == 200 and st[1].get("url", "").startswith("https://billing.stripe.test/") and stripe_state()["portals"][-1].get("customer") == "cus_A", str(st))
        # fatura paga → histórico de pagamentos
        inv = {"id": "evt_2", "type": "invoice.paid", "data": {"object": {"id": "in_A1", "customer": "cus_A", "amount_paid": 3000, "currency": "brl", "hosted_invoice_url": "https://invoice.stripe.test/in_A1", "status_transitions": {"paid_at": NOW},
               "lines": {"data": [{"price": {"id": "price_pro_test"}, "period": {"start": NOW, "end": NOW + 30 * 86400}}]}}}}
        check("invoice.paid registrado", hook(inv)[0] == 200)
        page(pg); rows = pg.locator("[data-testid=payments] tbody tr")
        check("histórico: pagamento de R$ 30,00 pago com link da fatura", rows.count() == 1 and "R$ 30" in rows.first.inner_text().replace("\u00a0", " ") and rows.first.locator("a[href^='https://invoice.stripe.test/']").count() == 1, rows.first.inner_text() if rows.count() else "")
        # upgrade para MAX (via portal → evento de assinatura atualizada)
        up = {"id": "evt_3", "type": "customer.subscription.updated", "data": {"object": sub_obj("sub_A", "cus_A", user, price="price_max_test")}}
        check("upgrade para MAX pelo webhook", hook(up)[0] == 200 and billing()["subs"][user]["plan_id"] == "max")
        page(pg); check("página mostra MAX", pg.get_by_test_id("cur-plan").inner_text() == "Max")
        # pagamento falhou → past_due mantém até o fim do período pago
        pd = {"id": "evt_4", "type": "customer.subscription.updated", "data": {"object": sub_obj("sub_A", "cus_A", user, price="price_max_test", status="past_due")}}
        hook(pd); page(pg); check("past_due: mantém o acesso até o fim do período e avisa", pg.get_by_test_id("cur-plan").inner_text() == "Max" and "pend" in pg.get_by_test_id("cur-status").inner_text().lower(), pg.get_by_test_id("cur-status").inner_text())
        # reembolso
        rf = {"id": "evt_5", "type": "charge.refunded", "data": {"object": {"invoice": "in_A1", "amount": 3000, "amount_refunded": 3000}}}
        hook(rf); hook({**inv, "id": "evt_6"})   # reenvio tardio da fatura não sobrescreve o reembolso
        check("reembolso registrado e não sobrescrito por evento tardio", [x for x in billing()["payments"] if x["provider_invoice_id"] == "in_A1"][0]["status"] == "refunded")
        # cancelamento → FREE
        dl = {"id": "evt_7", "type": "customer.subscription.deleted", "data": {"object": sub_obj("sub_A", "cus_A", user, price="price_max_test", status="canceled", canceled_at=NOW)}}
        hook(dl); page(pg); check("assinatura cancelada → volta ao FREE", pg.get_by_test_id("cur-plan").inner_text() == "Free")
        hist = [e["to_plan"] + ":" + e["to_status"] for e in billing()["subEvents"] if e["user_id"] == user]
        check("histórico de plano registra cada mudança", hist == ["pro:active", "max:active", "max:past_due", "max:canceled"], str(hist))
        # período vencido não vale, mesmo com status ativo
        mk(f"/__set_plan?email={uA}&plan=pro&end=2020-01-01T00:00:00Z"); page(pg)
        check("assinatura com período vencido não libera PRO", pg.get_by_test_id("cur-plan").inner_text() == "Free")
        # evento de usuário desconhecido → 500 e evento liberado para nova tentativa
        bad = {"id": "evt_8", "type": "invoice.paid", "data": {"object": {"id": "in_X", "customer": "cus_desconhecido", "amount_paid": 3000, "currency": "brl", "lines": {"data": []}}}}
        check("evento sem conta correspondente → 500 e liberado para a Stripe reenviar", hook(bad)[0] == 500 and "evt_8" not in billing()["webhookEvents"])
        # isolamento: outra conta não vê a assinatura/pagamentos de A
        ctx2 = b.new_context(viewport={"width": 390, "height": 844}); pg2 = ctx2.new_page(); pg2.on("pageerror", lambda e: errs.append(str(e)[:60]))
        uB = fresh(); login(pg2, uB); page(pg2)
        check("outra conta: FREE, sem pagamentos de A", pg2.get_by_test_id("cur-plan").inner_text() == "Free" and pg2.get_by_test_id("no-payments").is_visible())
        check("mobile: planos sem rolagem horizontal", pg2.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        ctx2.close()
        # servidor sem Stripe configurada
        ctx3 = b.new_context(); pg = ctx3.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:60])); login(pg, uA, base=B2); page(pg, base=B2)
        check("sem credenciais da Stripe: aviso e botões desativados", pg.get_by_test_id("billing-off").is_visible() and pg.get_by_test_id("subscribe-pro").is_disabled())
        check("sem credenciais: checkout → 503", api(pg, "/api/billing/checkout", {"plan": "pro"})[0] == 503)
        check("sem credenciais: webhook → 503", hook(ev, base=B2)[0] == 503)
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(s2); stop(m); stop(sb)
finish()
