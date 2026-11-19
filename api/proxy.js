// M Ahmad Crypto Ai — server-side market-data proxy.
// The phone app calls /api/proxy?url=<exchange URL> instead of the exchange
// directly, so ISP/DNS blocks on the user's phone cannot stop live data.
// Only public market-data hosts are allowlisted. No credentials, no keys,
// no funds, no trading — public GET endpoints only.
var ALLOWED_HOSTS = new Set([
  "fapi.binance.com",
  "data-api.binance.vision",
  "api.binance.com",
  "api.coingecko.com",
  "api.coinpaprika.com",
  "www.okx.com",
  "api.bitget.com",
  "api.gateio.ws",
  "api.bybit.com",
  "api.gold-api.com",
]);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  var target = req.query.url;
  if (!target || typeof target !== "string") {
    return res.status(400).json({ error: "missing ?url=" });
  }
  var u;
  try {
    u = new URL(target);
  } catch (e) {
    return res.status(400).json({ error: "bad url" });
  }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) {
    return res.status(403).json({ error: "host not allowed: " + u.hostname });
  }

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 9000);
  try {
    var r = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "m-ahmad-crypto-ai/1.0" },
    });
    clearTimeout(timer);
    var text = await r.text();
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    res.status(r.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).json({ error: "upstream failed: " + (e && e.message ? e.message : "fetch error") });
  }
};
