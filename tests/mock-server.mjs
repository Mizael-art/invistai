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
  if (u.pathname.startsWith("/rl/")) return send(429, { error: "rate" });
  if (u.pathname.startsWith("/down/")) return send(500, { error: "boom" });
  send(404, {});
}).listen(4010, "127.0.0.1", () => console.log("mock on 4010"));
