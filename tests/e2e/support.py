"""E2E de Suporte (Etapa 14). Três servidores: sem SUPPORT_EMAIL, com valor inválido/placeholder e com endereço válido. Requer `npm run build`."""
import re, subprocess, os, time, urllib.parse
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test"}
MAIL = "atendimento@tradeon-suporte.test"
s0 = start(3961, BASE); s1 = start(3962, {**BASE, "SUPPORT_EMAIL": "suporte@example.com"}); s2 = start(3963, {**BASE, "SUPPORT_EMAIL": MAIL})
B0, B1, B = "http://127.0.0.1:3961", "http://127.0.0.1:3962", "http://127.0.0.1:3963"
def sup(pg, base=B, qs=""): pg.goto(base + "/suporte" + qs); pg.wait_for_selector("h1"); pg.wait_for_selector("[data-testid=sp-faq-count]")
def subj(pg): h = pg.get_by_test_id("sp-mailto").get_attribute("href"); return urllib.parse.parse_qs(urllib.parse.urlsplit(h).query)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        # --- sem configuração ---
        sup(pg, B0); main = pg.inner_text("main")
        check("página pública: visitante acessa /suporte (sem redirecionar ao login)", pg.url.endswith("/suporte") and pg.inner_text("h1") == "Suporte" and "feito por e-mail" in main)
        un = pg.get_by_test_id("sp-unavailable")
        check("sem SUPPORT_EMAIL: canal claramente indisponível, com explicação", un.is_visible() and "Canal de suporte indisponível" in un.inner_text() and "ainda não foi configurado" in un.inner_text())
        check("sem SUPPORT_EMAIL: 'Enviar e-mail' e 'Copiar e-mail' desabilitados", all(un.get_by_role("button", name=n).is_disabled() for n in ["Enviar e-mail", "Copiar e-mail"]))
        check("sem SUPPORT_EMAIL: pede a configuração (SUPPORT_EMAIL)", "SUPPORT_EMAIL" in un.inner_text())
        check("sem SUPPORT_EMAIL: nenhum endereço inventado nem link mailto na página", pg.locator("a[href^='mailto:']").count() == 0 and not re.search(r"[\w.-]+@[\w-]+\.\w+", main))
        check("sem sistema de chamados (nenhum formulário/textarea de envio)", pg.locator("main form, main textarea").count() == 0 and "Não há sistema de chamados" in main)
        sup(pg, B1); check("SUPPORT_EMAIL de exemplo/placeholder é recusado (fica indisponível)", pg.get_by_test_id("sp-unavailable").is_visible() and pg.locator("a[href^='mailto:']").count() == 0 and "example.com" not in pg.inner_text("main"))
        # --- configurado ---
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=B)
        sup(pg); c = pg.get_by_test_id("sp-contact")
        check("configurado: mostra o endereço real definido na configuração", pg.get_by_test_id("sp-email").inner_text() == MAIL)
        h = pg.get_by_test_id("sp-mailto").get_attribute("href"); q = subj(pg)
        check("botão de suporte é um link mailto: válido para o endereço configurado", h.startswith("mailto:" + MAIL + "?") and " " not in h and q["subject"] == ["Suporte TRADEON — Dúvida geral"] and "Olá, equipe TRADEON" in q["body"][0])
        pg.select_option("#sp-topic", "bug"); check("assunto escolhido entra no e-mail", subj(pg)["subject"] == ["Suporte TRADEON — Erro no aplicativo"])
        sup(pg, qs="?assunto=delete"); check("?assunto= pré-seleciona o assunto (exclusão de conta)", pg.input_value("#sp-topic") == "delete" and subj(pg)["subject"] == ["Suporte TRADEON — Exclusão de conta"])
        sup(pg, qs="?assunto=<script>"); check("?assunto= inválido cai em 'Dúvida geral'", pg.input_value("#sp-topic") == "general")
        pg.get_by_role("button", name="Copiar e-mail").click(); pg.wait_for_selector("[data-testid=sp-msg]")
        check("copiar e-mail: copia o endereço real e confirma", pg.get_by_test_id("sp-msg").inner_text() == "E-mail copiado." and pg.evaluate("navigator.clipboard.readText()") == MAIL)
        pg.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('negado'))},configurable:true})")
        pg.get_by_role("button", name="Copiar e-mail").click(); pg.wait_for_selector("[data-testid=sp-msg].err")
        check("falha ao copiar: avisa e seleciona o endereço para cópia manual", "copie manualmente" in pg.get_by_test_id("sp-msg").inner_text() and pg.evaluate("String(getSelection())") == MAIL)
        reqs = []; pg.on("request", lambda r: reqs.append(r.url) if r.method == "POST" else None)
        pg.route("mailto:**", lambda r: r.abort()); sup(pg); u0 = pg.url
        pg.get_by_test_id("sp-mailto").click(); pg.wait_for_timeout(500)
        check("abrir e-mail não envia nada pelo servidor e mantém a página", pg.url == u0 and not reqs and pg.locator("h1").inner_text() == "Suporte")
        # --- FAQ ---
        sup(pg); check("FAQ: 8 perguntas reais sobre o app", pg.locator(".sp-faq").count() == 8 and "8 de 8" in pg.get_by_test_id("sp-faq-count").inner_text())
        pg.locator(".sp-faq[data-faq=data] summary").click(); check("FAQ: abrir pergunta mostra a resposta (fontes reais: CoinGecko/BCE)", "CoinGecko" in pg.locator(".sp-faq[data-faq=data]").inner_text() and pg.locator(".sp-faq[data-faq=data]").evaluate("e=>e.open"))
        pg.fill("[data-testid=sp-faq-search]", "SENHA"); check("FAQ: busca filtra (sem diferenciar maiúsculas)", pg.locator(".sp-faq").count() >= 1 and all("senha" in t.lower() for t in pg.locator(".sp-faq").all_inner_texts()))
        pg.fill("[data-testid=sp-faq-search]", "exclusao"); check("FAQ: busca ignora acentos", pg.locator(".sp-faq[data-faq=delete]").count() == 1)
        pg.fill("[data-testid=sp-faq-search]", "zzzz nada"); check("FAQ: sem resultado mostra mensagem", pg.get_by_test_id("sp-faq-empty").is_visible() and "0 de 8" in pg.get_by_test_id("sp-faq-count").inner_text())
        pg.get_by_role("button", name="Limpar busca").click(); check("FAQ: limpar busca volta tudo", pg.locator(".sp-faq").count() == 8 and pg.input_value("[data-testid=sp-faq-search]") == "")
        check("FAQ: respostas não prometem e-mail/push nem cobrança", "Não. As notificações ficam apenas na central" in pg.text_content("main") and "nenhuma cobrança é feita" in pg.text_content("main"))
        # --- navegação ---
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000); pg.get_by_test_id("nav-support").click(); pg.wait_for_url("**/suporte")
        check("menu lateral: 'Suporte' abre a página e fica ativo", pg.get_by_test_id("nav-support").get_attribute("aria-current") == "page")
        pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.get_by_test_id("login-support").click(); pg.wait_for_url("**/suporte?assunto=access"); pg.wait_for_selector("#sp-topic")
        check("login: 'Precisa de ajuda? Suporte' abre o suporte com assunto 'Acesso e login'", pg.input_value("#sp-topic") == "access")
        pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", "ok1401@teste.com"); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(B + "/", timeout=15000)
        pg.goto(B + "/perfil"); pg.wait_for_selector("[data-testid=support-card]", timeout=15000)
        dh = pg.locator("[data-testid=delete-card] a").get_attribute("href")
        check("perfil: exclusão usa o mesmo e-mail validado e assunto 'Exclusão de conta'", dh.startswith("mailto:" + MAIL + "?") and "Exclus%C3%A3o%20de%20conta" in dh)
        pg.locator("[data-testid=support-card] a").click(); pg.wait_for_url("**/suporte"); check("perfil: card 'Ajuda e suporte' leva ao suporte", True)
        check("página antiga provisória removida (rota inexistente → 404)", pg.goto(B + "/secao-inexistente").status == 404)
        # --- EN / claro / mobile / teclado ---
        e = b.new_context(viewport={"width": 1440, "height": 900}); e.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = e.new_page(); sup(pe)
        check("inglês e tema claro", pe.inner_text("h1") == "Support" and urllib.parse.parse_qs(urllib.parse.urlsplit(pe.get_by_test_id("sp-mailto").get_attribute("href")).query)["subject"] == ["TRADEON Support — General question"] and pe.evaluate("document.documentElement.dataset.theme") == "light")
        pe.screenshot(path="docs/screenshots/etapa14_desktop_light_en.png")
        sup(pg); pg.screenshot(path="docs/screenshots/etapa14_desktop.png")
        pg.focus("#sp-topic"); pg.keyboard.press("Tab"); f1 = pg.evaluate("document.activeElement.dataset.testid"); pg.keyboard.press("Tab")
        check("teclado: assunto → Enviar e-mail → Copiar e-mail", f1 == "sp-mailto" and pg.evaluate("document.activeElement.textContent") == "Copiar e-mail")
        mc = b.new_context(viewport={"width": 390, "height": 844}); mb = mc.new_page(); sup(mb)
        check("mobile: sem rolagem horizontal; e-mail e botões visíveis", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1") and mb.get_by_test_id("sp-mailto").is_visible() and mb.get_by_role("button", name="Copiar e-mail").is_visible())
        mb.screenshot(path="docs/screenshots/etapa14_mobile.png", full_page=True)
        m0 = b.new_context(viewport={"width": 390, "height": 844}).new_page(); sup(m0, B0); m0.screenshot(path="docs/screenshots/etapa14_mobile_nao_configurado.png", full_page=True)
        check("mobile sem configuração: indisponível visível", m0.get_by_test_id("sp-unavailable").is_visible())
        check_js(errs)
        b.close()
finally:
    for s in (s0, s1, s2, m, sb): stop(s)
finish()
