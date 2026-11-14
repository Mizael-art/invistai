"""E2E da TRADEON AI (ecossistema, Etapa 2). Mock do Supabase (Auth + REST/RPC), mock da Binance (velas sintéticas) e mock do LLM
(OpenAI e Anthropic com chamadas de ferramenta). Verifica: cota no banco, ferramentas com dados reais do motor, cartões, histórico,
análises salvas, isolamento entre contas, falha sem desconto, modal de upgrade e segurança do markdown. Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t",
        "REGISTER_RATE_IP_PER_HOUR": "1000", "ENGINE_CRYPTO_BASE_URL": "http://127.0.0.1:4010/binance", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "BILLING_DB_SECRET": "test-billing-secret-0123456789abcdef-0123"}
AI = {**BASE, "AI_API_KEY": "sk-test-llm", "AI_BASE_URL": "http://127.0.0.1:4010/llm/openai", "AI_MODEL": "test-model"}
s1 = start(3971, AI); B = "http://127.0.0.1:3971"
s2 = start(3972, BASE); B2 = "http://127.0.0.1:3972"
s3 = start(3973, {**AI, "AI_PROVIDER": "anthropic", "AI_BASE_URL": "http://127.0.0.1:4010/llm/anthropic"}); B3 = "http://127.0.0.1:3973"
def get(url): return urllib.request.urlopen(url).read().decode()
def mk(path): return get("http://127.0.0.1:4020" + path)
def ai_state(): return json.loads(mk("/__ai"))
def llm(): return json.loads(get("http://127.0.0.1:4010/llm/__state"))
def usage(): return json.loads(mk("/__billing"))["aiUsage"]
_n = [5600]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email, base=B):
    pg.goto(base + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123")
    pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(base + "/", timeout=15000); pg.wait_for_load_state("networkidle")
def open_ai(pg, qs="", base=B): pg.goto(base + "/ia" + qs); pg.wait_for_selector(".ai-main", timeout=20000); pg.wait_for_load_state("networkidle")
def ask(pg, text, expect="answer"):
    n = pg.locator("[data-testid=ai-answer]").count()
    pg.fill("[data-testid=ai-input]", text); pg.click("[data-testid=ai-send]")
    if expect == "answer": pg.wait_for_function(f"document.querySelectorAll('[data-testid=ai-answer]').length > {n}", timeout=40000)
    elif expect == "modal": pg.wait_for_selector("[data-testid=upgrade-modal]", timeout=15000)
    elif expect == "error": pg.wait_for_selector("[data-testid=ai-err]", timeout=40000)
    pg.wait_for_timeout(200)
def last_answer(pg): return pg.locator("[data-testid=ai-answer]").last
def quota(pg): return pg.get_by_test_id("ai-quota").inner_text()
def api(pg, method, path, body=None): return pg.evaluate("([m,p,b])=>fetch(p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>[r.status,await r.json().catch(()=>({}))])", [method, path, body])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; dialogs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0])); pg.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        mk("/__reset"); get("http://127.0.0.1:4010/llm/__reset")
        # ---------- visitante ----------
        pg.goto(B + "/ia"); pg.wait_for_url(re.compile("/login")); check("visitante em /ia → /login?next=", "next=%2Fia" in pg.url)
        check("chat sem sessão → 401", api(pg, "POST", "/api/ai/chat", {"message": "oi"})[0] == 401)
        # ---------- motor (API pública) ----------
        snap = json.loads(get(B + "/api/engine/snapshot?symbol=BTC"))
        check("motor: snapshot BTC com 4 tempos gráficos, resumo e fonte", sorted(snap["timeframes"].keys()) == ["15m", "1d", "1h", "4h"] and snap["summary"]["verdict"] in ["alta", "baixa", "aguardar", "insuficiente"] and "Binance" in snap["source"] and snap["quote"]["price"] > 0, json.dumps(snap["summary"])[:160])
        check("motor: indicadores e estrutura calculados", all(snap["timeframes"]["1h"][k] is not None for k in ["rsi", "atrPct"]) and snap["timeframes"]["1h"]["structure"]["trend"] in ["up", "down", "range"])
        check("motor: viés coerente com a série (BTC sintético em alta)", snap["summary"]["bias"] > 0, str(snap["summary"]["bias"]))
        def code(url):
            try: urllib.request.urlopen(url); return 200
            except urllib.error.HTTPError as e: return e.code
        check("motor: símbolo inexistente → 404", code(B + "/api/engine/snapshot?symbol=XYZ") == 404)
        check("motor: classe sem fonte (ações) → 422, sem números inventados", code(B + "/api/engine/snapshot?symbol=PETR4&class=stock_br") == 422)
        # ---------- servidor sem chave de IA ----------
        ctxo = b.new_context(); po = ctxo.new_page(); uO = fresh(); login(po, uO, base=B2); open_ai(po, base=B2)
        check("sem chave da IA: aviso claro e campo desativado", po.get_by_test_id("ai-off").is_visible() and po.get_by_test_id("ai-input").is_disabled())
        check("sem chave da IA: API → 503 e cota intacta", api(po, "POST", "/api/ai/chat", {"message": "oi"})[0] == 503 and not usage())
        ctxo.close()
        # ---------- FREE: 3 mensagens ----------
        uA = fresh(); login(pg, uA); open_ai(pg)
        check("conta nova: sugestões e cota 0 de 3", pg.get_by_test_id("ai-suggestions").is_visible() and "0 de 3" in quota(pg), quota(pg))
        pg.get_by_role("button", name="Analise o BTC agora").click(); pg.wait_for_selector("[data-testid=ai-answer]", timeout=40000); pg.wait_for_timeout(300)
        L = llm()["calls"]
        check("modelo recebeu instruções da TRADEON AI e as ferramentas do backend", "TRADEON AI" in L[0]["system"] and "get_asset_indicators" in L[0]["tools"] and "scan_opportunities" in L[0]["tools"] and L[0]["model"] == "test-model")
        check("ferramenta executada no servidor e resultado devolvido ao modelo", len(L) == 2 and L[1]["results"] == 1)
        a = last_answer(pg)
        check("resposta em blocos: texto + cartão do ativo com score, viés, fonte e horário", a.locator("h3").count() >= 1 and a.locator("[data-testid=ai-asset]").count() == 1 and "Fonte: Binance" in a.inner_text() and a.locator(".ai-score").count() == 1)
        price_card = a.locator("[data-testid=ai-asset] .num").first.inner_text()
        check("preço do cartão vem do motor (mesmo valor citado ao modelo)", re.sub(r"[^\d]", "", price_card)[:4] == re.sub(r"[^\d]", "", str(int(snap["quote"]["price"])))[:4], f"{price_card} vs {snap['quote']['price']}")
        check("cartão mostra contra/a favor e tempos gráficos", a.locator(".ai-tf").count() == 4 and a.locator(".ai-ev h5").count() >= 1)
        check("cota: 1 de 3 (contada no banco)", "1 de 3" in quota(pg) and list(usage().values()) == [1], quota(pg))
        st = ai_state(); conv = st["ai_conversations"][0]
        check("conversa e mensagens salvas no banco (usuário + IA com cartões)", len(st["ai_conversations"]) == 1 and [x["role"] for x in st["ai_messages"]] == ["user", "assistant"] and st["ai_messages"][1]["blocks"][0]["type"] == "asset")
        check("URL aponta para a conversa", f"c={conv['id']}" in pg.url)
        logs = [r for r in st["rpc"] if r["fn"] == "ai_log_request"]
        check("uso registrado para o admin (modelo, tokens, ferramentas)", logs and logs[-1]["p_status"] == "ok" and logs[-1]["p_tools"] == ["get_asset_indicators"] and logs[-1]["p_in"] == 220)
        ask(pg, "Quais as melhores moedas agora?")
        sc = last_answer(pg).locator("[data-testid=ai-scan]")
        check("scanner: ranking real (sem stablecoins) com score", sc.count() == 1 and sc.locator("li").count() == 3 and "USDC" not in sc.inner_text(), sc.inner_text()[:200] if sc.count() else "")
        check("histórico enviado ao modelo na 2ª mensagem", llm()["calls"][-2]["nMessages"] >= 4)
        ask(pg, "Explique o que é um FII")
        check("pergunta educativa sem ferramenta; cota 3 de 3", "fundo imobiliário" in last_answer(pg).inner_text() and "3 de 3" in quota(pg), quota(pg))
        nc = len(llm()["calls"])
        ask(pg, "Analise o ETH", expect="modal")
        check("4ª mensagem bloqueada: modal de upgrade (Pro/Max) e o modelo NÃO é chamado", pg.get_by_test_id("upgrade-modal").is_visible() and pg.get_by_test_id("lock-pro").is_visible() and len(llm()["calls"]) == nc and "atingiu o limite" in pg.inner_text("[data-testid=upgrade-modal]"))
        check("mensagem bloqueada não entra no histórico e volta para o campo", pg.locator("[data-testid=ai-user]").count() == 3 and pg.input_value("[data-testid=ai-input]") == "Analise o ETH")
        pg.keyboard.press("Escape"); check("modal fecha com Esc", pg.get_by_test_id("upgrade-modal").count() == 0)
        st, j = api(pg, "POST", "/api/ai/chat", {"message": "burlar"}); check("API também bloqueia (402 quota_exhausted)", st == 402 and j.get("error") == "quota_exhausted")
        # nova sessão (outro navegador) não zera
        ctx2 = b.new_context(); p2 = ctx2.new_page(); login(p2, uA); open_ai(p2)
        check("nova sessão/navegador: continua 3 de 3 (limite por conta)", "3 de 3" in quota(p2))
        p2.fill("[data-testid=ai-input]", "oi"); p2.click("[data-testid=ai-send]"); p2.wait_for_selector("[data-testid=upgrade-modal]", timeout=15000); check("nova sessão: modal de upgrade", True); ctx2.close()
        # histórico, salvar e excluir
        open_ai(pg, f"?c={conv['id']}")
        check("reabrir conversa: mensagens e cartões restaurados", pg.locator("[data-testid=ai-answer]").count() == 3 and pg.locator("[data-testid=ai-asset]").count() == 1)
        check("lista de conversas mostra a atual", pg.locator(".ai-convs li.on").count() == 1)
        pg.locator("[data-testid=ai-save]").first.click(); pg.wait_for_selector("[data-testid=ai-save][aria-pressed=true]")
        check("salvar análise persiste (somente a coluna saved)", sum(1 for x in ai_state()["ai_messages"] if x["saved"]) == 1)
        pg.goto(B + "/ia?view=saved"); pg.wait_for_selector(".ai-saved h1"); check("Análises salvas lista a resposta com cartões", pg.locator("[data-testid=ai-saved-item]").count() == 1 and pg.locator("[data-testid=ai-saved-item] [data-testid=ai-asset]").count() == 1)
        # isolamento
        ctxB = b.new_context(); pB = ctxB.new_page(); uB = fresh(); login(pB, uB); open_ai(pB)
        check("outra conta: não vê conversas de A", pB.locator(".ai-convs li").count() == 0)
        check("outra conta: GET da conversa de A → 404", api(pB, "GET", f"/api/ai/conversations/{conv['id']}")[0] == 404)
        check("outra conta: não escreve na conversa de A (404) e não consome cota", api(pB, "POST", "/api/ai/chat", {"conversationId": conv["id"], "message": "invasão"})[0] == 404)
        check("outra conta: não salva/exclui mensagens/conversas de A", api(pB, "PATCH", f"/api/ai/messages/{ai_state()['ai_messages'][1]['id']}", {"saved": False})[0] == 404 and api(pB, "DELETE", f"/api/ai/conversations/{conv['id']}")[0] == 404)
        # falha do modelo: não desconta
        before = usage().get(ai_state()["ai_conversations"][0]["user_id"])
        open_ai(pB); ask(pB, "por favor falhe agora", expect="error")
        uid_b = [k for k in usage().keys() if k != ai_state()["ai_conversations"][0]["user_id"]]
        check("falha do modelo: erro claro, mensagem devolvida e cota não descontada", "não foi descontada" in pB.get_by_test_id("ai-err").inner_text() and all(usage()[k] == 0 for k in uid_b) and pB.input_value("[data-testid=ai-input]") == "por favor falhe agora")
        check("falha: mensagem do usuário removida e erro registrado", not any(x["content"] == "por favor falhe agora" for x in ai_state()["ai_messages"]) and any(r["fn"] == "ai_release" for r in ai_state()["rpc"]) and any(r.get("p_status") == "error" for r in ai_state()["rpc"]))
        # classe sem fonte + segurança do markdown
        ask(pB, "Analise PETR4")
        a = last_answer(pB)
        check("ação sem fonte integrada: IA informa indisponibilidade, sem cartão com números", "unsupported_asset_class" in a.inner_text() and a.locator("[data-testid=ai-asset]").count() == 0)
        check("HTML/script do modelo aparece como texto (não executa)", "<script>" in a.inner_text() and a.locator(".ai-md script").count() == 0 and not dialogs)
        ask(pB, "teste <b>")
        a = last_answer(pB)
        check("markdown seguro: sem HTML injetado e sem links do modelo", a.locator(".ai-md b").count() == 0 and a.locator(".ai-md a").count() == 0 and a.locator(".ai-md strong").count() == 1 and "<b>html</b>" in a.inner_text())
        # excluir conversa
        n_before = pB.locator(".ai-convs li").count(); pB.locator("[data-testid=ai-del]").first.click(); pB.wait_for_timeout(600)
        check("excluir conversa remove do banco e da lista", pB.locator(".ai-convs li").count() == n_before - 1 and len([c for c in ai_state()["ai_conversations"] if c["user_id"] in uid_b]) == n_before - 1)
        ctxB.close()
        # PRO: ilimitado
        mk(f"/__set_plan?email={uA}&plan=pro"); open_ai(pg)
        check("PRO: cota ilimitada (uso justo)", "ilimitadas" in quota(pg), quota(pg))
        ask(pg, "Analise o SOL"); check("PRO envia além de 3 mensagens", last_answer(pg).locator("[data-testid=ai-asset]").count() == 1 and "SOL" in last_answer(pg).inner_text())
        ask(pg, "Mostre o histórico do BTC"); ch = last_answer(pg).locator("[data-testid=ai-chart]")
        check("histórico de preços vira gráfico (dados do motor)", ch.count() == 1 and ch.locator("svg polyline").count() == 1)
        # Anthropic
        ctx3 = b.new_context(); p3 = ctx3.new_page(); login(p3, uA, base=B3); open_ai(p3, base=B3); ask(p3, "Analise o ETH")
        c = llm()["calls"][-1]
        check("adaptador Anthropic: ferramenta + resposta com cartão", c["provider"] == "anthropic" and c["results"] == 1 and last_answer(p3).locator("[data-testid=ai-asset]").count() == 1)
        ctx3.close()
        # mobile
        mctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); mp = mctx.new_page(); mp.on("pageerror", lambda e: errs.append(str(e)[:60] + " (mobile)"))
        login(mp, uA); open_ai(mp, f"?c={conv['id']}")
        check("mobile: sem rolagem horizontal com cartões", mp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check("mobile: barra inferior com TRADEON AI ativa", "TRADEON AI" in mp.locator("#bn").inner_text() and "TRADEON AI" in mp.locator("#bn .on").inner_text())
        mp.click(".ai-menu-btn"); check("mobile: histórico abre pelo botão", mp.locator(".ai-side.open").is_visible())
        mctx.close()
        check_js(errs)
        b.close()
finally:
    stop(s1); stop(s2); stop(s3); stop(m); stop(sb)
finish()
