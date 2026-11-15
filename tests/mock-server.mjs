// Servidor MOCK usado SOMENTE em testes e2e (simula respostas de CoinGecko/NewsAPI). Nunca usado em produção.
import http from "node:http";
const now = () => new Date().toISOString();
const coin = (id, sym, name, price, ch, base) => ({ id, symbol: sym, name, current_price: price, price_change_percentage_24h: ch, last_updated: now(), sparkline_in_7d: { price: Array.from({ length: 80 }, (_, i) => base + Math.sin(i / 6) * base * 0.03 + i * base * 0.0004) } });
const markets = [coin("bitcoin", "btc", "Bitcoin", 64000, 2.4, 64000), coin("ethereum", "eth", "Ethereum", 3100, -1.1, 3100), coin("solana", "sol", "Solana", 150, 4.8, 150), coin("binancecoin", "bnb", "BNB", 600, 0.8, 600), coin("ripple", "xrp", "XRP", 0.5, -1.2, 0.5), coin("nullcoin", "nul", "Null", null, null, 1)];
const gen = Array.from({ length: 54 }, (_, i) => coin(`coin-${i + 7}`, `c${i + 7}`, `Coin ${i + 7}`, 10 + i, (i % 7) - 3, 10 + i));
const all = [...markets, ...gen];
const days = Array.from({ length: 5 }, (_, i) => new Date(Date.now() - (4 - i) * 86400e3).toISOString().slice(0, 10));
const fx = { rates: Object.fromEntries(days.map((d, i) => [d, { BRL: 5 + i * 0.1, EUR: 0.9, GBP: 0.8, JPY: 150, CAD: 1.3, AUD: 1.5, CHF: 0.88, MXN: 17, CNY: 7.1, ZAR: 18 }])) };
const articles = [1, 2, 3].map((i) => ({ title: `Manchete de teste ${i}`, url: `https://exemplo.test/n/${i}`, publishedAt: new Date(Date.now() - i * 3600e3).toISOString(), source: { name: "Fonte Teste" } }));
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), send = (c, b) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
  if (u.pathname.startsWith("/ok/coins/markets")) {
    const ids = u.searchParams.get("ids"); if (ids) return send(200, all.filter((c) => ids.split(",").includes(c.id)));
    const per = +(u.searchParams.get("per_page") || 25), page = +(u.searchParams.get("page") || 1); return send(200, all.slice((page - 1) * per, page * per));
  }
  const det = u.pathname.match(/^\/ok\/coins\/([^/]+)$/);
  if (det && det[1] !== "markets") {
    if (det[1] === "coin-9") return send(500, { error: "detail down" });
    const c = all.find((x) => x.id === det[1]); if (!c) return send(404, {});
    return send(200, { id: c.id, description: { en: "<p>Descrição de teste do <b>ativo</b>. Segunda frase.</p>" }, categories: ["Cat A", "Cat B"], market_data: { market_cap: { usd: 1.2e12 }, total_volume: { usd: 3e10 }, high_24h: { usd: 65000 }, low_24h: { usd: 63000 }, ath: { usd: 73000 }, circulating_supply: 19700000 } });
  }
  if (u.pathname.startsWith("/ok/search")) {
    globalThis.__searchCalls = (globalThis.__searchCalls || 0) + 1;
    const q = (u.searchParams.get("query") || "").toLowerCase();
    if (q === "slowcoin") await new Promise((r) => setTimeout(r, 900));
    return send(200, { coins: all.filter((c) => c.id.includes(q) || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase() === q).map((c, i) => ({ id: c.id, name: c.name, symbol: c.symbol, market_cap_rank: all.indexOf(c) + 1 })) });
  }
  // RSS (provedor de notícias sem chave): /rss/<url-original-codificada>. "moneytimes.com.br/economia" fica fora do ar (falha parcial).
  if (u.pathname.startsWith("/rss/")) {
    const src = decodeURIComponent(u.pathname.slice(5)); if (src.includes("/economia/")) { res.writeHead(503); return res.end("down"); }
    const name = new URL(src).hostname.replace("www.", ""), t = (h) => new Date(Date.now() - h * 3600e3).toUTCString();
    const items = [1, 2, 3].map((i) => `<item><title><![CDATA[${name.includes("livecoins") || name.includes("coin") ? "Bitcoin" : name.includes("investinglive") ? "USD/JPY Nasdaq CPI" : "Ibovespa e dólar"} — RSS ${name} ${i} &amp; mais]]></title><link>https://${name}/n/${i}?utm_source=rss</link><pubDate>${t(i + (src.length % 5))}</pubDate></item>`).join("")
      + `<item><title>Velha</title><link>https://${name}/old</link><pubDate>${t(24 * 30)}</pubDate></item><item><title>XSS</title><link>javascript:alert(1)</link><pubDate>${t(1)}</pubDate></item>`;
    res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" }); return res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>${items}</channel></rss>`);
  }
  // Bybit pública (lista de pares spot): só alguns ativos do mock "existem" na Bybit.
  if (u.pathname === "/bybitpub/v5/market/instruments-info") return send(200, { retCode: 0, result: { list: [...["BTC", "ETH", "SOL", "XRP", "C7", "C8", "C9"].map((b) => ({ baseCoin: b, quoteCoin: "USDT", status: "Trading" })), { baseCoin: "C10", quoteCoin: "USDT", status: "Closed" }, { baseCoin: "C11", quoteCoin: "USDC", status: "Trading" }] } });
  if (u.pathname === "/__search_calls") return send(200, { n: globalThis.__searchCalls || 0 });
  if (u.pathname.startsWith("/ok/fx")) return send(200, fx);
  const ev = u.pathname.match(/^\/(ok|part)\/everything/);
  if (ev) {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    const cat = q.startsWith('"') || q.includes("bolsa or economia") || q.includes("stocks or economy") ? null : q.includes("ethereum") ? "crypto" : (q.includes("ibovespa") || q.includes("nasdaq")) ? "stocks" : (q.includes("inflação") || q.includes("inflation")) ? "economy" : (q.includes("câmbio") || q.includes("exchange rate")) ? "forex" : null;
    if (!cat) return send(200, { status: "ok", articles });
    if (ev[1] === "part" && cat === "forex") return send(500, { error: "forex down" });
    const lang = u.searchParams.get("language") || "pt", size = +(u.searchParams.get("pageSize") || 20), page = +(u.searchParams.get("page") || 1);
    const label = { crypto: "Cripto", stocks: "Bolsa", economy: "Economia", forex: "Câmbio" }[cat], off = { crypto: 0, stocks: 5, economy: 10, forex: 15 }[cat];
    const mk = (i) => ({ title: `${lang === "en" ? "EN " : ""}${label} ${i}`, url: `https://exemplo.test/${cat}/${i}`, publishedAt: new Date(Date.now() - (i * 20 + off) * 60e3).toISOString(), source: { name: `Fonte ${label}` } });
    let list = Array.from({ length: 25 }, (_, i) => mk(i + 1));
    if (cat === "crypto") list.splice(1, 0, { ...mk(1), url: "https://exemplo.test/crypto/1?utm_source=x" }, { ...mk(99), title: null }, { ...mk(98), title: "[Removed]" }, { ...mk(97), title: "Cripto antiga", publishedAt: new Date(Date.now() - 30 * 86400e3).toISOString() });
    if (cat === "stocks") list.splice(2, 0, { ...mk(50), title: "Cripto 2" });   // título repetido de outra categoria
    return send(200, { status: "ok", articles: list.slice((page - 1) * size, page * size) });
  }
  // ----- Corretoras (somente testes): Bybit v5 e Binance spot/futuros com verificação real da assinatura HMAC -----
  if (u.pathname.startsWith("/bybitx/") || u.pathname.startsWith("/bnx/") || u.pathname.startsWith("/bnf/")) {
    const { createHmac } = await import("node:crypto");
    const KEYS = { TESTKEYBYBIT0001: { s: "TESTSECRETBYBIT0001", kind: "ok" }, WITHDRAWKEY00001: { s: "WITHDRAWSECRET0001", kind: "withdraw" }, TESTKEYBINANCE01: { s: "TESTSECRETBINANCE1", kind: "ok" }, BNWITHDRAWKEY001: { s: "BNWITHDRAWSECRET1", kind: "withdraw" } };
    globalThis.__brokerCalls = (globalThis.__brokerCalls || 0) + 1;
    if (u.pathname === "/bybitx/__state" || u.pathname === "/bnx/__state") return send(200, { calls: globalThis.__brokerCalls });
    if (u.pathname.startsWith("/bybitx/")) {
      const k = req.headers["x-bapi-api-key"], ts = req.headers["x-bapi-timestamp"], rw = req.headers["x-bapi-recv-window"], sig = req.headers["x-bapi-sign"]; const entry = KEYS[k];
      const ok = entry && sig === createHmac("sha256", entry.s).update(ts + k + rw + u.search.slice(1)).digest("hex");
      if (!ok) return send(200, { retCode: 10003, retMsg: "API key is invalid.", result: {} });
      const R = (result) => send(200, { retCode: 0, retMsg: "OK", result, time: Date.now() }); const now = Date.now(); const p = u.pathname.replace("/bybitx", "");
      if (p === "/v5/user/query-api") return R({ readOnly: 1, ips: ["*"], expiredAt: "", permissions: { ContractTrade: [], Spot: [], Wallet: entry.kind === "withdraw" ? ["AccountTransfer", "Withdraw"] : [], Options: [], Derivatives: [] } });
      if (p === "/v5/account/wallet-balance") return R({ list: [{ accountType: "UNIFIED", totalEquity: "10523.45", totalWalletBalance: "10400.00", totalAvailableBalance: "8123.10", totalPerpUPL: "123.45", coin: [{ coin: "USDT", walletBalance: "8400", availableToWithdraw: "8123.1", usdValue: "8400", unrealisedPnl: "123.45" }, { coin: "BTC", walletBalance: "0.03", availableToWithdraw: "0.03", usdValue: "1923.45" }, { coin: "ETH", walletBalance: "0", usdValue: "0" }] }] });
      if (p === "/v5/position/list") return R({ list: [{ symbol: "BTCUSDT", side: "Buy", size: "0.05", avgPrice: "62000", markPrice: "64469", unrealisedPnl: "123.45", leverage: "10", liqPrice: "56500", takeProfit: "70000", stopLoss: "60000", positionValue: "3100", createdTime: String(now - 864e5) }, { symbol: "ETHUSDT", side: "", size: "0", avgPrice: "0" }] });
      if (p === "/v5/order/realtime") return R({ list: [{ orderId: "o-1", symbol: "SOLUSDT", side: "Buy", orderType: "Limit", price: "140.5", qty: "3", cumExecQty: "0", reduceOnly: false, createdTime: String(now - 36e5) }] });
      if (p === "/v5/execution/list") return R({ list: u.searchParams.get("category") === "spot" ? [{ execId: "e-s1", symbol: "BTCUSDT", side: "Buy", execPrice: "61000", execQty: "0.03", execFee: "0.00003", feeCurrency: "BTC", execTime: String(now - 2 * 864e5) }]
        : [{ execId: "e-1", symbol: "BTCUSDT", side: "Buy", execPrice: "62000", execQty: "0.05", execFee: "1.55", feeCurrency: "USDT", execTime: String(now - 864e5) }, { execId: "e-2", symbol: "ETHUSDT", side: "Sell", execPrice: "1800", execQty: "1", execFee: "0.9", feeCurrency: "USDT", execTime: String(now - 3 * 864e5) }] });
      if (p === "/v5/position/closed-pnl") return R({ list: [{ symbol: "ETHUSDT", side: "Sell", closedSize: "1", avgEntryPrice: "1750", avgExitPrice: "1800", closedPnl: "48.2", updatedTime: String(now - 3 * 864e5) }, { symbol: "SOLUSDT", side: "Buy", closedSize: "5", avgEntryPrice: "150", avgExitPrice: "152", closedPnl: "-10.7", updatedTime: String(now - 4 * 864e5) }] });
      return send(200, { retCode: 10001, retMsg: "unknown", result: {} });
    }
    // Binance
    const k = req.headers["x-mbx-apikey"], entry = KEYS[k]; const p = u.pathname.replace(/^\/bn[xf]/, "");
    if (p === "/api/v3/ticker/price") return send(200, [{ symbol: "BTCUSDT", price: "64000" }, { symbol: "ETHUSDT", price: "1800" }]);
    const q = new URLSearchParams(u.search); const sig = q.get("signature"); q.delete("signature");
    if (!entry || sig !== createHmac("sha256", entry.s).update(q.toString()).digest("hex")) return send(401, { code: -2014, msg: "API-key format invalid." });
    if (p === "/sapi/v1/account/apiRestrictions") return send(200, { ipRestrict: false, enableReading: true, enableWithdrawals: entry.kind === "withdraw", enableSpotAndMarginTrading: false, enableFutures: false, createTime: Date.now() });
    if (p === "/api/v3/account") return send(200, { balances: [{ asset: "BTC", free: "0.01", locked: "0" }, { asset: "USDT", free: "500", locked: "20" }] });
    if (p === "/fapi/v2/account") return send(200, { totalWalletBalance: "1000", totalUnrealizedProfit: "-25.5", totalMarginBalance: "974.5", availableBalance: "800", assets: [{ asset: "USDT", walletBalance: "1000", availableBalance: "800" }] });
    if (p === "/fapi/v2/positionRisk") return send(200, [{ symbol: "ETHUSDT", positionAmt: "-0.5", entryPrice: "1750", markPrice: "1801", unRealizedProfit: "-25.5", leverage: "5", liquidationPrice: "2100", notional: "-900.5" }, { symbol: "BTCUSDT", positionAmt: "0" }]);
    if (p === "/fapi/v1/openOrders") return send(200, []);
    if (p === "/fapi/v1/income") return send(200, [{ symbol: "ETHUSDT", incomeType: "REALIZED_PNL", income: "15.25", time: Date.now() - 2 * 864e5 }]);
    if (p === "/fapi/v1/userTrades") return send(200, [{ id: 77, symbol: q.get("symbol"), side: "SELL", price: "1750", qty: "0.5", commission: "0.35", commissionAsset: "USDT", time: Date.now() - 864e5 }]);
    return send(404, { code: -1, msg: "unknown" });
  }
  // ----- Binance data-api (somente testes): velas sintéticas determinísticas por símbolo -----
  if (u.pathname.startsWith("/binance/")) {
    const KNOWN = { BTCUSDT: [60000, 1], ETHUSDT: [3000, -1], SOLUSDT: [150, 1], XRPUSDT: [0.6, 0], DOGEUSDT: [0.12, -1], USDCUSDT: [1, 0], ETHBTC: [0.05, 0] };
    const TF = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
    const gen = (sym, tf, n) => { const [base, drift] = KNOWN[sym]; const ms = TF[tf]; const last = Math.floor(Date.now() / ms) * ms; let p = base * (drift > 0 ? 0.7 : drift < 0 ? 1.4 : 1); const out = [];
      const step = (base * (drift > 0 ? 0.3 : drift < 0 ? -0.4 : 0)) / n;
      for (let i = 0; i < n; i++) { const w = Math.sin(i / 3.2) * base * 0.012 + Math.sin(i / 11) * base * 0.02; const o = p; p = Math.max(base * 0.05, p + step); const c = p + w; const hi = Math.max(o, c) * 1.004, lo = Math.min(o, c) * 0.996;
        out.push([last - (n - 1 - i) * ms, String(o), String(hi), String(lo), String(c), String(1000 + (i % 7) * 120), last - (n - 1 - i) * ms + ms - 1, "0", 10, "0", "0", "0"]); p = c; }
      return out; };
    if (u.pathname === "/binance/klines") { const sym = u.searchParams.get("symbol"), tf = u.searchParams.get("interval"); if (!KNOWN[sym] || !TF[tf]) return send(400, { code: -1121, msg: "Invalid symbol." }); globalThis.__klines = (globalThis.__klines || 0) + 1; return send(200, gen(sym, tf, Math.min(+u.searchParams.get("limit") || 300, 1000))); }
    if (u.pathname === "/binance/ticker/24hr") {
      const t = (sym) => { const k = gen(sym, "1h", 30); const last = +k[k.length - 1][4], prev = +k[k.length - 25][4]; return { symbol: sym, lastPrice: String(last), priceChangePercent: String(((last - prev) / prev) * 100), highPrice: String(last * 1.02), lowPrice: String(last * 0.98), quoteVolume: String(KNOWN[sym][0] * 1e6), closeTime: Date.now() }; };
      const sym = u.searchParams.get("symbol"); if (sym) return KNOWN[sym] ? send(200, t(sym)) : send(400, { code: -1121, msg: "Invalid symbol." });
      return send(200, Object.keys(KNOWN).map(t));
    }
    return send(404, {});
  }
  // ----- Modelos de linguagem (somente testes): OpenAI Chat Completions e Anthropic Messages com chamadas de ferramenta -----
  if (u.pathname.startsWith("/llm/")) {
    const st = (globalThis.__llm ||= { calls: [] });
    if (u.pathname === "/llm/__state") return send(200, st);
    if (u.pathname === "/llm/__reset") { globalThis.__llm = { calls: [] }; return send(200, {}); }
    const body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d)); } catch { r({}); } }); });
    const anth = u.pathname.endsWith("/v1/messages");
    const key = anth ? req.headers["x-api-key"] : (req.headers.authorization || "").replace(/^Bearer /, "");
    if (key !== "sk-test-llm") return send(401, { error: { message: "bad key" } });
    if (req.method === "GET" && /\/models$/.test(u.pathname)) return send(200, { object: "list", data: [{ id: "test-model" }, { id: "models/gemini-flash-test" }] });
    if (/oi-modelo-errado/.test(JSON.stringify(body.model || ""))) return send(404, { error: { message: "model not found" } });
    const msgs = body.messages || []; const textOf = (m) => typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter((c) => c.type === "text").map((c) => c.text).join(" ") : "";
    let li = -1; for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user" && textOf(msgs[i])) { li = i; break; }
    const q = li >= 0 ? textOf(msgs[li]) : ""; const after = msgs.slice(li + 1);
    const results = anth ? after.filter((m) => m.role === "user").flatMap((m) => m.content.filter((c) => c.type === "tool_result").map((c) => c.content)) : after.filter((m) => m.role === "tool").map((m) => m.content);
    st.calls.push({ provider: anth ? "anthropic" : "openai", model: body.model, system: anth ? body.system : msgs[0]?.content, nMessages: msgs.length, tools: (body.tools || []).map((t) => t.name || t.function?.name), q, results: results.length });
    if (/falhe/i.test(q)) return send(500, { error: { message: "boom" } });
    let call = null;
    if (!results.length) {
      const m = q.match(/\b(BTC|ETH|SOL|XRP|DOGE|XYZ)\b/i);
      if (/melhores|scan/i.test(q)) call = { name: "scan_opportunities", args: { direction: "alta", limit: 3 } };
      else if (/compare/i.test(q)) call = { name: "compare_assets", args: { symbols: ["BTC", "ETH"] } };
      else if (/hist[óo]rico/i.test(q) && m) call = { name: "get_asset_history", args: { symbol: m[1], timeframe: "1d", periods: 60 } };
      else if (/PETR4/i.test(q)) call = { name: "get_asset_indicators", args: { symbol: "PETR4", asset_class: "stock_br" } };
      else if (m) call = { name: "get_asset_indicators", args: { symbol: m[1] } };
      else if (/not[íi]cia/i.test(q)) call = { name: "search_market_news", args: { query: "bitcoin" } };
      else if (/calend[áa]rio/i.test(q)) call = { name: "get_economic_calendar", args: {} };
    }
    let text;
    if (call) {
      if (anth) return send(200, { id: "msg_t", type: "message", role: "assistant", stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 10 }, content: [{ type: "tool_use", id: "tu_1", name: call.name, input: call.args }] });
      return send(200, { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 10 } });
    }
    if (results.length) {
      let d = {}; try { d = JSON.parse(results[0]); } catch {}
      if (d.summary) text = `### Leitura rápida\n**${d.asset.display}** a ${d.quote?.price ?? "?"} (fonte: ${d.source}).\n\n### Viés\n${d.summary.verdict} · Score ${d.summary.score}/100\n\n- item de lista\n\nConteúdo educacional; não é recomendação de investimento.`;
      else if (d.hits) text = `### Triagem\n${d.hits.map((h) => `- ${h.display}: score ${h.score}`).join("\n")}\n\nConteúdo educacional; não é recomendação de investimento.`;
      else if (d.error) text = `Não tenho dados para isso: ${d.error}. <script>alert(1)</script>`;
      else text = `Dados recebidos: ${Object.keys(d).join(", ")}.`;
    } else text = /<b>/.test(q) ? "Texto com <b>html</b> e [link](https://evil.example) e **negrito**." : `Um FII é um fundo imobiliário. **Explicação educativa.**`;
    if (anth) return send(200, { id: "msg_t", type: "message", role: "assistant", stop_reason: "end_turn", usage: { input_tokens: 120, output_tokens: 40 }, content: [{ type: "text", text }] });
    return send(200, { choices: [{ message: { role: "assistant", content: text } }], usage: { prompt_tokens: 120, completion_tokens: 40 } });
  }
  // ----- Stripe (somente testes): sessões de checkout/portal e assinaturas consultadas pelo webhook -----
  if (u.pathname.startsWith("/stripe/")) {
    const st = (globalThis.__stripe ||= { checkouts: [], portals: [], subs: {} });
    if (u.pathname === "/stripe/__state") return send(200, st);
    if (u.pathname === "/stripe/__reset") { globalThis.__stripe = { checkouts: [], portals: [], subs: {} }; return send(200, {}); }
    const body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
    if (u.pathname === "/stripe/__sub" && req.method === "POST") { const o = JSON.parse(body); st.subs[o.id] = o; return send(200, {}); }
    if (!(req.headers.authorization || "").startsWith("Bearer sk_test_")) return send(401, { error: { type: "invalid_request_error", code: "api_key_invalid" } });
    const form = Object.fromEntries(new URLSearchParams(body));
    if (u.pathname === "/stripe/v1/checkout/sessions" && req.method === "POST") { const id = "cs_test_" + (st.checkouts.length + 1); st.checkouts.push({ id, form, idem: req.headers["idempotency-key"] || null }); return send(200, { id, url: "https://checkout.stripe.test/c/pay/" + id }); }
    if (u.pathname === "/stripe/v1/billing_portal/sessions" && req.method === "POST") { st.portals.push(form); return send(200, { id: "bps_test", url: "https://billing.stripe.test/p/session/bps_test" }); }
    const m = u.pathname.match(/^\/stripe\/v1\/subscriptions\/([^/]+)$/);
    if (m && req.method === "GET") return st.subs[m[1]] ? send(200, st.subs[m[1]]) : send(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    return send(404, { error: { type: "invalid_request_error" } });
  }
  if (u.pathname.startsWith("/rl/")) return send(429, { error: "rate" });
  if (u.pathname.startsWith("/down/")) return send(500, { error: "boom" });
  send(404, {});
}).listen(4010, "127.0.0.1", () => console.log("mock on 4010"));
