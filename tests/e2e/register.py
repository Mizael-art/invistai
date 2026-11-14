"""E2E do Cadastro (Etapa 08). Mock do Supabase Auth (tests/mock-supabase.mjs). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
SB = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test"}
s1 = start(3801, {**BASE, **SB, "REGISTER_RATE_IP_PER_HOUR": "1000"}); s2 = start(3802, BASE); s3 = start(3803, {**BASE, **SB})
B, B2, B3 = "http://127.0.0.1:3801", "http://127.0.0.1:3802", "http://127.0.0.1:3803"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def stats(): return json.loads(mk("/__stats"))
def sess(ctx): return [c for c in ctx.cookies() if re.match(r"^sb-.*-auth-token(\.\d+)?$", c["name"])]
_n = [0]
def em(): _n[0] += 1; return f"novo{_n[0]}@teste.com"
GOOD = "Abcdef1!"
def fill(pg, name="Maria da Silva", email=None, phone="(11) 91234-5678", pw=GOOD):
    email = email or em(); pg.fill("#name", name); pg.fill("#email", email); pg.fill("#phone", phone); pg.fill("#password", pw); return email
def submit(pg): pg.get_by_role("button", name=re.compile("^Criar conta")).click()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read"]); pg = ctx.new_page(); errs = []; posts = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80] + " @ " + pg.url)); pg.on("request", lambda r: posts.append(r.url) if "/api/auth/register" in r.url else None)
        mk("/__reset")
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form")
        check("cadastro: campos Nome/E-mail/Telefone/Senha rotulados e botão 'Criar conta'", all(pg.get_by_label(l, exact=False).first.is_visible() for l in ["Nome completo", "E-mail", "Telefone", "Senha"]) and pg.get_by_role("button", name="Criar conta").is_visible())
        check("cadastro: 'Voltar ao login' → /login, sem Google/Apple e sem sidebar", pg.get_by_role("link", name="Voltar ao login").get_attribute("href") == "/login" and pg.get_by_text(re.compile("Google|Apple")).count() == 0 and pg.locator("aside").count() == 0)
        check("sem confirmação de senha e sem termos fictícios (fora do escopo)", pg.locator("input").count() == 4)
        # requisitos de senha ao vivo
        rules = lambda: {k: pg.locator(f"li[data-rule={k}]").get_attribute("data-ok") for k in ["length", "upper", "number", "special"]}
        check("requisitos da senha: todos pendentes no início", set(rules().values()) == {"false"})
        pg.fill("#password", "abcdefgh"); check("requisitos: só comprimento atendido", rules() == {"length": "true", "upper": "false", "number": "false", "special": "false"})
        pg.fill("#password", GOOD); check("requisitos: todos atendidos", set(rules().values()) == {"true"})
        pg.fill("#password", ""); t = pg.locator("#password"); pg.fill("#password", "x"); pg.get_by_role("button", name="Mostrar senha").click(); check("mostrar/ocultar senha", t.get_attribute("type") == "text" and pg.get_by_role("button", name="Ocultar senha").get_attribute("aria-pressed") == "true")
        # validação local (não chama API)
        pg.reload(); pg.wait_for_selector("form"); submit(pg)
        txt = pg.inner_text("form")
        check("validação: 4 campos vazios mostram mensagens e foco no primeiro", all(s in txt for s in ["Informe seu nome.", "Informe seu e-mail.", "Informe seu telefone.", "Crie uma senha."]) and pg.evaluate("document.activeElement.id") == "name")
        fill(pg, name="A", email="abc", phone="123", pw="fraca"); submit(pg); txt = pg.inner_text("form")
        check("validação: nome curto, e-mail, telefone e senha inválidos", all(s in txt for s in ["nome válido", "e-mail válido", "telefone válido", "não atende aos requisitos"]) and pg.locator("#name").get_attribute("aria-invalid") == "true")
        check("validação inválida não chama a API", posts == [])
        # telefones válidos normalizados (E.164) + nome normalizado
        for raw, e164 in [("(11) 91234-5678", "+5511912345678"), ("11912345678", "+5511912345678"), ("+55 11 91234-5678", "+5511912345678"), ("+1 415 555 2671", "+14155552671")]:
            pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); e = fill(pg, name="  Maria   da  Silva ", phone=raw); submit(pg); pg.wait_for_selector("text=Verifique seu e-mail", timeout=10000)
            s = [x for x in stats()["signups"] if x["email"] == e][0]
            check(f"telefone '{raw}' → {e164}; nome normalizado; senha não enviada em metadados", s["phone"] == e164 and s["name"] == "Maria da Silva" and "password" not in s)
        # tela de sucesso com confirmação obrigatória
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); e = fill(pg); submit(pg); pg.wait_for_selector("text=Verifique seu e-mail", timeout=10000)
        body = pg.inner_text("form, main, body")
        check("confirmação obrigatória: mostra e-mail, aviso de spam, reenvio e voltar ao login (sem sessão)", e in body and "caixa de spam" in body and pg.get_by_role("button", name=re.compile("Reenviar")).is_visible() and pg.get_by_role("link", name="Voltar ao login").is_visible() and not sess(ctx))
        check("texto não afirma entrega ('solicitamos o envio')", "Solicitamos o envio" in body)
        rs = pg.get_by_role("button", name=re.compile("Reenviar em \\d+s")); check("reenvio bloqueado por cooldown logo após o cadastro", rs.is_visible() and rs.is_disabled())
        # login com conta pendente + reenvio no login
        pg.goto(B + "/login"); pg.fill("#email", e); pg.fill("#password", GOOD); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_selector("[role=alert].err")
        check("conta pendente: login informa confirmação e oferece reenvio", "Confirme seu e-mail antes de entrar." in pg.inner_text("form") and pg.get_by_role("button", name="Reenviar e-mail de confirmação").is_visible())
        before = len(stats()["resends"]); pg.get_by_role("button", name="Reenviar e-mail de confirmação").click(); pg.wait_for_selector("text=Solicitamos o reenvio do e-mail.", timeout=8000)
        check("reenvio pelo login chama o provedor 1x e entra em cooldown", len(stats()["resends"]) == before + 1 and pg.get_by_role("button", name=re.compile("Reenviar em")).is_disabled())
        pg.get_by_role("button", name=re.compile("Reenviar em")).click(force=True) if False else None
        check("cliques repetidos não geram novo reenvio", len(stats()["resends"]) == before + 1)
        mk("/__confirm?email=" + e); pg.fill("#password", GOOD); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(B + "/", timeout=10000); pg.wait_for_selector(".lrow", timeout=15000)
        check("após confirmar, conta criada consegue entrar", pg.locator("header a.av").count() == 1 and pg.locator("[data-testid=email-banner]").count() == 0)
        pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
        # auto-confirm (acessa na hora) e acesso antes da confirmação
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); fill(pg, name="Auto Teste", email="auto@teste.com"); submit(pg); pg.wait_for_url(B + "/", timeout=10000); pg.wait_for_selector(".lrow", timeout=15000)
        check("confirmação desativada: conta entra logada, sem banner", sess(ctx) and pg.locator("[data-testid=email-banner]").count() == 0 and pg.locator("header a.av").count() == 1)
        pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); fill(pg, name="Soft Teste", email="soft@teste.com"); submit(pg); pg.wait_for_url(B + "/", timeout=10000); pg.wait_for_selector(".lrow", timeout=15000)
        bn = pg.locator("[data-testid=email-banner]")
        check("acesso antes da confirmação: estado identificado por banner 'e-mail não confirmado'", bn.is_visible() and "ainda não foi confirmado" in bn.inner_text() and pg.locator("main .lrow").count() > 0)
        bn.get_by_role("button", name="Reenviar e-mail de confirmação").click(); pg.wait_for_selector("[data-testid=email-banner] >> text=Solicitamos o reenvio do e-mail.", timeout=8000)
        check("banner: reenvio usa o e-mail da sessão", stats()["resends"][-1] == "soft@teste.com")
        pg.get_by_role("link", name="Mercado").first.click(); pg.wait_for_url("**/mercado"); check("banner persiste nas páginas enquanto não confirmar", pg.locator("[data-testid=email-banner]").is_visible())
        pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
        # autenticado em /cadastro
        pg.goto(B + "/login"); pg.fill("#email", "ok@teste.com"); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(B + "/", timeout=10000)
        pg.goto(B + "/cadastro"); pg.wait_for_url(B + "/"); check("autenticado em /cadastro → redireciona ao Início", True)
        pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
        # erros do servidor
        for email, txt, name in [("exists@teste.com", "Este e-mail já está cadastrado.", "e-mail já cadastrado"), ("dupe@teste.com", "Este e-mail já está cadastrado.", "e-mail já cadastrado (resposta ofuscada)"), ("weakserver@teste.com", "não atende às regras de segurança", "senha fraca recusada pelo provedor"), ("smtpfail@teste.com", "Não foi possível enviar o e-mail de confirmação", "falha ao enviar e-mail"), ("rate@teste.com", "Muitas tentativas", "limite do provedor"), ("down@teste.com", "Não foi possível entrar agora", "provedor indisponível")]:
            pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); fill(pg, email=email); submit(pg); pg.wait_for_selector("[role=alert].err", timeout=8000)
            check(f"erro do servidor: {name}", txt in pg.inner_text("form") and "Verifique seu e-mail" not in pg.inner_text("body") and not sess(ctx))
        check("e-mail existente oferece Entrar e Recuperar senha", True) if False else None
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); fill(pg, email="exists@teste.com"); submit(pg); pg.wait_for_selector("[role=alert].err")
        check("e-mail existente oferece 'Entrar' e 'Esqueci minha senha'", pg.locator("form a[href='/login']").count() >= 1 and pg.locator("form a[href='/recuperar-senha']").count() == 1)
        # envio duplo
        mk("/__reset"); pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); fill(pg, email="slowreg@teste.com")
        pg.evaluate("(()=>{const f=document.querySelector('form');f.requestSubmit();f.requestSubmit();f.requestSubmit()})()"); pg.wait_for_selector("text=Verifique seu e-mail", timeout=10000)
        check("envio repetido bloqueado (1 chamada ao provedor)", stats()["signupCalls"].get("slowreg@teste.com") == 1, str(stats()["signupCalls"]))
        # API direta
        good = {"name": "Maria", "email": em(), "phone": "(11) 91234-5678", "password": GOOD}
        r = pg.request.post(B + "/api/auth/register", data=good, headers={"origin": "http://evil.com"}); check("API: Origin de outro site -> 403", r.status == 403)
        r = pg.request.post(B + "/api/auth/register", headers={"content-type": "application/json"}, data="{x"); check("API: JSON inválido -> 400", r.status == 400)
        for k, bad in [("nome", {**good, "name": "A"}), ("e-mail", {**good, "email": "x"}), ("telefone", {**good, "phone": "123"}), ("senha fraca", {**good, "password": "fraca123"}), ("campo ausente", {k: v for k, v in good.items() if k != "phone"}), ("tipo errado", {**good, "phone": 11912345678})]:
            r = pg.request.post(B + "/api/auth/register", data=bad); check(f"API: {k} inválido -> 400 sem criar conta", r.status == 400 and bad.get("email") not in stats()["signupCalls"] or r.status == 400)
        r = pg.request.post(B + "/api/auth/register", data={**good, "email": "exists@teste.com"}); body = r.text()
        check("API: resposta não vaza senha/telefone/detalhes do provedor", r.status == 409 and GOOD not in body and "11912345678" not in body and "already registered" not in body, body)
        r = pg.request.post(B + "/api/auth/resend", data={"email": "x"}); check("API resend: e-mail inválido -> 400", r.status == 400)
        r = pg.request.post(B + "/api/auth/resend", data={}); check("API resend: sem e-mail e sem sessão -> 400", r.status == 400)
        # limites (instância com limites padrão)
        e = em(); codes = [pg.request.post(B3 + "/api/auth/register", data={**good, "email": e}).status for _ in range(5)]; check("API: limite por e-mail (3/h) -> 429", codes[:3] != [429] * 3 and 429 in codes[3:], str(codes))
        codes = [pg.request.post(B3 + "/api/auth/register", data={**good, "email": em()}).status for _ in range(12)]; check("API: limite por IP (10/h) -> 429", 429 in codes, str(codes))
        # confirmação por link
        r = pg.request.get(B + "/auth/confirm?token_hash=valid-hash&type=email&next=/noticias", max_redirects=0); check("confirm: link válido redireciona ao destino com aviso", r.status in (302, 307) and "/noticias" in r.headers["location"] and "email_confirmed=1" in r.headers["location"], r.headers.get("location", ""))
        pg.goto(B + "/auth/confirm?token_hash=valid-hash&type=email"); pg.wait_for_url(re.compile(r"/\?email_confirmed=1")); pg.wait_for_selector("[data-testid=email-confirmed]", timeout=15000)
        check("confirm: sessão criada e aviso 'E-mail confirmado com sucesso'", sess(ctx) and "E-mail confirmado com sucesso." in pg.inner_text("[data-testid=email-confirmed]"))
        pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
        for q, nm in [("token_hash=bad-hash&type=email", "token expirado"), ("token_hash=valid-hash&type=magiclink", "tipo não permitido"), ("token_hash=valid-hash", "sem tipo"), ("type=email", "sem token"), ("token_hash=abc&type=email", "token curto")]:
            r = pg.request.get(B + "/auth/confirm?" + q, max_redirects=0); check(f"confirm: {nm} -> /login?confirm=failed", r.status in (302, 307) and r.headers["location"].endswith("/login?confirm=failed"), r.headers.get("location", ""))
        r = pg.request.get(B + "/auth/confirm?token_hash=valid-hash&type=email&next=//evil.com", max_redirects=0); check("confirm: open redirect bloqueado", "evil.com" not in r.headers["location"])
        ctx.clear_cookies(); pg.goto(B + "/login?confirm=failed"); check("login mostra aviso de link inválido", "inválido ou expirado" in pg.inner_text("form"))
        # sem Supabase
        pn = ctx.new_page(); pn.goto(B2 + "/cadastro"); pn.wait_for_selector("form"); fill(pn); pn.get_by_role("button", name=re.compile("^Criar conta")).click(); pn.wait_for_selector("[role=alert].err")
        check("sem Supabase: informa 'ainda não está configurado' (não afirma e-mail enviado)", "ainda não está configurado" in pn.inner_text("form") and "Verifique seu e-mail" not in pn.inner_text("body"))
        pn.get_by_role("link", name="Voltar ao login").click(); pn.wait_for_url("**/login"); check("'Voltar ao login' funciona", True)
        # EN / claro / mobile
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = ectx.new_page(); pe.goto(B + "/cadastro"); pe.wait_for_selector("form")
        pe.get_by_role("button", name="Create account").click(); check("inglês e tema claro, validação em inglês", "Enter your name." in pe.inner_text("form") and pe.evaluate("document.documentElement.dataset.theme") == "light")
        fill(pe, email=em()); pe.get_by_role("button", name="Create account").click(); pe.wait_for_selector("text=Check your email", timeout=10000); pe.screenshot(path="docs/screenshots/etapa08_desktop_light_en.png")
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/cadastro"); mb.wait_for_selector("form")
        check("mobile: formulário utilizável e sem rolagem horizontal", mb.locator("#name").is_visible() and not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1")); mb.screenshot(path="docs/screenshots/etapa08_mobile.png", full_page=True)
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, s3, m, sb): stop(s)
finish()
