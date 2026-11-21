// M Ahmad Crypto Ai — TraderSpy-style dashboard (simple version).
// One screen: auto-scan crypto + gold, show BEST trades, plus:
//  - Signals Feed: every signal logged with its real outcome
//    (Hit TP1/TP2/TP3, Stopped, Expired after 24h) and a win rate.
//  - Market Brief: a short auto summary of the market right now.
//  - Market Insight: Fear & Greed, BTC dominance, BTC/ETH long-short
//    ratio, top movers.
//  - Paper Trades: practice any setup with $5 virtual risk — TP/SL
//    are tracked live against real prices, no real money.
// All analysis runs here in the background (trend / EMA / RSI / MACD /
// volume / support-resistance / ATR / 15m confirmation). No fake data:
// if live data fails, show an error, never an invented price.
(function () {
  "use strict";
  var BASE_COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","AVAXUSDT","LTCUSDT","DOTUSDT","NEARUSDT","SUIUSDT","ARBUSDT","OPUSDT","PEPEUSDT","WIFUSDT","TAOUSDT","APTUSDT","ATOMUSDT","PAXGUSDT",
    // Binance futures coins (mostly NOT on Binance spot — scanned via Bitget Futures candles)
    "BLESSUSDT","HUMAUSDT","SENTUSDT","MMTUSDT","BREVUSDT","ZKCUSDT","LUNCUSDT","INITUSDT","LYNUSDT",
    // Extra liquid futures coins — fallback list of 50 coins + gold
    "ENAUSDT","ONDOUSDT","JUPUSDT","TIAUSDT","SEIUSDT","INJUSDT","RENDERUSDT","FETUSDT","PYTHUSDT","STRKUSDT","WLDUSDT","FLOKIUSDT","BONKUSDT","SHIBUSDT","TRXUSDT","XLMUSDT","HBARUSDT","ALGOUSDT","VETUSDT","FILUSDT"];
  // Coins Waqar follows — always deep-scanned even if their volume is low.
  var WATCHLIST = ["BLESSUSDT","HUMAUSDT","SENTUSDT","MMTUSDT","BREVUSDT","ZKCUSDT","LUNCUSDT","INITUSDT","LYNUSDT","PAXGUSDT"];
  var universe = {screened: 0, gainers: [], losers: []};
  // Stage 1 — screen the WHOLE market in 2 requests: Binance spot tickers
  // (784 USDT pairs) + Bitget futures tickers (892 USDT contracts). That is
  // ~800 coins screened every scan. Stage 2 deep-scans only the top 100 by
  // 24h volume + the biggest movers + the watchlist — full candles for all
  // 800 would take minutes and get the app rate-limited. This is the same
  // idea as the Crypto Bubbles app (top 1000 by market data), but for
  // futures: volume + 24h move decide who gets the full check.
  function screenUniverse() {
    var stables = {USDT: 1, USDC: 1, FDUSD: 1, USDD: 1, DAI: 1, TUSD: 1, BUSD: 1, USD1: 1, USDP: 1, GUSD: 1, PYUSD: 1, EUR: 1, AEUR: 1, XUSD: 1, SUSD: 1};
    // Bitget also lists tokenized US stocks/ETFs (AAPL, TSLA, SOXL, XAU …) —
    // not crypto Waqar trades, so they are excluded from the screen.
    var stocks = {AAPL: 1, TSLA: 1, NVDA: 1, AMZN: 1, GOOGL: 1, GOOG: 1, MSFT: 1, META: 1, AMD: 1, NFLX: 1, PLTR: 1, COIN: 1, MSTR: 1, SPY: 1, QQQ: 1, DIA: 1, IWM: 1, SOXL: 1, SOXS: 1, SOXLB: 1, SOXSB: 1, TSLL: 1, TSLQ: 1, NVDL: 1, NVDQ: 1, AMDL: 1, AAPB: 1, MSFU: 1, METU: 1, MSTX: 1, MSTU: 1, PLTU: 1, CONI: 1, CRCL: 1, HOOD: 1, IBIT: 1, UVXY: 1, SVXY: 1, VXX: 1, XAU: 1, XAG: 1, SNDK: 1, SKDD: 1, SKUU: 1, MUU: 1, H: 1};
    function isJunk(sym) {
      if (!/USDT$/.test(sym)) return true;
      var base = sym.replace(/USDT$/, "");
      if (stables[base] || stocks[base]) return true;
      if (/UP$|DOWN$|BULL$|BEAR$/.test(base)) return true;
      return false;
    }
    var binP = getJSON(SAPI + "/ticker/24hr", 15000).then(function (arr) {
      var m = {};
      (arr || []).forEach(function (t) {
        if (isJunk(t.symbol)) return;
        m[t.symbol] = {vol: parseFloat(t.quoteVolume) || 0, chg: parseFloat(t.priceChangePercent) || 0};
      });
      return m;
    });
    var bgP = getJSON("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", 15000).then(function (j) {
      var m = {};
      ((j && j.data) || []).forEach(function (t) {
        if (isJunk(t.symbol)) return;
        m[t.symbol] = {vol: parseFloat(t.quoteVolume) || 0, chg: (parseFloat(t.change24h) || 0) * 100};
      });
      return m;
    });
    return Promise.all([binP, bgP]).then(function (pair) {
      var merged = {};
      [pair[0], pair[1]].forEach(function (m) {
        Object.keys(m).forEach(function (sym) {
          if (!merged[sym] || m[sym].vol > merged[sym].vol) merged[sym] = m[sym];
        });
      });
      var all = Object.keys(merged).map(function (sym) { return {sym: sym, vol: merged[sym].vol, chg: merged[sym].chg}; })
        .filter(function (x) { return x.vol > 1000000; }); // at least $1M 24h volume
      universe.screened = all.length;
      all.sort(function (a, b) { return b.vol - a.vol; });
      var list = all.slice(0, 80).map(function (x) { return x.sym; });
      var byChg = all.slice().sort(function (a, b) { return b.chg - a.chg; });
      var gainers = byChg.filter(function (x) { return x.chg > 0; }).slice(0, 8);
      var losers = byChg.slice(-8).reverse().filter(function (x) { return x.chg < 0; });
      universe.gainers = gainers; universe.losers = losers;
      gainers.concat(losers).forEach(function (x) { if (list.indexOf(x.sym) < 0) list.push(x.sym); });
      WATCHLIST.forEach(function (sym) { if (list.indexOf(sym) < 0) list.push(sym); });
      return {list: list.slice(0, 100), screened: all.length};
    });
  }
  // Coins actually listed on Binance spot — only these go in the live list ticker call.
  var LIST_COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","AVAXUSDT","LTCUSDT","DOTUSDT","NEARUSDT","SUIUSDT","ARBUSDT","OPUSDT","PEPEUSDT","WIFUSDT","TAOUSDT","APTUSDT","ATOMUSDT","PAXGUSDT"];
  var RISK = 5; // $ per trade, fixed
  var SAPI = "https://data-api.binance.vision/api/v3";
  var $ = function (id) { return document.getElementById(id); };
  var scanning = false, lastScanAt = 0, nextTimer = null;

  var scanMap = {};       // symbol -> {k1h, k15, source, lastPrice}
  var lastTrade = {};     // prefix ("C"/"G"/"A") -> last shown trade object
  var lastTickers = null; // Binance 24h tickers array
  var fgValue = null, fgLabel = null, btcDom = null, lsBtc = null, lsEth = null;
  var lastScanSummary = null;

  function fmt(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1000) return p.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.1) return p.toFixed(4);
    return String(Number(p.toPrecision(5)));
  }
  function fmtQty(q) {
    if (!isFinite(q) || q <= 0) return "—";
    if (q >= 1000) return q.toLocaleString("en-US", {maximumFractionDigits: 0});
    if (q >= 1) return q.toFixed(2);
    return String(Number(q.toPrecision(4)));
  }
  function fmtMoney(n) { return (n >= 0 ? "+$" : "-$") + Math.abs(n).toFixed(2); }
  function timeStr(ms) { return new Date(ms).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}); }
  function proxied(url) { return "/api/proxy?url=" + encodeURIComponent(url); }
  function fetchJSON(url, ms) {
    ms = ms || 9000;
    return new Promise(function (resolve, reject) {
      var c = new AbortController();
      var t = setTimeout(function () { c.abort(); }, ms);
      fetch(url, {signal: c.signal}).then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(resolve, function (e) { clearTimeout(t); reject(e); });
    });
  }
  // Proxy first (works on the user's phone), direct as fallback.
  function getJSON(url, ms) {
    return fetchJSON(proxied(url), ms).catch(function () { return fetchJSON(url, ms); });
  }
  function ema(values, period) {
    var k = 2 / (period + 1), out = [], prev = null;
    for (var i = 0; i < values.length; i++) {
      prev = prev == null ? values[i] : values[i] * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  }
  function rsi(closes, period) {
    period = period || 14;
    if (closes.length < period + 2) return 50;
    var gains = 0, losses = 0;
    for (var i = closes.length - period; i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    var rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  }
  function atr(klines, period) {
    period = period || 14;
    var trs = [];
    for (var i = 1; i < klines.length; i++) {
      var h = klines[i][2], l = klines[i][3], pc = klines[i][4 - 1];
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    var s = trs.slice(-period);
    return s.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, s.length);
  }
  function macdOK(closes, dir) {
    // MACD histogram direction: EMA12 - EMA26 rising for LONG, falling for SHORT.
    var e12 = ema(closes, 12), e26 = ema(closes, 26);
    var n = closes.length;
    var now = e12[n - 1] - e26[n - 1], prev = e12[n - 4] - e26[n - 4];
    return dir === "LONG" ? now > prev : now < prev;
  }

  function analyze(symbol, k1h, k15m) {
    var closes = k1h.map(function (k) { return parseFloat(k[4]); });
    var vols = k1h.map(function (k) { return parseFloat(k[5]); });
    var n = closes.length;
    if (n < 60) return null;
    var e20 = ema(closes, 20), e50 = ema(closes, 50);
    var price = closes[n - 1];
    var r = rsi(closes, 14);
    var a = atr(k1h, 14);
    if (!a || a <= 0) return null;
    var volAvg = vols.slice(-21, -1).reduce(function (x, y) { return x + y; }, 0) / 20;
    var volRatio = volAvg > 0 ? vols[n - 1] / volAvg : 0;
    var c15 = k15m.map(function (k) { return parseFloat(k[4]); });
    var e20_15 = ema(c15, 20), e50_15 = ema(c15, 50);
    var swingLow = Math.min.apply(null, k1h.slice(-20).map(function (k) { return parseFloat(k[3]); }));
    var swingHigh = Math.max.apply(null, k1h.slice(-20).map(function (k) { return parseFloat(k[2]); }));
    var chg24 = ((price - closes[Math.max(0, n - 25)]) / closes[Math.max(0, n - 25)]) * 100;

    var out = {symbol: symbol, price: price, rsi: r, atr: a, volRatio: volRatio, chg: chg24, dir: null, score: 0, why: ""};
    // LONG gates — all must pass
    var longTrend = price > e20[n - 1] && e20[n - 1] > e50[n - 1];
    var long15 = c15[c15.length - 1] > e20_15[e20_15.length - 1] && e20_15[e20_15.length - 1] > e50_15[e50_15.length - 1];
    var longRsi = r >= 42 && r <= 68;
    var longVol = volRatio >= 0.9;
    var longMacd = macdOK(closes, "LONG");
    if (longTrend && long15 && longRsi && longVol && longMacd) {
      out.dir = "LONG";
      out.score = 60 + Math.min(20, volRatio * 8) + (r >= 50 && r <= 62 ? 10 : 4) + (chg24 > 0 ? 5 : 0);
      out.why = "Uptrend on 1H + 15m, RSI " + r.toFixed(0) + ", volume " + volRatio.toFixed(2) + "x average, MACD rising.";
      var sl = Math.min(swingLow, price - 1.5 * a);
      if (price - sl < 0.004 * price) sl = price - 1.5 * a;
      if (price - sl > 0.03 * price) sl = price - 0.03 * price;
      // GOLD (PAXG) intraday cap: 1H ATR on gold is huge (~$55), so 1.5x ATR
      // makes SL ~$82 and TP3 ~$164 away — almost 2x a normal day's whole
      // range. Cap gold risk distance at $25: TP1 $25, TP2 $37.50, TP3 $50.
      if (symbol === "PAXGUSDT" && price - sl > 25) sl = price - 25;
      out.sl = sl; out.r = price - sl;
      return out;
    }
    // SHORT gates — all must pass
    var shortTrend = price < e20[n - 1] && e20[n - 1] < e50[n - 1];
    var short15 = c15[c15.length - 1] < e20_15[e20_15.length - 1] && e20_15[e20_15.length - 1] < e50_15[e50_15.length - 1];
    var shortRsi = r >= 32 && r <= 58;
    var shortVol = volRatio >= 0.9;
    var shortMacd = macdOK(closes, "SHORT");
    if (shortTrend && short15 && shortRsi && shortVol && shortMacd) {
      out.dir = "SHORT";
      out.score = 60 + Math.min(20, volRatio * 8) + (r >= 38 && r <= 50 ? 10 : 4) + (chg24 < 0 ? 5 : 0);
      out.why = "Downtrend on 1H + 15m, RSI " + r.toFixed(0) + ", volume " + volRatio.toFixed(2) + "x average, MACD falling.";
      var sl2 = Math.max(swingHigh, price + 1.5 * a);
      if (sl2 - price < 0.004 * price) sl2 = price + 1.5 * a;
      if (sl2 - price > 0.03 * price) sl2 = price + 0.03 * price;
      // GOLD (PAXG) intraday cap — see LONG branch above.
      if (symbol === "PAXGUSDT" && sl2 - price > 25) sl2 = price + 25;
      out.sl = sl2; out.r = sl2 - price;
      return out;
    }
    return out; // NO TRADE for this coin
  }

  function levelsOf(t) {
    var entry = t.price, r = t.r, tp1, tp2, tp3;
    if (t.dir === "LONG") { tp1 = entry + r; tp2 = entry + 1.5 * r; tp3 = entry + 2 * r; }
    else { tp1 = entry - r; tp2 = entry - 1.5 * r; tp3 = entry - 2 * r; }
    return {entry: entry, sl: t.sl, tp1: tp1, tp2: tp2, tp3: tp3, r: r};
  }

  // ---------- local storage (safe fallback if unavailable) ----------
  var memStore = {};
  function storeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return memStore[key] || null; }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { memStore[key] = val; }
  }
  function loadJSON(key) {
    try { var v = storeGet(key); return v ? JSON.parse(v) : []; } catch (e) { return []; }
  }
  function saveJSON(key, arr) { try { storeSet(key, JSON.stringify(arr)); } catch (e) {} }

  // ---------- Signals Feed ----------
  var SIG_KEY = "mact_signals_v1";
  function getSignals() { return loadJSON(SIG_KEY); }
  function saveSignals(arr) { saveJSON(SIG_KEY, arr); }
  function addSignal(t) {
    if (!t || !t.dir) return;
    var lv = levelsOf(t);
    var arr = getSignals();
    // Dedupe: same coin + direction already open with a similar entry.
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (s.status === "OPEN" && s.symbol === t.symbol && s.dir === t.dir &&
          Math.abs(s.entry - t.price) / t.price < 0.02) return;
    }
    arr.unshift({id: Date.now() + Math.floor(Math.random() * 1000), symbol: t.symbol, dir: t.dir,
      entry: t.price, sl: lv.sl, tp1: lv.tp1, tp2: lv.tp2, tp3: lv.tp3, r: lv.r,
      time: Date.now(), status: "OPEN", source: t.source || ""});
    while (arr.length > 50) arr.pop();
    saveSignals(arr);
    renderFeed();
  }
  // Walk 1h candles after the signal: first touch decides, like TraderSpy.
  // If TP1 was touched first, the outcome keeps the highest TP reached even
  // if price later hits the stop. A wick counts. Same-candle SL+TP = Stopped.
  function walkOutcome(candles, since, dir, sl, tp1, tp2, tp3) {
    var best = null;
    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];
      if (c[0] < since - 3600000) continue;
      var high = parseFloat(c[2]), low = parseFloat(c[3]);
      if (dir === "LONG") {
        if (low <= sl) return best || "Stopped";
        if (high >= tp3) return "Hit TP3";
        if (high >= tp2) best = "Hit TP2";
        else if (high >= tp1) best = "Hit TP1";
      } else {
        if (high >= sl) return best || "Stopped";
        if (low <= tp3) return "Hit TP3";
        if (low <= tp2) best = "Hit TP2";
        else if (low <= tp1) best = "Hit TP1";
      }
    }
    if (best) return best;
    if (Date.now() - since > 24 * 3600 * 1000) return "Expired";
    return null; // still open
  }
  function updateOutcomes() {
    var arr = getSignals(), changed = false;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (s.status !== "OPEN") continue;
      var m = scanMap[s.symbol];
      if (!m || !m.k1h) continue;
      var oc = walkOutcome(m.k1h, s.time, s.dir, s.sl, s.tp1, s.tp2, s.tp3);
      if (oc) { s.status = oc; s.closedAt = Date.now(); changed = true; }
    }
    if (changed) { saveSignals(arr); renderFeed(); }
  }
  function statusBadge(st) {
    if (st === "OPEN") return '<span class="bdg open">OPEN</span>';
    if (st === "Stopped") return '<span class="bdg stop">STOPPED</span>';
    if (st === "Expired") return '<span class="bdg exp">EXPIRED</span>';
    return '<span class="bdg hit">' + st.toUpperCase() + '</span>';
  }
  function renderFeed() {
    var arr = getSignals();
    var closed = arr.filter(function (s) { return s.status !== "OPEN"; });
    var hits = closed.filter(function (s) { return s.status.indexOf("Hit") === 0; }).length;
    var rateEl = $("feedRate");
    if (closed.length) {
      var pct = Math.round(hits / closed.length * 100);
      rateEl.textContent = "Hit rate " + pct + "% (" + hits + "/" + closed.length + " closed)";
    } else {
      rateEl.textContent = arr.length ? "0 closed yet" : "";
    }
    var list = $("feedList");
    if (!arr.length) {
      list.textContent = "No signals yet — the first scan will log every trade here with its outcome.";
      return;
    }
    list.innerHTML = "";
    arr.slice(0, 20).forEach(function (s) {
      var d = document.createElement("div");
      d.className = "feedrow";
      var name = s.symbol === "PAXGUSDT" ? "GOLD" : s.symbol.replace("USDT", "");
      d.innerHTML = '<span class="fr-l">' + name + ' <span class="bdg ' + s.dir.toLowerCase() + '">' + s.dir + '</span>' +
        '<br><span class="fr-s">' + timeStr(s.time) + ' · Entry ' + fmt(s.entry) + ' · TP1 ' + fmt(s.tp1) + ' · SL ' + fmt(s.sl) + '</span></span>' +
        statusBadge(s.status);
      list.appendChild(d);
    });
  }

  // ---------- Paper Trades ----------
  var PAPER_KEY = "mact_paper_v1";
  function getPaper() { return loadJSON(PAPER_KEY); }
  function savePaper(arr) { saveJSON(PAPER_KEY, arr); }
  function addPaperTrade(t) {
    if (!t || !t.dir) return false;
    var lv = levelsOf(t);
    var arr = getPaper();
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (p.status === "OPEN" && p.symbol === t.symbol && p.dir === t.dir) return false;
    }
    arr.unshift({id: Date.now() + Math.floor(Math.random() * 1000), symbol: t.symbol, dir: t.dir,
      entry: t.price, sl: lv.sl, tp1: lv.tp1, tp2: lv.tp2, tp3: lv.tp3, r: lv.r,
      time: Date.now(), status: "OPEN", tp1hit: false, tp2hit: false, realized: 0});
    while (arr.length > 20) arr.pop();
    savePaper(arr);
    renderPaper();
    return true;
  }
  // Paper-trade walk: book 50% at TP1 (+$2.50), 25% at TP2 (+$1.88),
  // 25% at TP3 (+$2.50) = +$6.88 max. SL before TP1 = -$5.00.
  // After TP1 the stop moves to breakeven (entry).
  function updatePaper() {
    var arr = getPaper(), changed = false;
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (p.status !== "OPEN") continue;
      var m = scanMap[p.symbol];
      if (!m || !m.k1h) continue;
      var done = false;
      for (var j = 0; j < m.k1h.length && !done; j++) {
        var c = m.k1h[j];
        if (c[0] < p.time - 3600000) continue;
        var high = parseFloat(c[2]), low = parseFloat(c[3]);
        var slNow = p.tp1hit ? p.entry : p.sl;
        if (p.dir === "LONG") {
          if (low <= slNow) { p.status = "CLOSED"; p.pnl = p.realized; p.closeNote = p.tp1hit ? "Breakeven after TP1" : "Stop loss hit"; done = true; break; }
          if (!p.tp1hit && high >= p.tp1) { p.tp1hit = true; p.realized += 2.50; }
          if (p.tp1hit && !p.tp2hit && high >= p.tp2) { p.tp2hit = true; p.realized += 1.88; }
          if (p.tp2hit && high >= p.tp3) { p.realized += 2.50; p.status = "CLOSED"; p.pnl = p.realized; p.closeNote = "All targets hit"; done = true; break; }
        } else {
          if (high >= slNow) { p.status = "CLOSED"; p.pnl = p.realized; p.closeNote = p.tp1hit ? "Breakeven after TP1" : "Stop loss hit"; done = true; break; }
          if (!p.tp1hit && low <= p.tp1) { p.tp1hit = true; p.realized += 2.50; }
          if (p.tp1hit && !p.tp2hit && low <= p.tp2) { p.tp2hit = true; p.realized += 1.88; }
          if (p.tp2hit && low <= p.tp3) { p.realized += 2.50; p.status = "CLOSED"; p.pnl = p.realized; p.closeNote = "All targets hit"; done = true; break; }
        }
      }
      if (!done && Date.now() - p.time > 24 * 3600 * 1000) {
        // Expire after 24h: close the remaining size at the last price.
        var lastClose = parseFloat(m.k1h[m.k1h.length - 1][4]);
        var rem = p.tp2hit ? 0.25 : p.tp1hit ? 0.5 : 1;
        var mult = p.dir === "LONG" ? (lastClose - p.entry) / p.r : (p.entry - lastClose) / p.r;
        p.status = "CLOSED"; p.pnl = p.realized + rem * mult * RISK; p.closeNote = "Expired after 24h";
        done = true;
      }
      if (done) changed = true;
    }
    if (changed) { savePaper(arr); renderPaper(); }
  }
  function paperLivePL(p) {
    var m = scanMap[p.symbol];
    if (!m) return null;
    var lastClose = parseFloat(m.k1h[m.k1h.length - 1][4]);
    var rem = p.tp2hit ? 0.25 : p.tp1hit ? 0.5 : 1;
    var mult = p.dir === "LONG" ? (lastClose - p.entry) / p.r : (p.entry - lastClose) / p.r;
    return {pl: p.realized + rem * mult * RISK, price: lastClose};
  }
  function renderPaper() {
    var arr = getPaper();
    var list = $("paperList");
    var totalEl = $("paperTotal");
    if (!arr.length) {
      list.textContent = "No paper trades yet — tap “Paper-trade this setup” on any signal to practice with $5 virtual risk.";
      totalEl.textContent = "";
      return;
    }
    var total = 0;
    list.innerHTML = "";
    arr.slice(0, 12).forEach(function (p) {
      var d = document.createElement("div");
      d.className = "feedrow";
      var name = p.symbol === "PAXGUSDT" ? "GOLD" : p.symbol.replace("USDT", "");
      var right, note;
      if (p.status === "OPEN") {
        var live = paperLivePL(p);
        var pl = live ? live.pl : 0;
        total += pl;
        note = "Entry " + fmt(p.entry) + " · Live " + (live ? fmt(live.price) : "—") + (p.tp1hit ? " · TP1 ✓" : "") + (p.tp2hit ? " · TP2 ✓" : "");
        right = '<span style="color:' + (pl >= 0 ? "var(--long)" : "var(--short)") + '">' + fmtMoney(pl) + '</span> <span class="bdg open">OPEN</span>';
      } else {
        total += p.pnl || 0;
        note = "Entry " + fmt(p.entry) + " · " + (p.closeNote || "");
        right = '<span style="color:' + ((p.pnl || 0) >= 0 ? "var(--long)" : "var(--short)") + '">' + fmtMoney(p.pnl || 0) + '</span> <span class="bdg ' + ((p.pnl || 0) >= 0 ? "hit" : "stop") + '">CLOSED</span>';
      }
      d.innerHTML = '<span class="fr-l">' + name + ' <span class="bdg ' + p.dir.toLowerCase() + '">' + p.dir + '</span>' +
        '<br><span class="fr-s">' + timeStr(p.time) + ' · ' + note + '</span></span>' + right;
      list.appendChild(d);
    });
    totalEl.textContent = "Total " + fmtMoney(total) + " (virtual)";
  }

  // ---------- Market Brief + Insight ----------
  function renderBrief() {
    if (!lastScanSummary) return;
    var s = lastScanSummary;
    var parts = [];
    var btc = lastTickers ? lastTickers.filter(function (t) { return t.symbol === "BTCUSDT"; })[0] : null;
    if (btc) {
      var chg = parseFloat(btc.priceChangePercent);
      parts.push("<b>BTC $" + fmt(parseFloat(btc.lastPrice)) + "</b> (" + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% 24h)");
    }
    if (s.goldPrice) parts.push("gold <b>$" + fmt(s.goldPrice) + "</b>");
    if (fgValue != null) parts.push("Fear &amp; Greed <b>" + fgValue + " (" + fgLabel + ")</b>");
    var lines = parts.length ? parts.join(" · ") + ". " : "";
    if (s.screened) lines = "Screened <b>" + s.screened + " coins</b>, deep-checked top " + s.total + ". " + lines;
    if (s.crypto) lines += "Best crypto setup: <b>" + s.crypto.symbol.replace("USDT", "") + " " + s.crypto.dir + "</b> at $" + fmt(s.crypto.price) + ". ";
    else lines += "No crypto coin passed all checks — " + s.passed + " of " + s.total + " deep-checked had a setup, volume is thin. ";
    if (s.gold) lines += "Gold: <b>" + s.gold.dir + "</b> at $" + fmt(s.gold.price) + ". ";
    else lines += "Gold: no setup right now. ";
    lines += "Waiting for volume is part of the plan — the next scan runs in 5 minutes.";
    $("briefTxt").innerHTML = lines;
  }
  function loadFearGreed() {
    getJSON("https://api.alternative.me/fng/?limit=1", 8000).then(function (j) {
      var d = j && j.data && j.data[0];
      if (!d) return;
      fgValue = d.value; fgLabel = d.value_classification;
      $("fgVal").textContent = d.value + " · " + d.value_classification;
      renderBrief();
    }).catch(function () { $("fgVal").textContent = "—"; });
  }
  function loadDominance() {
    getJSON("https://api.coingecko.com/api/v3/global", 10000).then(function (j) {
      var b = j && j.data && j.data.market_cap_percentage && j.data.market_cap_percentage.btc;
      if (!b) return;
      btcDom = b;
      $("domVal").textContent = b.toFixed(1) + "%";
    }).catch(function () { $("domVal").textContent = "—"; });
  }
  function loadLongShort(instId, elId, setter) {
    getJSON("https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?instId=" + instId + "&period=1H&limit=1", 8000).then(function (j) {
      var r = j && j.data && j.data[0] && parseFloat(j.data[0].ratio);
      if (!r || !isFinite(r)) { $(elId).textContent = "—"; return; }
      var longPct = Math.round(r / (1 + r) * 100);
      setter(longPct);
      $(elId).textContent = longPct + "% long / " + (100 - longPct) + "% short";
    }).catch(function () { $(elId).textContent = "—"; });
  }
  function loadInsight() {
    loadFearGreed();
    loadDominance();
    loadLongShort("BTC-USDT-SWAP", "lsBtc", function (v) { lsBtc = v; });
    loadLongShort("ETH-USDT-SWAP", "lsEth", function (v) { lsEth = v; });
  }
  function renderMovers() {
    // Bubbles-style movers across the whole screened universe (~800 coins).
    if (universe.gainers.length || universe.losers.length) {
      var top = universe.gainers.slice(0, 3).map(function (x) { return x.sym.replace("USDT", "") + " +" + x.chg.toFixed(1) + "%"; });
      var bot = universe.losers.slice(0, 3).map(function (x) { return x.sym.replace("USDT", "") + " " + x.chg.toFixed(1) + "%"; });
      $("moversBox").innerHTML = "Top movers 24h (all " + (universe.screened || "800") + " coins) — <b style=\"color:var(--long)\">" + top.join(" · ") + "</b><br>Weakest 24h — <b style=\"color:var(--short)\">" + bot.join(" · ") + "</b>";
      return;
    }
    if (!lastTickers || !lastTickers.length) return;
    var sorted = lastTickers.slice().sort(function (a, b) { return parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent); });
    var top = sorted.slice(0, 3).map(function (t) { return t.symbol.replace("USDT", "") + " +" + parseFloat(t.priceChangePercent).toFixed(1) + "%"; });
    var bot = sorted.slice(-3).reverse().map(function (t) { return t.symbol.replace("USDT", "") + " " + parseFloat(t.priceChangePercent).toFixed(1) + "%"; });
    $("moversBox").innerHTML = "Top movers 24h — <b style=\"color:var(--long)\">" + top.join(" · ") + "</b><br>Weakest 24h — <b style=\"color:var(--short)\">" + bot.join(" · ") + "</b>";
  }

  function setLive(on) {
    $("livePill").className = "pill" + (on ? "" : " off");
    $("liveTxt").textContent = on ? "LIVE" : "OFFLINE";
  }
  function setStatus(t) { $("statusTxt").textContent = t; }
  function setBar(p) { $("barFill").style.width = p + "%"; }

  function showTrade(t, pfx) {
    lastTrade[pfx] = t;
    var isGold = t.symbol === "PAXGUSDT";
    var name = isGold ? "GOLD (PAXG / XAU)" : t.symbol.replace("USDT", " / USDT");
    $("word" + pfx).textContent = t.dir;
    $("word" + pfx).className = "word " + t.dir.toLowerCase();
    $("sym" + pfx).textContent = name;
    $("reason" + pfx).textContent = t.why + " Confidence " + Math.min(92, Math.round(t.score)) + "%.";
    $("levels" + pfx).style.display = "grid";
    var lv = levelsOf(t);
    $("lvEntry" + pfx).textContent = fmt(lv.entry);
    $("lvEntrySub" + pfx).textContent = isGold ? "XAU price" : "Market price now";
    $("lvSL" + pfx).textContent = fmt(lv.sl);
    $("lvTP1" + pfx).textContent = fmt(lv.tp1);
    $("lvTP2" + pfx).textContent = fmt(lv.tp2);
    $("lvTP3" + pfx).textContent = fmt(lv.tp3);
    var qty = RISK / lv.r;
    var notional = qty * lv.entry;
    var lev = isGold ? "0.01 lot" : (notional > 150 ? "3x" : "5x");
    $("lvSize" + pfx).textContent = isGold ? fmtQty(qty) + " oz" : fmtQty(qty) + " " + t.symbol.replace("USDT", "");
    $("lvSizeSub" + pfx).textContent = isGold ? "0.01 lot ≈ 1 oz · Margin ~$" + Math.round(notional / 100) : "≈ $" + Math.round(notional) + " notional · " + lev;
    var m = $("metaLine" + pfx);
    m.style.display = "block";
    m.innerHTML = "Risk <b>$5.00</b> · Reward TP1 <b>+$5.00</b> · TP2 <b>+$7.50</b> · TP3 <b>+$10.00</b> · Book 50% at TP1, then move SL to entry. · RSI <b>" + t.rsi.toFixed(0) + "</b> · Volume <b>" + t.volRatio.toFixed(2) + "x</b>" + (t.source ? " · Source: <b>" + t.source + "</b>" : "") + " · Updated <b>" + timeStr(Date.now()) + "</b>";
    var btn = $("pt" + pfx);
    if (btn) { btn.style.display = "block"; btn.textContent = "+ Paper-trade this setup ($5 risk)"; }
  }
  function showNoTrade(checked, bestNote, pfx) {
    lastTrade[pfx] = null;
    $("word" + pfx).textContent = "NO TRADE";
    $("word" + pfx).className = "word wait";
    $("sym" + pfx).textContent = "No trade right now — wait";
    $("reason" + pfx).textContent = bestNote || ("Checked " + checked + " coins. None passed all checks (trend + RSI + volume + 15m confirmation). Waiting is also a trade — next auto-scan in 5 minutes.");
    $("levels" + pfx).style.display = "none";
    $("metaLine" + pfx).style.display = "none";
    var btn = $("pt" + pfx);
    if (btn) btn.style.display = "none";
  }
  function pushHist(text) {
    var list = $("histList");
    if (list.textContent === "No scan yet.") list.textContent = "";
    var d = document.createElement("div");
    d.textContent = timeStr(Date.now()) + " — " + text;
    list.prepend(d);
    while (list.children.length > 3) list.removeChild(list.lastChild);
  }

  function updatePrices() {
    getJSON(SAPI + "/ticker/24hr?symbol=BTCUSDT", 8000).then(function (t) {
      $("btcPx").textContent = "$" + fmt(parseFloat(t.lastPrice));
      setLive(true);
    }).catch(function () {});
    getJSON("https://api.gold-api.com/price/XAU", 8000).then(function (g) {
      if (g && g.price) {
        $("goldPx").textContent = "$" + fmt(parseFloat(g.price));
        if (lastScanSummary) { lastScanSummary.goldPrice = parseFloat(g.price); renderBrief(); }
      }
    }).catch(function () {
      getJSON(SAPI + "/ticker/24hr?symbol=PAXGUSDT", 8000).then(function (t) {
        $("goldPx").textContent = "$" + fmt(parseFloat(t.lastPrice));
      }).catch(function () {});
    });
  }

  function scan() {
    if (scanning) return;
    scanning = true;
    $("scanBtn").disabled = true;
    $("errBox").className = "err";
    setBar(4);
    setStatus("Screening ~800 coins by volume…");
    updatePrices();
    // Stage 1: screen the whole market; Stage 2: deep-scan the top 100.
    // If screening fails, fall back to the fixed 50-coin list.
    screenUniverse().then(function (res) {
      deepScan(res.list, res.screened);
    }).catch(function () {
      deepScan(BASE_COINS, 0);
    });
  }
  function deepScan(list, screened) {
    setBar(8);
    setStatus("Deep-scanning top " + list.length + " coins — trend, RSI, volume…");
    var done = 0, results = [], failed = 0;
    var total = list.length;
    function tick() {
      done++;
      setBar(Math.round(8 + (done / total) * 88));
      setStatus("Checking " + done + " / " + total + " coins…");
    }
    var jobs = list.map(function (sym) {
      return fetchPair(sym).then(function (res) {
        tick();
        scanMap[sym] = res;
        var a = analyze(sym, res.k1h, res.k15);
        if (a) a.source = res.source;
        if (a && a.dir) results.push(a);
        return a;
      }).catch(function () { failed++; tick(); return null; });
    });
    Promise.all(jobs).then(function (all) {
      scanning = false;
      $("scanBtn").disabled = false;
      setBar(100);
      lastScanAt = Date.now();
      scheduleNext();
      if (failed >= total - 2) {
        setLive(false);
        var e = $("errBox");
        e.textContent = "Live data failed on this network (" + failed + "/" + total + " coins). Check your connection and tap SCAN NOW again — no trade is shown without live data.";
        e.className = "err on";
        setStatus("Data failed — try again.");
        return;
      }
      setLive(true);
      results.sort(function (a, b) { return b.score - a.score; });
      // Two separate best trades: one crypto, one gold — so a gold signal
      // never hides crypto, and vice versa.
      var crypto = results.filter(function (x) { return x.symbol !== "PAXGUSDT"; });
      var gold = null;
      for (var gi = 0; gi < results.length; gi++) { if (results[gi].symbol === "PAXGUSDT") { gold = results[gi]; break; } }
      var goldPrice = scanMap.PAXGUSDT ? parseFloat(scanMap.PAXGUSDT.k1h[scanMap.PAXGUSDT.k1h.length - 1][4]) : null;
      lastScanSummary = {crypto: crypto.length ? crypto[0] : null, gold: gold, passed: results.length, total: total, goldPrice: goldPrice, screened: screened};
      if (crypto.length) {
        showTrade(crypto[0], "C");
        addSignal(crypto[0]);
        pushHist("Crypto: " + crypto[0].symbol.replace("USDT", "") + " " + crypto[0].dir + " @ " + fmt(crypto[0].price));
      } else {
        showNoTrade(total - 1, null, "C");
        pushHist("Crypto: NO TRADE — none passed all checks");
      }
      if (gold) {
        showTrade(gold, "G");
        addSignal(gold);
        pushHist("Gold: " + gold.dir + " @ " + fmt(gold.price));
      } else {
        showNoTrade(1, "Gold checked. No setup passed all checks — next auto-scan in 5 minutes.", "G");
        pushHist("Gold: NO TRADE");
      }
      // Outcomes + paper trades are checked against this scan's fresh candles.
      updateOutcomes();
      updatePaper();
      renderPaper();
      renderBrief();
      setStatus("Screened " + (screened || total) + " coins · deep-checked " + total + " · " + results.length + " passed all checks · Next auto-scan in 5 min");
    });
  }

  function scheduleNext() {
    if (nextTimer) clearInterval(nextTimer);
    var left = 300;
    nextTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(nextTimer); scan(); return; }
      var m = Math.floor(left / 60), s = left % 60;
      $("nextScan").textContent = "Auto-scan every 5 minutes · Next scan in " + m + ":" + (s < 10 ? "0" : "") + s + " · Crypto + Gold";
    }, 1000);
  }

  // ---- Analyze any coin + live Binance coin list ----
  function normalizeSymbol(raw) {
    var s = (raw || "").toUpperCase().replace(/[\s\/\-_]/g, "");
    if (!s) return "";
    if (s === "XAU" || s === "GOLD") return "PAXGUSDT";
    if (!/USDT$/.test(s)) s += "USDT";
    return s;
  }
  function visionKlines(sym, interval, limit) {
    return getJSON(SAPI + "/klines?symbol=" + sym + "&interval=" + interval + "&limit=" + limit, 9000);
  }
  function bitgetFutKlines(sym, interval, limit) {
    var g = interval === "15m" ? "15m" : "1H";
    return getJSON("https://api.bitget.com/api/v2/mix/market/candles?symbol=" + sym + "&granularity=" + g + "&productType=USDT-FUTURES&limit=" + limit, 9000).then(function (j) {
      var d = (j && j.data) || [];
      if (!d.length) throw new Error("Bitget futures: no data");
      var rows = d.map(function (r) { return [parseInt(r[0], 10), r[1], r[2], r[3], r[4], r[5]]; });
      rows.sort(function (a, b) { return a[0] - b[0]; });
      return rows;
    });
  }
  function bitgetKlines(sym, interval, limit) {
    var g = interval === "15m" ? "15min" : "1h";
    return getJSON("https://api.bitget.com/api/v2/spot/market/candles?symbol=" + sym + "&granularity=" + g + "&limit=" + limit, 9000).then(function (j) {
      var d = (j && j.data) || [];
      if (!d.length) throw new Error("Bitget: no data");
      var rows = d.map(function (r) { return [parseInt(r[0], 10), r[1], r[2], r[3], r[4], r[5]]; });
      rows.sort(function (a, b) { return a[0] - b[0]; });
      return rows;
    });
  }
  function bybitKlines(sym, interval, limit) {
    var iv = interval === "15m" ? "15" : "60";
    return getJSON("https://api.bybit.com/v5/market/kline?category=linear&symbol=" + sym + "&interval=" + iv + "&limit=" + limit, 9000).then(function (j) {
      var d = (j && j.result && j.result.list) || [];
      if (!d.length) throw new Error("Bybit: no data");
      var rows = d.map(function (r) { return [parseInt(r[0], 10), r[1], r[2], r[3], r[4], r[5]]; });
      rows.sort(function (a, b) { return a[0] - b[0]; });
      return rows;
    });
  }
  // Binance spot first, then Bitget FUTURES (futures volume is what matters
  // for a futures trader), then Bitget spot, then Bybit — so futures-only
  // coins like BLESS (not on Binance spot) still scan and analyze.
  function fetchPair(sym) {
    var sources = [
      {name: "Binance", fn: function (iv) { return visionKlines(sym, iv, 100); }},
      {name: "Bitget Futures", fn: function (iv) { return bitgetFutKlines(sym, iv, 100); }},
      {name: "Bitget", fn: function (iv) { return bitgetKlines(sym, iv, 100); }},
      {name: "Bybit", fn: function (iv) { return bybitKlines(sym, iv, 100); }}
    ];
    var chain = Promise.reject(new Error("start"));
    sources.forEach(function (src) {
      chain = chain.catch(function () {
        return Promise.all([src.fn("1h"), src.fn("15m")]).then(function (pair) {
          if (!pair[0] || pair[0].length < 60 || !pair[1] || pair[1].length < 20) throw new Error(src.name + ": not enough candles");
          return {k1h: pair[0], k15: pair[1], source: src.name};
        });
      });
    });
    return chain;
  }
  var analyzing = false;
  function analyzeCoin(raw) {
    var sym = normalizeSymbol(raw);
    if (!sym) { $("analyzeStatus").textContent = "Please type a coin first — e.g. BLESS, HUMA, SOL."; return; }
    if (analyzing) return;
    analyzing = true;
    $("analyzeBtn").disabled = true;
    $("analyzeStatus").textContent = "Analyzing " + sym + " — fetching live candles…";
    fetchPair(sym).then(function (res) {
      analyzing = false;
      $("analyzeBtn").disabled = false;
      $("analyzeResult").style.display = "block";
      scanMap[sym] = res;
      var a = analyze(sym, res.k1h, res.k15);
      if (a) a.source = res.source;
      var srcNote = res.source === "Binance" ? "Source: Binance live data." : "Source: " + res.source + " live data — Binance spot does not list " + sym + ", so candles come from " + res.source + ". Price may differ slightly from Binance futures.";
      if (a && a.dir) {
        showTrade(a, "A");
        addSignal(a);
        updateOutcomes();
        $("analyzeStatus").textContent = sym + " analyzed · " + srcNote;
        pushHist(sym.replace("USDT", "") + " " + a.dir + " @ " + fmt(a.price) + " (your analyze)");
      } else if (a) {
        showNoTrade(1, "Checked " + sym + " — RSI " + a.rsi.toFixed(0) + ", volume " + a.volRatio.toFixed(2) + "x average. No setup passed all checks, so NO TRADE. " + srcNote, "A");
        $("analyzeStatus").textContent = sym + " analyzed · " + srcNote;
        pushHist(sym.replace("USDT", "") + " NO TRADE (your analyze)");
      } else {
        showNoTrade(1, "Not enough live data for " + sym + " to analyze. " + srcNote, "A");
        $("analyzeStatus").textContent = sym + " — not enough data. " + srcNote;
      }
    }).catch(function () {
      analyzing = false;
      $("analyzeBtn").disabled = false;
      $("analyzeResult").style.display = "block";
      showNoTrade(1, sym + " not found on Binance, Bitget or Bybit. Check the spelling — e.g. BLESS, HUMA, SOL — and try again.", "A");
      $("analyzeStatus").textContent = sym + " not found on any connected exchange.";
    });
  }
  function loadTickers() {
    var syms = LIST_COINS.map(function (s) { return '"' + s + '"'; }).join(",");
    getJSON(SAPI + "/ticker/24hr?symbols=" + encodeURIComponent("[" + syms + "]"), 12000).then(function (arr) {
      if (!arr || !arr.length) throw new Error("empty");
      lastTickers = arr;
      arr.sort(function (a, b) { return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume); });
      var list = $("coinList");
      list.innerHTML = "";
      arr.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "crow";
        var chg = parseFloat(t.priceChangePercent);
        b.innerHTML = "<span>" + t.symbol.replace("USDT", "") + "</span><span class=\"cp\">$" + fmt(parseFloat(t.lastPrice)) + " &nbsp;·&nbsp; <span style=\"color:" + (chg >= 0 ? "var(--long)" : "var(--short)") + "\">" + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%</span></span>";
        b.addEventListener("click", function () { $("coinInput").value = t.symbol.replace("USDT", ""); analyzeCoin(t.symbol); });
        list.appendChild(b);
      });
      $("connTxt").textContent = "● LIVE · Binance";
      setLive(true);
      renderMovers();
      renderBrief();
    }).catch(function () {
      $("coinList").textContent = "Coin list failed to load — tap SCAN NOW to retry.";
      $("connTxt").textContent = "Offline — retry";
    });
  }

  function wirePaperButton(pfx) {
    var btn = $("pt" + pfx);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var t = lastTrade[pfx];
      if (!t) return;
      var ok = addPaperTrade(t);
      btn.textContent = ok ? "Added to paper trades ✓" : "Already in paper trades";
      setTimeout(function () { if (lastTrade[pfx]) btn.textContent = "+ Paper-trade this setup ($5 risk)"; }, 2500);
    });
  }

  $("scanBtn").addEventListener("click", scan);
  $("clearFeed").addEventListener("click", function () { saveSignals([]); renderFeed(); });
  updatePrices();
  loadTickers();
  loadInsight();
  renderFeed();
  renderPaper();
  wirePaperButton("C");
  wirePaperButton("G");
  wirePaperButton("A");
  $("analyzeBtn").addEventListener("click", function () { analyzeCoin($("coinInput").value); });
  $("coinInput").addEventListener("keydown", function (e) { if (e.key === "Enter") analyzeCoin($("coinInput").value); });
  document.querySelectorAll("#quickChips .chip-btn").forEach(function (b) {
    b.addEventListener("click", function () { $("coinInput").value = b.getAttribute("data-sym").replace("USDT", ""); analyzeCoin(b.getAttribute("data-sym")); });
  });
  scan(); // auto-scan on open — user does not need to tap anything
})();
