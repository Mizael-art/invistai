"""E2E do "Treinar IA" (painel admin) + IA reserva. O admin cadastra instruções, um documento (arquivo .md) e um exemplo;
a pergunta do usuário leva ao modelo os trechos certos da base. Com a IA principal em limite (429), a reserva responde. Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t",
        "REGISTER_RATE_IP_PER_HOUR": "1000", "ENGINE_CRYPTO_BASE_URL": "http://127.0.0.1:4010/binance", "BILLING_DB_SECRET": "test-billing-secret-0123456789abcdef-0123"}
# principal em limite (429) + reserva funcionando
s1 = start(3975, {**BASE, "AI_API_KEY": "sk-test-llm", "AI_BASE_URL": "http://127.0.0.1:4010/rl", "AI_MODEL": "gemini-test",
                  "AI_FALLBACK_API_KEY": "sk-test-llm", "AI_FALLBACK_BASE_URL": "http://127.0.0.1:4010/llm/openai", "AI_FALLBACK_MODEL": "test-model"}); B = "http://127.0.0.1:3975"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def llm(): return json.loads(urllib.request.urlopen("http://127.0.0.1:4010/llm/__state").read())
DOC = "# Wyckoff\n\nO método Wyckoff descreve quatro fases: acumulação, markup, distribuição e markdown.\n\n# Gestão de risco\n\nNa TRADEON o risco por operação recomendado no material educativo fica entre 0,5% e 1% do capital."
_n = [8800]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=15000); pg.wait_for_load_state("networkidle")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        mk("/__reset"); urllib.request.urlopen("http://127.0.0.1:4010/llm/__reset")
        A = b.new_context(viewport={"width": 1440, "height": 900}); pa = A.new_page(); pa.on("pageerror", lambda e: errs.append(str(e)[:80])); pa.on("dialog", lambda d: d.accept())
        uA, uU = fresh(), fresh(); mk(f"/__set_admin?email={uA}"); mk(f"/__set_plan?email={uU}&plan=pro"); login(pa, uA)
        pa.goto(B + "/admin/ia"); pa.wait_for_selector("[data-testid=ai-instr]"); pa.wait_for_load_state("networkidle")
        check("aba 'Treinar IA' no painel admin", pa.locator("nav[aria-label=Administração] a.on").inner_text() == "Treinar IA")
        pa.click("[data-testid=ai-probe]"); pa.wait_for_selector("[data-testid=probe-primary]")
        check("testar conexão: principal falha (limite) e reserva conectada, com modelos listados — sem expor a chave", "falhou" in pa.get_by_test_id("probe-primary").inner_text() and "conectada" in pa.get_by_test_id("probe-fallback").inner_text()
              and "test-model" in pa.get_by_test_id("probe-fallback").inner_text() and "sk-test" not in pa.inner_text("main"))
        pa.fill("[data-testid=ai-instr]", "Sempre mencione a gestão de risco da TRADEON."); pa.click("[data-testid=ai-instr-save]"); pa.wait_for_selector("[data-testid=ai-train-msg]")
        check("instruções salvas", "Instruções salvas" in pa.get_by_test_id("ai-train-msg").inner_text() and json.loads(mk("/__train"))["instructions"].startswith("Sempre mencione"))
        pa.set_input_files("[data-testid=kb-file]", files=[{"name": "metodo_tradeon.md", "mimeType": "text/markdown", "buffer": DOC.encode()}])
        pa.wait_for_function("document.querySelector('[data-testid=kb-text]').value.includes('Wyckoff')")
        check("arquivo .md carrega o texto e sugere o título", pa.input_value("[data-testid=kb-title]") == "metodo tradeon")
        pa.click("[data-testid=kb-add]"); pa.wait_for_selector("[data-testid=kb-docs]")
        check("documento indexado em trechos e listado", "trechos indexados" in pa.get_by_test_id("ai-train-msg").inner_text() and "metodo tradeon" in pa.get_by_test_id("kb-docs").inner_text())
        pa.fill("[data-testid=kb-q]", "quais são as fases de wyckoff?"); pa.click("[data-testid=kb-preview]"); pa.wait_for_selector("[data-testid=kb-hits]")
        check("prévia da busca mostra o trecho certo", "acumulação, markup" in pa.get_by_test_id("kb-hits").inner_text())
        pa.fill("[data-testid=ex-q]", "O que é stop?"); pa.fill("[data-testid=ex-a]", "Stop é o nível que invalida a ideia da operação."); pa.click("[data-testid=ex-add]"); pa.wait_for_selector("[data-testid=ex-list]")
        check("exemplo de resposta cadastrado", "O que é stop?" in pa.get_by_test_id("ex-list").inner_text())
        # usuário comum: não acessa o treino
        U = b.new_context(viewport={"width": 1440, "height": 900}); pu = U.new_page(); pu.on("pageerror", lambda e: errs.append(str(e)[:80])); login(pu, uU)
        st = pu.evaluate("()=>fetch('/api/admin/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'instructions',text:'hack'})}).then(r=>r.status)")
        check("usuário comum não altera o treino (403)", st == 403 and json.loads(mk("/__train"))["instructions"].startswith("Sempre mencione"))
        pu.goto(B + "/admin/ia"); check("usuário comum não vê a página de treino", pu.locator("[data-testid=ai-instr]").count() == 0)
        # pergunta usa o treino; principal em limite → reserva responde
        pu.goto(B + "/ia"); pu.wait_for_selector(".ai-main"); pu.wait_for_load_state("networkidle")
        pu.fill("[data-testid=ai-input]", "Me explica as fases de Wyckoff"); pu.click("[data-testid=ai-send]"); pu.wait_for_selector("[data-testid=ai-answer]", timeout=40000)
        sysmsg = llm()["calls"][-1]["system"]
        check("modelo recebeu as instruções da equipe, o exemplo e o trecho da base (com título para citar)", "Sempre mencione a gestão de risco" in sysmsg and "Pergunta: O que é stop?" in sysmsg and "[metodo tradeon]" in sysmsg and "acumulação, markup" in sysmsg)
        check("ferramenta de busca na base disponível ao modelo", "search_knowledge_base" in llm()["calls"][-1]["tools"])
        rpc = json.loads(mk("/__ai"))["rpc"]; logs = [r for r in rpc if r["fn"] == "ai_log_request"]
        check("IA principal em limite → reserva respondeu (e o erro da principal ficou registrado)", any(l["p_error"] == "primary_rate_limited" for l in logs) and logs[-1]["p_status"] == "ok" and logs[-1]["p_model"] == "test-model")
        check("resposta entregue normalmente ao usuário", pu.locator("[data-testid=ai-answer]").count() == 1)
        # desativar documento tira da busca
        pa.reload(); pa.wait_for_selector("[data-testid=kb-docs]"); pa.get_by_role("button", name="Desativar").first.click(); pa.wait_for_timeout(700)
        pa.fill("[data-testid=kb-q]", "fases de wyckoff"); pa.click("[data-testid=kb-preview]"); pa.wait_for_selector("[data-testid=kb-none]")
        check("documento desativado sai da busca", True)
        pa.click("[data-testid=kb-del]"); pa.wait_for_timeout(700); check("documento excluído", json.loads(mk("/__train"))["docs"] == [])
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(m); stop(sb)
finish()
