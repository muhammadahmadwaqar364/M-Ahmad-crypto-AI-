// M Ahmad Crypto Ai — SIMPLE version.
// One screen only: auto-scan crypto + gold, show ONE best trade.
// All analysis runs here in the background (trend / EMA / RSI / MACD /
// volume / support-resistance / ATR / 15m confirmation). Nothing is shown
// except the decision + Entry / SL / TP1-TP3 + size. No fake data: if live
// data fails, show an error, never an invented price.
(function () {
  "use strict";
  var COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","AVAXUSDT","LTCUSDT","DOTUSDT","NEARUSDT","SUIUSDT","ARBUSDT","OPUSDT","PEPEUSDT","WIFUSDT","TAOUSDT","APTUSDT","ATOMUSDT","PAXGUSDT"];
  var RISK = 5; // $ per trade, fixed
  var SAPI = "https://data-api.binance.vision/api/v3";
  var $ = function (id) { return document.getElementById(id); };
  var scanning = false, lastScanAt = 0, nextTimer = null;

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

  function setLive(on) {
    $("livePill").className = "pill" + (on ? "" : " off");
    $("liveTxt").textContent = on ? "LIVE" : "OFFLINE";
  }
  function setStatus(t) { $("statusTxt").textContent = t; }
  function setBar(p) { $("barFill").style.width = p + "%"; }

  function showTrade(t, pfx) {
    var isGold = t.symbol === "PAXGUSDT";
    var name = isGold ? "GOLD (PAXG / XAU)" : t.symbol.replace("USDT", " / USDT");
    $("word" + pfx).textContent = t.dir;
    $("word" + pfx).className = "word " + t.dir.toLowerCase();
    $("sym" + pfx).textContent = name;
    $("reason" + pfx).textContent = t.why + " Confidence " + Math.min(92, Math.round(t.score)) + "%.";
    $("levels" + pfx).style.display = "grid";
    var entry = t.price, r = t.r;
    var tp1, tp2, tp3;
    if (t.dir === "LONG") { tp1 = entry + r; tp2 = entry + 1.5 * r; tp3 = entry + 2 * r; }
    else { tp1 = entry - r; tp2 = entry - 1.5 * r; tp3 = entry - 2 * r; }
    $("lvEntry" + pfx).textContent = fmt(entry);
    $("lvEntrySub" + pfx).textContent = isGold ? "XAU price" : "Market price now";
    $("lvSL" + pfx).textContent = fmt(t.sl);
    $("lvTP1" + pfx).textContent = fmt(tp1);
    $("lvTP2" + pfx).textContent = fmt(tp2);
    $("lvTP3" + pfx).textContent = fmt(tp3);
    var qty = RISK / r;
    var notional = qty * entry;
    var lev = isGold ? "0.01 lot" : (notional > 150 ? "3x" : "5x");
    $("lvSize" + pfx).textContent = isGold ? fmtQty(qty) + " oz" : fmtQty(qty) + " " + t.symbol.replace("USDT", "");
    $("lvSizeSub" + pfx).textContent = isGold ? "0.01 lot ≈ 1 oz · Margin ~$" + Math.round(notional / 100) : "≈ $" + Math.round(notional) + " notional · " + lev;
    var m = $("metaLine" + pfx);
    m.style.display = "block";
    m.innerHTML = "Risk <b>$5.00</b> · Reward TP1 <b>+$5.00</b> · TP2 <b>+$7.50</b> · TP3 <b>+$10.00</b> · Book 50% at TP1, then move SL to entry. · RSI <b>" + t.rsi.toFixed(0) + "</b> · Volume <b>" + t.volRatio.toFixed(2) + "x</b> · Updated <b>" + new Date().toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}) + "</b>";
  }
  function showNoTrade(checked, bestNote, pfx) {
    $("word" + pfx).textContent = "NO TRADE";
    $("word" + pfx).className = "word wait";
    $("sym" + pfx).textContent = "No trade right now — wait";
    $("reason" + pfx).textContent = bestNote || ("Checked " + checked + " coins. None passed all checks (trend + RSI + volume + 15m confirmation). Waiting is also a trade — next auto-scan in 5 minutes.");
    $("levels" + pfx).style.display = "none";
    $("metaLine" + pfx).style.display = "none";
  }
  function pushHist(text) {
    var list = $("histList");
    if (list.textContent === "No scan yet.") list.textContent = "";
    var d = document.createElement("div");
    d.textContent = new Date().toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}) + " — " + text;
    list.prepend(d);
    while (list.children.length > 3) list.removeChild(list.lastChild);
  }

  function updatePrices() {
    getJSON(SAPI + "/ticker/24hr?symbol=BTCUSDT", 8000).then(function (t) {
      $("btcPx").textContent = "$" + fmt(parseFloat(t.lastPrice));
      setLive(true);
    }).catch(function () {});
    getJSON("https://api.gold-api.com/price/XAU", 8000).then(function (g) {
      if (g && g.price) $("goldPx").textContent = "$" + fmt(parseFloat(g.price));
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
    setBar(8);
    setStatus("Scanning crypto + gold… checking trend, RSI, volume…");
    updatePrices();
    var done = 0, results = [], failed = 0;
    var total = COINS.length;
    function tick() {
      done++;
      setBar(Math.round(8 + (done / total) * 88));
      setStatus("Checking " + done + " / " + total + " coins…");
    }
    var jobs = COINS.map(function (sym) {
      return getJSON(SAPI + "/klines?symbol=" + sym + "&interval=1h&limit=100", 9000).then(function (k1h) {
        return getJSON(SAPI + "/klines?symbol=" + sym + "&interval=15m&limit=60", 9000).then(function (k15) {
          tick();
          var a = analyze(sym, k1h, k15);
          if (a && a.dir) results.push(a);
          return a;
        });
      }).catch(function () { failed++; tick(); return null; });
    });
    Promise.all(jobs).then(function () {
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
      if (crypto.length) {
        showTrade(crypto[0], "C");
        pushHist("Crypto: " + crypto[0].symbol.replace("USDT", "") + " " + crypto[0].dir + " @ " + fmt(crypto[0].price));
      } else {
        showNoTrade(total - 1, null, "C");
        pushHist("Crypto: NO TRADE — none passed all checks");
      }
      if (gold) {
        showTrade(gold, "G");
        pushHist("Gold: " + gold.dir + " @ " + fmt(gold.price));
      } else {
        showNoTrade(1, "Gold checked. No setup passed all checks — next auto-scan in 5 minutes.", "G");
        pushHist("Gold: NO TRADE");
      }
      setStatus("Scanned " + total + " coins + gold · " + results.length + " passed all checks · Next auto-scan in 5 min");
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

  $("scanBtn").addEventListener("click", scan);
  updatePrices();
  scan(); // auto-scan on open — user does not need to tap anything
})();
