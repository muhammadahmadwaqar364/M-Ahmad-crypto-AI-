
    "use strict";
    var $ = function(id){ return document.getElementById(id); };
    function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function fmtP(p){
      if (!isFinite(p)) return "—";
      if (p >= 1000) return p.toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2});
      if (p >= 1) return trimNum(p.toFixed(4));
      if (p >= 0.1) return trimNum(p.toFixed(5));
      return trimNum(p.toFixed(8));
    }
    function trimNum(s){ return s.indexOf(".") >= 0 ? s.replace(/0+$/,"").replace(/\.$/,".0") : s; }
    function fmtMoney(v){ if (v >= 1e9) return "$" + (v/1e9).toFixed(2) + "B"; if (v >= 1e6) return "$" + (v/1e6).toFixed(1) + "M"; if (v >= 1e3) return "$" + (v/1e3).toFixed(1) + "K"; return "$" + v.toFixed(0); }
    function fmtPct(x){ return (x >= 0 ? "+" : "") + x.toFixed(2) + "%"; }
    function timeNow(){ return new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}); }
    var toastTimer = null;
    function toast(msg){ var t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove("on"); }, 3200); }

    /* ================= Settings & state ================= */
    var MODES = {
      safe:       { label: "Safe",       riskPct: 1,   levCap: 5,  minConf: 65, target: [2, 6],   maxTrades: 0 },
      aggressive: { label: "Aggressive", riskPct: 2.5, levCap: 10, minConf: 75, target: [10, 15], maxTrades: 3 }
    };
    var settings = { capital: 200, mode: "safe", riskPct: 1, levLimit: 5, dataSourcePref: "auto" };
    function modeCfg(){ return MODES[settings.mode]; }
    var state = {
      dataMode: null, tickers: [], bySym: {}, funding: {},
      cgGlobal: null, fng: null, cgMarkets: {}, cgIdMap: {}, trending: [],
      btcCtx: null, scanResults: [], history: [], scanning: false,
      tracker: [], analysis: null, anSymbol: "BTCUSDT", anTf: "1h",
      listSort: "volume", listFilter: "all",
      lastUpdated: null, lastSourceErrors: [], diagResults: [], tryingSource: null, cache: {}, viaProxy: false
    };
    function riskUsd(){ return settings.capital * settings.riskPct / 100; }

    /* ================= Indicators ================= */
    function emaArr(vals, period){ var k = 2/(period+1), out = [], e = null; for (var i=0;i<vals.length;i++){ e = (e === null) ? vals[i] : vals[i]*k + e*(1-k); out.push(e); } return out; }
    function emaLast(vals, p){ var a = emaArr(vals, p); return a[a.length-1]; }
    function sma(vals, p){ if (vals.length < p) return null; var s = 0; for (var i = vals.length-p; i < vals.length; i++) s += vals[i]; return s/p; }
    function stdev(vals){ if (vals.length < 2) return 0; var m = vals.reduce(function(a,b){return a+b;},0)/vals.length, s = 0; vals.forEach(function(v){ s += (v-m)*(v-m); }); return Math.sqrt(s/vals.length); }
    function rsiCalc(closes, period){
      period = period || 14; if (closes.length < period + 2) return 50;
      var gains = 0, losses = 0, i;
      for (i = 1; i <= period; i++){ var d = closes[i]-closes[i-1]; if (d >= 0) gains += d; else losses -= d; }
      var ag = gains/period, al = losses/period;
      for (i = period+1; i < closes.length; i++){ var dd = closes[i]-closes[i-1]; ag = (ag*(period-1) + (dd > 0 ? dd : 0))/period; al = (al*(period-1) + (dd < 0 ? -dd : 0))/period; }
      if (al === 0) return 100; return 100 - 100/(1 + ag/al);
    }
    function stochRsi(closes, period){
      period = period || 14; if (closes.length < period*2 + 2) return null;
      var rsis = [], i;
      for (i = period; i < closes.length; i++) rsis.push(rsiCalc(closes.slice(0, i+1), period));
      var win = rsis.slice(-period), cur = rsis[rsis.length-1];
      var lo = Math.min.apply(null, win), hi = Math.max.apply(null, win);
      return hi === lo ? 50 : (cur - lo)/(hi - lo)*100;
    }
    function macdCalc(closes){
      if (closes.length < 35) return { macd: 0, signal: 0, hist: 0, prev: 0 };
      var e12 = emaArr(closes, 12), e26 = emaArr(closes, 26), m = [], i;
      for (i = 0; i < closes.length; i++) m.push(e12[i]-e26[i]);
      var sig = emaArr(m, 9), n = m.length;
      return { macd: m[n-1], signal: sig[n-1], hist: m[n-1]-sig[n-1], prev: m[n-2]-sig[n-2] };
    }
    function atrCalc(kl, period){
      period = period || 14; if (kl.length < period + 1) return kl.length ? kl[kl.length-1].c * 0.02 : 0;
      var trs = [], i;
      for (i = 1; i < kl.length; i++){ var h = kl[i].h, l = kl[i].l, pc = kl[i-1].c; trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))); }
      var a = 0; for (i = 0; i < period; i++) a += trs[i]; a /= period;
      for (i = period; i < trs.length; i++) a = (a*(period-1) + trs[i])/period;
      return a;
    }
    function adxCalc(kl, period){
      period = period || 14; if (kl.length < period*2 + 2) return null;
      var trs = [], pdm = [], ndm = [], i;
      for (i = 1; i < kl.length; i++){
        var up = kl[i].h - kl[i-1].h, dn = kl[i-1].l - kl[i].l;
        pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0);
        trs.push(Math.max(kl[i].h - kl[i].l, Math.abs(kl[i].h - kl[i-1].c), Math.abs(kl[i].l - kl[i-1].c)));
      }
      function smooth(a){ var s = 0, j; for (j = 0; j < period; j++) s += a[j]; var out = [s]; for (j = period; j < a.length; j++){ s = s - s/period + a[j]; out.push(s); } return out; }
      var sTR = smooth(trs), sP = smooth(pdm), sN = smooth(ndm), dx = [];
      for (i = 0; i < sTR.length; i++){ var p = sTR[i] ? sP[i]/sTR[i]*100 : 0, n = sTR[i] ? sN[i]/sTR[i]*100 : 0; dx.push((p+n) ? Math.abs(p-n)/(p+n)*100 : 0); }
      if (dx.length < period) return null;
      var adx = 0; for (i = dx.length-period; i < dx.length; i++) adx += dx[i];
      var pdi = sTR[sTR.length-1] ? sP[sP.length-1]/sTR[sTR.length-1]*100 : 0, ndi = sTR[sTR.length-1] ? sN[sN.length-1]/sTR[sTR.length-1]*100 : 0;
      return { adx: adx/period, pdi: pdi, ndi: ndi };
    }
    function obvCalc(kl){ var o = 0, out = [0]; for (var i = 1; i < kl.length; i++){ if (kl[i].c > kl[i-1].c) o += kl[i].v; else if (kl[i].c < kl[i-1].c) o -= kl[i].v; out.push(o); } return out; }
    function vwapCalc(kl){ var pv = 0, vv = 0; kl.forEach(function(k){ var tp = (k.h + k.l + k.c)/3; pv += tp * k.v; vv += k.v; }); return vv ? pv/vv : null; }
    function bollCalc(closes, p, mult){ p = p || 20; mult = mult || 2; if (closes.length < p) return null; var win = closes.slice(-p), mid = win.reduce(function(a,b){return a+b;},0)/p, sd = stdev(win); return { mid: mid, up: mid + mult*sd, dn: mid - mult*sd, pctB: (closes[closes.length-1] - (mid - mult*sd)) / (2*mult*sd || 1) }; }
    function swings(kl, look){
      look = look || 3; var highs = [], lows = [];
      for (var i = look; i < kl.length - look; i++){
        var isH = true, isL = true;
        for (var j = 1; j <= look; j++){ if (kl[i].h < kl[i-j].h || kl[i].h < kl[i+j].h) isH = false; if (kl[i].l > kl[i-j].l || kl[i].l > kl[i+j].l) isL = false; }
        if (isH) highs.push({ i: i, v: kl[i].h }); if (isL) lows.push({ i: i, v: kl[i].l });
      }
      return { highs: highs, lows: lows };
    }
    function correlation(a, b){
      var n = Math.min(a.length, b.length); if (n < 10) return null;
      a = a.slice(-n); b = b.slice(-n);
      var ra = [], rb = [], i;
      for (i = 1; i < n; i++){ ra.push((a[i]-a[i-1])/a[i-1]); rb.push((b[i]-b[i-1])/b[i-1]); }
      var ma = ra.reduce(function(x,y){return x+y;},0)/ra.length, mb = rb.reduce(function(x,y){return x+y;},0)/rb.length, num = 0, da = 0, db = 0;
      for (i = 0; i < ra.length; i++){ num += (ra[i]-ma)*(rb[i]-mb); da += (ra[i]-ma)*(ra[i]-ma); db += (rb[i]-mb)*(rb[i]-mb); }
      return (da && db) ? num/Math.sqrt(da*db) : null;
    }
    function trendOf(kl){
      var closes = kl.map(function(k){ return k.c; }), price = closes[closes.length-1];
      var e20 = emaLast(closes, 20), e50 = emaLast(closes, 50);
      var e200 = closes.length >= 200 ? emaLast(closes, 200) : null;
      var dir = "flat", strong = false;
      if (price > e20 && e20 > e50){ dir = "long"; strong = (e200 === null || price > e200); }
      else if (price < e20 && e20 < e50){ dir = "short"; strong = (e200 === null || price < e200); }
      else if (price > e20) dir = "long"; else if (price < e20) dir = "short";
      return { dir: dir, strong: strong, e20: e20, e50: e50, e200: e200 };
    }

    /* ================= Binance / market data ================= */
    var FAPI = "https://fapi.binance.com/fapi/v1";
    var FDATA = "https://fapi.binance.com/futures/data";
    var SAPI = "https://data-api.binance.vision/api/v3";
    /* M Ahmad Server proxy: on the Vercel deployment this app is served next to
       /api/proxy, a small server function that fetches the exchange APIs
       server-side. The phone never talks to Binance/CoinGecko directly, so
       ISP/DNS blocks on the phone cannot stop live data. If the proxy is not
       available (e.g. this page opened from anywhere else), it fails fast and
       the normal direct fetch below runs instead. */
    var SERVER_PROXY_HOSTS = ["fapi.binance.com", "data-api.binance.vision", "api.binance.com", "api.coingecko.com", "api.coinpaprika.com", "www.okx.com", "api.bitget.com", "api.gateio.ws", "api.bybit.com", "api.gold-api.com"];
    function serverProxyUrl(url){
      try {
        var h = new URL(url).hostname;
        if (SERVER_PROXY_HOSTS.indexOf(h) < 0) return null;
        return "/api/proxy?url=" + encodeURIComponent(url);
      } catch (e) { return null; }
    }
    function fetchJSON(url, timeoutMs, bustCache){
      return new Promise(function(resolve, reject){
        var ctrl = ("AbortController" in window) ? new AbortController() : null;
        var budget = timeoutMs || 10000;
        var u = url;
        if (bustCache) u += (u.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now();
        var sp = serverProxyUrl(u);
        if (sp) budget = Math.max(budget, 12000);
        var timer = setTimeout(function(){ if (ctrl) ctrl.abort(); reject(new Error("timeout — no response in " + Math.round(budget / 1000) + "s")); }, budget);
        var opts = { credentials: "omit", referrerPolicy: "no-referrer" };
        if (ctrl) opts.signal = ctrl.signal;
        function direct(){
          fetch(u, opts)
            .then(function(r){ clearTimeout(timer); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(resolve).catch(function(e){ clearTimeout(timer); reject(e); });
        }
        if (!sp) { direct(); return; }
        var done = false;
        var ptimer = setTimeout(function(){ if (!done){ done = true; direct(); } }, 7000);
        fetch(sp, { credentials: "omit", referrerPolicy: "no-referrer" })
          .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function(j){ if (!done){ done = true; clearTimeout(ptimer); clearTimeout(timer); resolve(j); } })
          .catch(function(){ if (!done){ done = true; clearTimeout(ptimer); direct(); } });
      });
    }
    /* Public CORS relays — a relay's own server fetches the API, so ISP/DNS-level
       blocks and missing CORS headers on the phone cannot stop it. Tried only after
       every direct source has failed. */
    var RELAY_BUILDERS = [
      function(u){ return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
      function(u){ return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
      function(u){ return "https://api.cors.lol/?url=" + encodeURIComponent(u); }
    ];
    async function fetchProxiedJSON(url, timeoutMs){
      var lastErr = null;
      for (var i = 0; i < RELAY_BUILDERS.length; i++){
        try { return await fetchJSON(RELAY_BUILDERS[i](url), timeoutMs || 9000); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("all relays failed");
    }
    function klineBase(){ return state.dataMode === "futures" ? FAPI : SAPI; }
    function sourceLabel(mode){
      if (mode === "futures") return "Binance Futures";
      if (mode === "spot") return "Binance Spot (Vision)";
      if (mode === "coingecko") return "CoinGecko";
      if (mode === "coinpaprika") return "CoinPaprika";
      if (mode === "okx") return "OKX";
      if (mode === "bitget") return "Bitget";
      if (mode === "gateio") return "Gate.io";
      if (mode === "bybit") return "Bybit";
      if (mode === "relay-vision") return "Binance Vision (via relay)";
      if (mode === "relay-coingecko") return "CoinGecko (via relay)";
      if (mode === "relay-paprika") return "CoinPaprika (via relay)";
      return "Binance API";
    }
    function notifyTrying(label){
      state.tryingSource = label;
      var msg = "Trying " + label + "…";
      var ls = $("loadStatus"); if (ls){ ls.style.display = "block"; ls.textContent = msg; }
      var sl = $("step1Label"); if (sl) sl.textContent = msg;
      var sm = $("scannerMeta"); if (sm && !state.tickers.length) sm.textContent = msg;
      var ou = $("ovUpdated"); if (ou && !state.lastUpdated) ou.textContent = msg;
    }
    function clearTrying(){
      state.tryingSource = null;
      var ls = $("loadStatus"); if (ls) ls.style.display = "none";
      var sl = $("step1Label"); if (sl) sl.textContent = "Fetching live prices…";
    }
    function orderedTickerSources(){
      // Auto: Binance Futures briefly first, then CoinGecko as the primary working
      // fallback (browser fetch to fapi often fails even when the Binance app works),
      // then Binance Vision spot, then CoinPaprika. A forced picker choice goes first.
      var all = ["futures", "coingecko", "spot", "coinpaprika", "okx", "bitget", "gateio", "bybit", "relay-vision", "relay-coingecko", "relay-paprika"];
      var pref = settings.dataSourcePref || "auto";
      if (pref === "auto") return all;
      var first = pref;
      var rest = all.filter(function(x){ return x !== first; });
      return [first].concat(rest);
    }
    function mapCoinGeckoMarkets(d){
      if (!Array.isArray(d) || !d.length) throw new Error("bad CoinGecko data");
      d.forEach(function(c){
        var sym = (c.symbol || "").toUpperCase() + "USDT";
        if (!state.cgMarkets[sym]) state.cgMarkets[sym] = c;
        if (c.id) state.cgIdMap[sym] = c.id;
      });
      return d.filter(function(c){ return c.current_price > 0; }).map(function(c){
        return { symbol: (c.symbol || "").toUpperCase() + "USDT", lastPrice: String(c.current_price), priceChangePercent: String(c.price_change_percentage_24h || 0), quoteVolume: String(c.total_volume || 0), highPrice: String(c.high_24h || c.current_price), lowPrice: String(c.low_24h || c.current_price), _cgId: c.id, _mcap: c.market_cap || 0 };
      });
    }
    function mapCoinPaprika(d){
      if (!Array.isArray(d) || !d.length) throw new Error("bad CoinPaprika data");
      return d.filter(function(c){ return c && c.quotes && c.quotes.USD && c.quotes.USD.price > 0 && c.symbol; }).slice(0, 350).map(function(c){
        var q = c.quotes.USD;
        return { symbol: String(c.symbol).toUpperCase() + "USDT", lastPrice: String(q.price), priceChangePercent: String(q.percent_change_24h || 0), quoteVolume: String(q.volume_24h || 0), highPrice: String(q.price), lowPrice: String(q.price), _mcap: q.market_cap || 0 };
      });
    }
    var CG_ID_FALLBACK = { BTCUSDT:"bitcoin", ETHUSDT:"ethereum", BNBUSDT:"binancecoin", SOLUSDT:"solana", XRPUSDT:"ripple", DOGEUSDT:"dogecoin", ADAUSDT:"cardano", TRXUSDT:"tron", LINKUSDT:"chainlink", LTCUSDT:"litecoin", DOTUSDT:"polkadot", AVAXUSDT:"avalanche-2", NEARUSDT:"near", SUIUSDT:"sui", PEPEUSDT:"pepe", SHIBUSDT:"shiba-inu", UNIUSDT:"uniswap", ATOMUSDT:"cosmos", FILUSDT:"filecoin", ARBUSDT:"arbitrum", OPUSDT:"optimism", INJUSDT:"injective-protocol", APTUSDT:"aptos", SEIUSDT:"sei-network", WIFUSDT:"dogwifcoin", FETUSDT:"fetch-ai", RENDERUSDT:"render-token" };
    function getCoinGeckoId(symbol){
      if (state.cgIdMap && state.cgIdMap[symbol]) return state.cgIdMap[symbol];
      var m = state.cgMarkets && state.cgMarkets[symbol];
      if (m && m.id) return m.id;
      return CG_ID_FALLBACK[symbol] || null;
    }
    async function tryTickerSource(key){
      if (key === "futures"){
        // Brief timeout in Auto so a blocked fapi fails fast into the CoinGecko path
        var futTimeout = (settings.dataSourcePref === "futures") ? 6000 : 3500;
        var d1 = await fetchJSON(FAPI + "/ticker/24hr", futTimeout);
        if (!Array.isArray(d1) || !d1.length || !d1[0].lastPrice) throw new Error("bad futures data");
        return d1;
      }
      if (key === "spot"){
        var d2 = await fetchJSON(SAPI + "/ticker/24hr", 6000);
        if (!Array.isArray(d2) || !d2.length) throw new Error("bad spot data");
        return d2;
      }
      if (key === "coingecko"){
        var d3 = await fetchJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1", 6000);
        return mapCoinGeckoMarkets(d3);
      }
      if (key === "coinpaprika"){
        var d4 = await fetchJSON("https://api.coinpaprika.com/v1/tickers", 6000);
        var mapped = mapCoinPaprika(d4);
        if (!mapped.length) throw new Error("bad CoinPaprika data");
        return mapped;
      }
      if (key === "okx"){
        var d5 = await fetchJSON("https://www.okx.com/api/v5/market/tickers?instType=SWAP", 6000);
        if (!d5 || !Array.isArray(d5.data) || !d5.data.length) throw new Error("bad OKX data");
        return d5.data.filter(function(x){ return /-USDT-SWAP$/.test(x.instId) && parseFloat(x.last) > 0; }).map(function(x){
          var last = parseFloat(x.last), open = parseFloat(x.open24h);
          return { symbol: x.instId.replace("-USDT-SWAP", "USDT"), lastPrice: x.last, priceChangePercent: String(open ? (last - open) / open * 100 : 0), quoteVolume: String(parseFloat(x.volCcy24h || 0) * last), highPrice: x.high24h, lowPrice: x.low24h };
        });
      }
      if (key === "bitget"){
        var d6 = await fetchJSON("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", 6000);
        if (!d6 || !Array.isArray(d6.data) || !d6.data.length) throw new Error("bad Bitget data");
        return d6.data.filter(function(x){ return /USDT$/.test(x.symbol) && parseFloat(x.lastPr) > 0; }).map(function(x){
          return { symbol: x.symbol, lastPrice: x.lastPr, priceChangePercent: String(parseFloat(x.change24h || 0) * 100), quoteVolume: String(x.usdtVolume || x.quoteVolume || 0), highPrice: x.high24h, lowPrice: x.low24h };
        });
      }
      if (key === "gateio"){
        var d7 = await fetchJSON("https://api.gateio.ws/api/v4/futures/usdt/tickers", 6000);
        if (!Array.isArray(d7) || !d7.length) throw new Error("bad Gate.io data");
        return d7.filter(function(x){ return /_USDT$/.test(x.contract) && parseFloat(x.last) > 0; }).map(function(x){
          return { symbol: x.contract.replace("_USDT", "USDT"), lastPrice: x.last, priceChangePercent: String(parseFloat(x.change_percentage || 0)), quoteVolume: String(x.volume_24h_quote || 0), highPrice: x.high_24h, lowPrice: x.low_24h };
        });
      }
      if (key === "bybit"){
        var d8 = await fetchJSON("https://api.bybit.com/v5/market/tickers?category=linear", 6000);
        if (!d8 || !d8.result || !Array.isArray(d8.result.list) || !d8.result.list.length) throw new Error("bad Bybit data");
        return d8.result.list.filter(function(x){ return /USDT$/.test(x.symbol) && parseFloat(x.lastPrice) > 0; }).map(function(x){
          return { symbol: x.symbol, lastPrice: x.lastPrice, priceChangePercent: String(parseFloat(x.price24hPcnt || 0) * 100), quoteVolume: String(x.turnover24h || 0), highPrice: x.highPrice24h, lowPrice: x.lowPrice24h };
        });
      }
      if (key === "relay-vision"){
        var d9 = await fetchProxiedJSON(SAPI + "/ticker/24hr", 9000);
        if (!Array.isArray(d9) || !d9.length) throw new Error("bad relay spot data");
        return d9;
      }
      if (key === "relay-coingecko"){
        var d10 = await fetchProxiedJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1", 9000);
        return mapCoinGeckoMarkets(d10);
      }
      if (key === "relay-paprika"){
        var d11 = await fetchProxiedJSON("https://api.coinpaprika.com/v1/tickers", 9000);
        var mapped2 = mapCoinPaprika(d11);
        if (!mapped2.length) throw new Error("bad relay CoinPaprika data");
        return mapped2;
      }
      throw new Error("unknown source " + key);
    }
    async function getAllTickers(){
      var order = orderedTickerSources();
      var errors = [];
      state.lastSourceErrors = errors;
      for (var i = 0; i < order.length; i++){
        var key = order[i];
        notifyTrying(sourceLabel(key));
        try {
          var data = await tryTickerSource(key);
          if (!data || !data.length) throw new Error("empty data");
          state.dataMode = key;
          state.viaProxy = key.indexOf("relay-") === 0;
          state.lastUpdated = new Date();
          clearTrying();
          return data;
        } catch (e) {
          errors.push({ source: sourceLabel(key), key: key, error: (e && e.message) ? e.message : "failed" });
          state.lastSourceErrors = errors.slice();
          continue;
        }
      }
      clearTrying();
      var err = new Error("All data sources failed: " + errors.map(function(x){ return x.source + " (" + x.error + ")"; }).join("; "));
      err.sourceErrors = errors;
      throw err;
    }
    function getFunding(){
      if (state.dataMode !== "futures") return Promise.resolve({});
      return fetchJSON(FAPI + "/premiumIndex", 9000).then(function(d){
        var map = {}; if (Array.isArray(d)) d.forEach(function(x){ map[x.symbol] = parseFloat(x.lastFundingRate) * 100; });
        return map;
      }).catch(function(){ return {}; });
    }
    function parseBinanceKlines(d){
      if (!Array.isArray(d) || !d.length) throw new Error("bad klines");
      return d.map(function(k){ return { t: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]), qv: parseFloat(k[7]), tbq: parseFloat(k[10]) }; });
    }
    function fetchBinanceKlines(base, symbol, interval, limit){
      var url = base + "/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=" + (limit || 120);
      return fetchJSON(url, 6000).then(parseBinanceKlines);
    }
    function cgChartUrl(symbol, interval){
      var id = getCoinGeckoId(symbol);
      if (!id) return null;
      var days = (interval === "1d" || interval === "1w") ? 30 : (interval === "4h" ? 7 : 1);
      return "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(id) + "/market_chart?vs_currency=usd&days=" + days;
    }
    function parseCgChart(d, limit){
      if (!d || !Array.isArray(d.prices) || d.prices.length < 10) throw new Error("bad CoinGecko chart");
      var prices = d.prices, vols = d.total_volumes || [];
      var volMap = {}; vols.forEach(function(v){ volMap[v[0]] = v[1]; });
      var out = prices.map(function(p, idx){
        var price = p[1], prev = idx > 0 ? prices[idx-1][1] : price;
        var vol = volMap[p[0]] || 0;
        var qv = vol; var vBase = price ? vol / price : 0;
        return { t: p[0], o: prev, h: Math.max(prev, price), l: Math.min(prev, price), c: price, v: vBase, qv: qv, tbq: qv * 0.5 };
      });
      var lim = limit || 120;
      if (out.length > lim) out = out.slice(-lim);
      // Resample if too many points for daily etc — keep as is, indicators work on closes
      return out;
    }
    async function coinGeckoKlines(symbol, interval, limit){
      var url = cgChartUrl(symbol, interval);
      if (!url) throw new Error("no CoinGecko id for " + symbol);
      var d = await fetchJSON(url, 6000);
      return parseCgChart(d, limit);
    }
    function okxInst(symbol){ return symbol.replace(/USDT$/, "") + "-USDT-SWAP"; }
    function okxKlines(symbol, interval, limit){
      var bar = { "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W" }[interval] || "1H";
      var lim = Math.min(limit || 120, 300);
      return fetchJSON("https://www.okx.com/api/v5/market/candles?instId=" + encodeURIComponent(okxInst(symbol)) + "&bar=" + bar + "&limit=" + lim, 6000).then(function(d){
        if (!d || !Array.isArray(d.data) || d.data.length < 10) throw new Error("bad OKX klines");
        return d.data.slice().reverse().map(function(k){
          var qv = parseFloat(k[7]) || 0;
          return { t: parseInt(k[0], 10), o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[6]) || 0, qv: qv, tbq: qv * 0.5 };
        });
      });
    }
    function bitgetKlines(symbol, interval, limit){
      var gran = { "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W" }[interval] || "1H";
      var lim = Math.min(limit || 120, 200);
      return fetchJSON("https://api.bitget.com/api/v2/mix/market/candles?symbol=" + encodeURIComponent(symbol) + "&productType=USDT-FUTURES&granularity=" + gran + "&limit=" + lim, 6000).then(function(d){
        if (!d || !Array.isArray(d.data) || d.data.length < 10) throw new Error("bad Bitget klines");
        return d.data.map(function(k){
          var qv = parseFloat(k[6]) || 0;
          return { t: parseInt(k[0], 10), o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]) || 0, qv: qv, tbq: qv * 0.5 };
        });
      });
    }
    function gateKlines(symbol, interval, limit){
      var iv = { "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "7d" }[interval] || "1h";
      var lim = Math.min(limit || 120, 500);
      var contract = symbol.replace(/USDT$/, "") + "_USDT";
      return fetchJSON("https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=" + encodeURIComponent(contract) + "&interval=" + iv + "&limit=" + lim, 6000).then(function(d){
        if (!Array.isArray(d) || d.length < 10) throw new Error("bad Gate.io klines");
        return d.map(function(k){
          var qv = parseFloat(k.sum) || 0, c = parseFloat(k.c);
          return { t: (k.t || 0) * 1000, o: parseFloat(k.o), h: parseFloat(k.h), l: parseFloat(k.l), c: c, v: c ? qv / c : 0, qv: qv, tbq: qv * 0.5 };
        });
      });
    }
    function bybitKlines(symbol, interval, limit){
      var iv = { "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W" }[interval] || "60";
      var lim = Math.min(limit || 120, 1000);
      return fetchJSON("https://api.bybit.com/v5/market/kline?category=linear&symbol=" + encodeURIComponent(symbol) + "&interval=" + iv + "&limit=" + lim, 6000).then(function(d){
        if (!d || !d.result || !Array.isArray(d.result.list) || d.result.list.length < 10) throw new Error("bad Bybit klines");
        return d.result.list.slice().reverse().map(function(k){
          var qv = parseFloat(k[6]) || 0;
          return { t: parseInt(k[0], 10), o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]) || 0, qv: qv, tbq: qv * 0.5 };
        });
      });
    }
    async function proxyKlines(symbol, interval, limit){
      // Candles through a public relay: Binance Vision klines first, then CoinGecko chart.
      var url = SAPI + "/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=" + (limit || 120);
      try { var d = await fetchProxiedJSON(url, 9000); return parseBinanceKlines(d); } catch (e) { /* try CoinGecko via relay */ }
      var cgUrl = cgChartUrl(symbol, interval);
      if (!cgUrl) throw new Error("no relay klines for " + symbol);
      var d2 = await fetchProxiedJSON(cgUrl, 9000);
      return parseCgChart(d2, limit);
    }
    async function getKlines(symbol, interval, limit){
      // Fallback chain: active Binance base -> CoinGecko market_chart -> Binance Vision.
      // When tickers came from CoinGecko, CoinGecko klines are tried first (Vision second)
      // so the app never depends on fapi.binance.com working in a browser/webview.
      var attempts = [];
      if (state.dataMode === "coingecko" || state.dataMode === "relay-coingecko"){
        attempts = ["coingecko", "vision"];
      } else if (state.dataMode === "futures"){
        attempts = ["futures", "vision", "coingecko"];
      } else if (state.dataMode === "okx"){
        attempts = ["okx", "vision", "coingecko"];
      } else if (state.dataMode === "bitget"){
        attempts = ["bitget", "vision", "coingecko"];
      } else if (state.dataMode === "gateio"){
        attempts = ["gateio", "vision", "coingecko"];
      } else if (state.dataMode === "bybit"){
        attempts = ["bybit", "vision", "coingecko"];
      } else {
        attempts = ["vision", "coingecko"];
      }
      if (state.viaProxy) attempts.push("proxy");
      var lastErr = null;
      for (var i = 0; i < attempts.length; i++){
        try {
          if (attempts[i] === "coingecko") return await coinGeckoKlines(symbol, interval, limit);
          if (attempts[i] === "okx") return await okxKlines(symbol, interval, limit);
          if (attempts[i] === "bitget") return await bitgetKlines(symbol, interval, limit);
          if (attempts[i] === "gateio") return await gateKlines(symbol, interval, limit);
          if (attempts[i] === "bybit") return await bybitKlines(symbol, interval, limit);
          if (attempts[i] === "proxy") return await proxyKlines(symbol, interval, limit);
          var base = attempts[i] === "futures" ? FAPI : SAPI;
          return await fetchBinanceKlines(base, symbol, interval, limit);
        } catch (e) { lastErr = e; }
      }
      // Last resort for every mode: candles through a public relay
      try { return await proxyKlines(symbol, interval, limit); } catch (e2) { if (!lastErr) lastErr = e2; }
      throw lastErr || new Error("klines unavailable");
    }
    function spotKlines(symbol, interval, limit){
      return fetchJSON(SAPI + "/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=" + (limit || 120), 6000).then(function(d){
        if (!Array.isArray(d)) throw new Error("bad spot klines");
        return d.map(function(k){ return { t: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]), qv: parseFloat(k[7]), tbq: parseFloat(k[10]) }; });
      }).catch(function(){ return null; });
    }
    function getDepth(symbol){
      var url = klineBase() + "/depth?symbol=" + encodeURIComponent(symbol) + "&limit=100";
      return fetchJSON(url, 8000).then(function(d){
        if (!d || !d.bids || !d.asks) throw new Error("bad depth");
        return { bids: d.bids.map(function(x){ return [parseFloat(x[0]), parseFloat(x[1])]; }), asks: d.asks.map(function(x){ return [parseFloat(x[0]), parseFloat(x[1])]; }) };
      }).catch(function(){ return null; });
    }
    function getOIHist(symbol){
      if (state.dataMode !== "futures") return Promise.resolve(null);
      return fetchJSON(FDATA + "/openInterestHist?symbol=" + encodeURIComponent(symbol) + "&period=1h&limit=12", 8000).then(function(d){
        if (!Array.isArray(d) || d.length < 5) return null;
        var vals = d.map(function(x){ return parseFloat(x.sumOpenInterestValue); });
        var cur = vals[vals.length-1], ref = vals[Math.max(0, vals.length-5)];
        return { value: cur, change4h: ref ? (cur - ref)/ref*100 : 0 };
      }).catch(function(){ return null; });
    }
    function getRatio(endpoint, symbol){
      if (state.dataMode !== "futures") return Promise.resolve(null);
      return fetchJSON(FDATA + "/" + endpoint + "?symbol=" + encodeURIComponent(symbol) + "&period=1h&limit=1", 8000).then(function(d){
        if (!Array.isArray(d) || !d.length) return null;
        return parseFloat(d[0].longShortRatio);
      }).catch(function(){ return null; });
    }
    function loadGlobalExtras(){
      // Never blocks dashboard — each fetch is independent, failures only affect its own card
      fetchJSON("https://api.coingecko.com/api/v3/global", 6000).then(function(d){
        if (d && d.data){ state.cgGlobal = { dom: d.data.market_cap_percentage.btc, mcap: d.data.total_market_cap.usd, mcapChg: d.data.market_cap_change_percentage_24h_usd }; renderOverview(); }
      }).catch(function(){
        fetchProxiedJSON("https://api.coingecko.com/api/v3/global", 9000).then(function(d){
          if (d && d.data){ state.cgGlobal = { dom: d.data.market_cap_percentage.btc, mcap: d.data.total_market_cap.usd, mcapChg: d.data.market_cap_change_percentage_24h_usd }; }
        }).catch(function(){}).then(function(){ renderOverview(); });
      });
      fetchJSON("https://api.alternative.me/fng/?limit=1", 6000).then(function(d){
        if (d && d.data && d.data.length){ state.fng = { value: parseInt(d.data[0].value, 10), label: d.data[0].value_classification }; renderOverview(); }
      }).catch(function(){
        fetchProxiedJSON("https://api.alternative.me/fng/?limit=1", 9000).then(function(d){
          if (d && d.data && d.data.length){ state.fng = { value: parseInt(d.data[0].value, 10), label: d.data[0].value_classification }; renderOverview(); }
        }).catch(function(){});
      });
      fetchJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1", 6000).then(function(d){
        if (Array.isArray(d)) d.forEach(function(c){ var s = (c.symbol || "").toUpperCase() + "USDT"; if (!state.cgMarkets[s]) state.cgMarkets[s] = c; if (c.id) state.cgIdMap[s] = c.id; });
        renderOverview();
      }).catch(function(){});
      fetchJSON("https://api.coingecko.com/api/v3/search/trending", 6000).then(function(d){
        if (d && Array.isArray(d.coins)){ state.trending = d.coins.slice(0, 8).map(function(x){ return x.item; }); renderTrending(); }
      }).catch(function(){});
    }
    function approxGlobalFromTickers(){
      // Approximate dominance / mcap from CoinGecko markets cache or ticker _mcap when /global failed
      var total = 0, btcCap = 0, count = 0;
      Object.keys(state.cgMarkets || {}).forEach(function(k){ var c = state.cgMarkets[k]; if (c && c.market_cap){ total += c.market_cap; count++; if (k === "BTCUSDT") btcCap = c.market_cap; } });
      if (count > 10 && total > 0 && btcCap > 0) return { dom: btcCap / total * 100, mcap: total, approx: true };
      var tTotal = 0, tBtc = 0, tCount = 0;
      (state.tickers || []).forEach(function(t){ if (t._mcap){ tTotal += t._mcap; tCount++; if (t.symbol === "BTCUSDT") tBtc = t._mcap; } });
      if (tCount > 10 && tTotal > 0 && tBtc > 0) return { dom: tBtc / tTotal * 100, mcap: tTotal, approx: true };
      return null;
    }

    /* ================= Extra data helpers ================= */
    function getFundingHist(symbol){
      if (state.dataMode !== "futures") return Promise.resolve(null);
      return fetchJSON(FAPI + "/fundingRate?symbol=" + encodeURIComponent(symbol) + "&limit=4", 8000).then(function(d){
        if (!Array.isArray(d) || !d.length) return null;
        return d.map(function(x){ return parseFloat(x.fundingRate) * 100; });
      }).catch(function(){ return null; });
    }
    function getSpotTicker(symbol){
      return fetchJSON(SAPI + "/ticker/24hr?symbol=" + encodeURIComponent(symbol), 8000).then(function(d){
        return (d && d.quoteVolume) ? { price: parseFloat(d.lastPrice), qv: parseFloat(d.quoteVolume), chg: parseFloat(d.priceChangePercent) } : null;
      }).catch(function(){ return null; });
    }

    /* ================= Dashboard ================= */
    var EXCLUDE = { USDC:1, FDUSD:1, TUSD:1, DAI:1, BFUSD:1, USD1:1, EUR:1, GBP:1, TRY:1, BRL:1, ARS:1, NGN:1, ZAR:1, UAH:1, RUB:1, MXN:1, AUD:1, JPY:1, KRW:1, BUSD:1 };
    function isTradablePair(t){
      var s = t.symbol;
      if (!/USDT$/.test(s) || s.indexOf("_") >= 0) return false;
      var b = s.replace(/USDT$/, "");
      if (EXCLUDE[b]) return false;
      if (b.length >= 5 && /(UP|DOWN|BULL|BEAR)$/.test(b)) return false;
      return parseFloat(t.quoteVolume) >= 4e6 && parseFloat(t.lastPrice) > 0;
    }
    function liquidPool(){
      var pool = state.tickers.filter(isTradablePair);
      // CoinGecko / CoinPaprika volumes are global spot volumes — if the strict
      // futures-volume cut leaves too few coins, relax it so Scanner still works.
      if (pool.length < 15 && state.dataMode !== "futures"){
        pool = state.tickers.filter(function(t){
          var s = t.symbol;
          if (!/USDT$/.test(s) || s.indexOf("_") >= 0) return false;
          var b = s.replace(/USDT$/, "");
          if (EXCLUDE[b]) return false;
          return parseFloat(t.quoteVolume) >= 5e5 && parseFloat(t.lastPrice) > 0;
        });
      }
      return pool;
    }

    /* ================= Diagnostics ================= */
    function renderDiagSummary(){
      var active = state.dataMode ? (sourceLabel(state.dataMode) + " · Live") : "—";
      var upd = state.lastUpdated ? state.lastUpdated.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";
      var dn = $("dataSourceNote"); if (dn) dn.textContent = "Active source: " + active + " · Last updated: " + upd + (state.tryingSource ? " · Trying " + state.tryingSource + "…" : "");
      var da = $("diagActive"); if (da) da.textContent = "Currently active data source: " + active + " · Last updated: " + upd;
    }
    function sourceResultsHTML(errors){
      if (!errors || !errors.length) return "";
      return '<div style="display:grid; gap:6px;">' + errors.map(function(x){
        return '<div class="small" style="background:var(--chip); border-radius:8px; padding:8px 10px; font-weight:700;">' + esc(x.source) + ': <span style="color:var(--short);">Failed</span> <span class="muted">(' + esc(x.error) + ')</span></div>';
      }).join("") + "</div>";
    }
    async function fetchStatus(url){
      var ctrl = ("AbortController" in window) ? new AbortController() : null;
      var timer = setTimeout(function(){ if (ctrl) ctrl.abort(); }, 6000);
      try {
        var r = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
        clearTimeout(timer);
        // Consume a little body so CORS / parse failures surface
        try { await r.text(); } catch (e) {}
        return { ok: r.ok, status: r.status, error: r.ok ? "" : ("HTTP " + r.status) };
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, status: null, error: (e && e.name === "AbortError") ? "timeout (6s)" : ((e && e.message) ? e.message : "Failed to fetch") };
      }
    }
    async function testConnection(){
      var btn = $("testConnBtn"); if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
      var box = $("diagResults"); if (box) box.innerHTML = '<p class="muted small">Testing endpoints one by one…</p>';
      var visionBtc = "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT";
      var tests = [
        { key: "futures", label: "Binance Futures", url: "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT" },
        { key: "spot", label: "Binance Vision (Spot)", url: visionBtc },
        { key: "coingecko", label: "CoinGecko", url: "https://api.coingecko.com/api/v3/ping" },
        { key: "coinpaprika", label: "CoinPaprika", url: "https://api.coinpaprika.com/v1/global" },
        { key: "okx", label: "OKX", url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP" },
        { key: "bitget", label: "Bitget", url: "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES" },
        { key: "gateio", label: "Gate.io", url: "https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT" },
        { key: "bybit", label: "Bybit", url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT" },
        { key: "relay1", label: "Relay 1 (AllOrigins → Binance Vision)", url: RELAY_BUILDERS[0](visionBtc) },
        { key: "relay2", label: "Relay 2 (CodeTabs → Binance Vision)", url: RELAY_BUILDERS[1](visionBtc) },
        { key: "relay3", label: "Relay 3 (Cors.lol → Binance Vision)", url: RELAY_BUILDERS[2](visionBtc) }
      ];
      var results = [];
      for (var i = 0; i < tests.length; i++){
        if (box) box.innerHTML = '<p class="muted small">Trying ' + esc(tests[i].label) + '…</p>' + (results.length ? diagResultsHTML(results) : "");
        var res = await fetchStatus(tests[i].url);
        results.push({ label: tests[i].label, key: tests[i].key, ok: res.ok, status: res.status, error: res.error });
        state.diagResults = results.slice();
        if (box) box.innerHTML = diagResultsHTML(results);
      }
      var adv = $("diagAdvice");
      if (adv){
        var okOne = null;
        results.forEach(function(r){ if (r.ok && !okOne) okOne = r; });
        if (okOne) adv.innerHTML = '<span style="color:var(--long);">Working source found: ' + esc(okOne.label) + '.</span> Go back to the Dashboard and tap Retry — the app automatically loads live prices through whichever sources work.';
        else adv.innerHTML = '<span style="color:var(--short);">Every direct source AND every relay failed in this browser.</span> That means this in-app browser/viewer is blocking all outside connections from this page. The Binance app working does not change that — apps do not use the browser. Try: (1) open this page in Chrome from the ⋯ menu at the top, (2) turn OFF Private DNS (Android Settings → Network &amp; internet → Private DNS), any VPN, ad-blocker or data-saver, (3) if you are on WiFi, try mobile data once — or the reverse. Then run this test again.';
      }
      renderDiagSummary();
      if (btn) { btn.disabled = false; btn.textContent = "Test Connection"; }
      return results;
    }
    function diagResultsHTML(results){
      return '<div style="display:grid; gap:6px;">' + results.map(function(r){
        var right = r.ok ? '<span style="color:var(--long);">OK' + (r.status ? " · HTTP " + r.status : "") + "</span>" : '<span style="color:var(--short);">Failed</span> <span class="muted">(' + esc(r.status ? ("HTTP " + r.status) : r.error) + ")</span>";
        return '<div class="small" style="background:var(--chip); border-radius:8px; padding:8px 10px; font-weight:700;">' + esc(r.label) + ": " + right + "</div>";
      }).join("") + "</div>";
    }

    function setLiveState(mode){
      var tag = $("tbLiveTag"), txt = $("tbLiveTxt"), pill = $("sigLivePill"), ptxt = $("sigLiveTxt");
      if (tag){ tag.classList.remove("on", "off"); if (mode) tag.classList.add(mode); }
      if (txt) txt.textContent = mode === "on" ? "LIVE" : mode === "off" ? "OFFLINE" : "CONNECTING";
      if (pill){ pill.classList.remove("off"); if (mode === "off") pill.classList.add("off"); }
      if (ptxt) ptxt.textContent = mode === "on" ? "Live" : mode === "off" ? "Offline" : "Connecting";
    }
    function renderOverview(){
      if (state.dataMode) setLiveState("on");
      var btc = state.bySym["BTCUSDT"];
      if (btc){
        $("ovBtcPrice").textContent = "$" + fmtP(parseFloat(btc.lastPrice));
        var ch = parseFloat(btc.priceChangePercent), el = $("ovBtcChg");
        el.textContent = fmtPct(ch) + " · 24h · " + (state.btcCtx ? state.btcCtx.label : "");
        el.className = "s mono " + (ch >= 0 ? "up" : "down");
      }
      var glob = state.cgGlobal;
      if (!glob) { var approx = approxGlobalFromTickers(); if (approx) glob = { dom: approx.dom, mcap: approx.mcap, mcapChg: null, approx: true }; }
      if (glob){
        $("ovDom").textContent = glob.dom.toFixed(1) + "%";
        $("ovDomSub").textContent = glob.approx ? "Approx. from top coins (CoinGecko /global unavailable)" : "Share of total market";
        $("ovMcap").textContent = fmtMoney(glob.mcap);
        var mc = $("ovMcapChg");
        if (glob.mcapChg !== null && glob.mcapChg !== undefined){ mc.textContent = fmtPct(glob.mcapChg) + " · 24h (CoinGecko)"; mc.className = "s mono " + (glob.mcapChg >= 0 ? "up" : "down"); }
        else { mc.textContent = glob.approx ? "Approx. total (top 250 coins)" : "All cryptocurrencies"; mc.className = "s mono"; }
      }
      if (state.fng){
        $("ovFng").textContent = state.fng.value + " / 100";
        $("ovFngLabel").textContent = state.fng.label + " (alternative.me)";
        var bar = $("ovFngBar");
        bar.style.width = state.fng.value + "%";
        bar.style.background = state.fng.value <= 25 ? "var(--short)" : state.fng.value <= 45 ? "var(--gold)" : state.fng.value <= 55 ? "var(--ink2)" : "var(--long)";
      }
      var pool = liquidPool();
      if (pool.length){
        var green = pool.filter(function(t){ return parseFloat(t.priceChangePercent) >= 0; }).length;
        var pct = Math.round(green / pool.length * 100);
        $("ovBreadth").textContent = pct + "% green";
        $("ovBreadthSub").textContent = green + " of " + pool.length + " liquid futures pairs up in 24h";
      }
      $("ovSrc").textContent = state.dataMode ? (sourceLabel(state.dataMode) + " · Live") : "Binance API";
      var upd = state.lastUpdated ? state.lastUpdated.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : timeNow();
      $("ovUpdated").textContent = "Updated " + upd + (state.dataMode === "spot" ? " · Futures blocked — spot fallback" : state.dataMode && state.dataMode !== "futures" ? " · via " + sourceLabel(state.dataMode) + " fallback" : "");
      renderDiagSummary();
    }
    function moverHTML(t){
      var ch = parseFloat(t.priceChangePercent);
      return '<button type="button" class="mover" data-sym="' + esc(t.symbol) + '"><span><span class="ms">' + esc(t.symbol.replace(/USDT$/, "")) + '</span> <span class="mp">/ USDT</span><br /><span class="mp mono">$' + fmtP(parseFloat(t.lastPrice)) + ' · Vol ' + fmtMoney(parseFloat(t.quoteVolume)) + '</span></span><span class="mono" style="font-weight:800;" ><span class="' + (ch >= 0 ? "up" : "down") + '">' + fmtPct(ch) + "</span></span></button>";
    }
    function renderMovers(){
      var pool = liquidPool().slice().sort(function(a, b){ return parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent); });
      $("gainersList").innerHTML = pool.slice(0, 6).map(moverHTML).join("") || '<p class="muted small">No data yet.</p>';
      $("losersList").innerHTML = pool.slice(-6).reverse().map(moverHTML).join("") || '<p class="muted small">No data yet.</p>';
      document.querySelectorAll(".mover").forEach(function(b){ b.addEventListener("click", function(){ openAnalysis(b.getAttribute("data-sym")); }); });
    }
    function renderTrending(){
      if (!state.trending.length) return;
      $("trendingRow").innerHTML = state.trending.map(function(c){
        return '<button type="button" class="chip-btn" data-sym="' + esc((c.symbol || "").toUpperCase()) + 'USDT">' + esc(c.name) + " · #" + c.market_cap_rank + "</button>";
      }).join("");
      $("trendingRow").querySelectorAll("button").forEach(function(b){ b.addEventListener("click", function(){ openAnalysis(b.getAttribute("data-sym")); }); });
    }
    function renderPulse(){
      var items = [], pool = liquidPool();
      if (!pool.length) return;
      var green = pool.filter(function(t){ return parseFloat(t.priceChangePercent) >= 0; }).length;
      var pct = Math.round(green / pool.length * 100);
      items.push("<li><b>Market breadth:</b> " + pct + "% of liquid futures pairs are green in 24h — " + (pct >= 58 ? "buyers in control" : pct >= 44 ? "mixed / sideways market" : "sellers in control") + ".</li>");
      var btc = state.bySym["BTCUSDT"];
      if (btc) items.push("<li><b>Bitcoin:</b> " + fmtPct(parseFloat(btc.priceChangePercent)) + " in 24h at $" + fmtP(parseFloat(btc.lastPrice)) + (state.btcCtx ? " · 4H trend: <b>" + state.btcCtx.label + "</b>" : "") + ". Altcoins usually follow BTC's direction.</li>");
      var sorted = pool.slice().sort(function(a, b){ return parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent); });
      if (sorted.length > 1) items.push("<li><b>Strongest:</b> " + esc(sorted[0].symbol) + " " + fmtPct(parseFloat(sorted[0].priceChangePercent)) + " · <b>Weakest:</b> " + esc(sorted[sorted.length-1].symbol) + " " + fmtPct(parseFloat(sorted[sorted.length-1].priceChangePercent)) + ".</li>");
      if (state.dataMode === "futures"){
        var extreme = Object.keys(state.funding).filter(function(s){ return Math.abs(state.funding[s]) > 0.08 && state.bySym[s]; }).slice(0, 5);
        if (extreme.length) items.push("<li><b>Extreme funding (crowded trades):</b> " + extreme.map(function(s){ return esc(s.replace(/USDT$/, "")) + " " + (state.funding[s] >= 0 ? "+" : "") + state.funding[s].toFixed(3) + "%"; }).join(", ") + " — crowded sides carry squeeze risk.</li>");
        else items.push("<li><b>Funding:</b> no extremely crowded pairs right now — funding is balanced across the top pairs.</li>");
      }
      if (state.fng) items.push("<li><b>Sentiment:</b> Fear &amp; Greed is at <b>" + state.fng.value + " (" + esc(state.fng.label) + ")</b>. Extreme fear has historically marked bounce zones, but it can stay extreme in downtrends.</li>");
      if (state.cgGlobal) items.push("<li><b>BTC dominance:</b> " + state.cgGlobal.dom.toFixed(1) + "% — " + (state.cgGlobal.dom >= 52 ? "capital is concentrated in BTC; altcoins usually struggle" : "capital is spread into altcoins more than usual") + ".</li>");
      var ms = $("marketSummaryText");
      if (ms){
        var btcT = state.bySym["BTCUSDT"];
        var domTxt = state.cgGlobal ? state.cgGlobal.dom.toFixed(1) + "%" : "—";
        var fgTxt = state.fng ? state.fng.value + " (" + state.fng.label + ")" : "—";
        ms.textContent = "In plain words: Bitcoin is " + (btcT ? fmtPct(parseFloat(btcT.priceChangePercent)) + " today" : "loading") + (state.btcCtx ? " with a " + state.btcCtx.label.toLowerCase() + " 4H trend" : "") + ". BTC dominance is " + domTxt + ", Fear & Greed is " + fgTxt + ", and " + pct + "% of liquid coins are green. " + (pct >= 58 ? "Buyers are in control — LONG setups have the wind behind them, but still wait for confirmations." : pct >= 44 ? "The market is mixed — be selective, take only the cleanest setups." : "Sellers are in control — be extra careful with LONGs and protect capital first.");
      }
      $("pulseList").innerHTML = items.join("");
      $("newsBox").textContent = "No verified live news feed is available without an API key, so no headlines are shown instead of invented ones. Use the Market Pulse above (built from live data) and the News & Fundamentals section inside any coin's Analysis.";
    }

    /* ================= Daily tracker ================= */
    function trackerStats(){
      var pnl = 0, wins = 0, losses = 0;
      state.tracker.forEach(function(e){ pnl += e.amt; if (e.amt > 0) wins++; else if (e.amt < 0) losses++; });
      var decided = wins + losses;
      return { pnl: pnl, wins: wins, losses: losses, trades: state.tracker.length, winRate: decided ? Math.round(wins / decided * 100) : null };
    }
    function renderTracker(){
      var cfg = modeCfg(), st = trackerStats();
      $("trkMode").textContent = cfg.label + " mode · Capital $" + settings.capital + " · Risk " + settings.riskPct + "%/trade";
      var pnlEl = $("trkPnl");
      pnlEl.textContent = (st.pnl >= 0 ? "+$" : "−$") + Math.abs(st.pnl).toFixed(2);
      pnlEl.style.color = st.pnl > 0 ? "var(--long)" : st.pnl < 0 ? "var(--short)" : "var(--ink)";
      $("trkTargetTxt").textContent = "$" + cfg.target[0] + " – $" + cfg.target[1];
      var pct = clamp(st.pnl / cfg.target[1] * 100, 0, 100);
      var bar = $("trkTargetBar");
      bar.style.width = pct + "%";
      bar.style.background = st.pnl < 0 ? "var(--short)" : st.pnl >= cfg.target[0] ? "var(--long)" : "var(--gold)";
      $("trkTrades").textContent = st.trades + (cfg.maxTrades ? " / " + cfg.maxTrades + " max" : "");
      $("trkWinRate").textContent = st.winRate === null ? "—" : st.winRate + "%";
      $("trkWL").textContent = st.wins + " / " + st.losses;
      var note = "";
      if (cfg.maxTrades && st.trades >= cfg.maxTrades) note = "Daily trade limit reached (" + cfg.maxTrades + ") — stop trading for today and protect the account.";
      else if (st.pnl >= cfg.target[0]) note = "Daily target zone reached. Consider stopping — giving back profits is how good days turn bad.";
      else if (st.pnl <= -7.5 && settings.mode === "aggressive") note = "You are at the aggressive mode's bad-day loss zone (−$7.50). Strongly consider stopping for today.";
      $("trkLimitNote").textContent = note;
      $("trkEntries").innerHTML = state.tracker.slice().reverse().map(function(e, ri){
        var idx = state.tracker.length - 1 - ri;
        return '<div class="hist-item"><span><b>' + esc(e.label) + '</b> <span class="muted small">' + esc(e.time) + '</span></span><span style="display:flex; gap:8px; align-items:center;"><span class="mono" style="font-weight:800; color:' + (e.amt > 0 ? "var(--long)" : e.amt < 0 ? "var(--short)" : "var(--ink2)") + '">' + (e.amt >= 0 ? "+$" : "−$") + Math.abs(e.amt).toFixed(2) + '</span><button type="button" class="chip-btn" data-del="' + idx + '" style="min-height:36px; padding:5px 11px;">Remove</button></span></div>';
      }).join("");
      $("trkEntries").querySelectorAll("[data-del]").forEach(function(b){
        b.addEventListener("click", function(){ state.tracker.splice(parseInt(b.getAttribute("data-del"), 10), 1); renderTracker(); });
      });
    }
    function addTracker(amt, label){
      state.tracker.push({ amt: amt, label: label, time: timeNow() });
      renderTracker();
    }

    /* ================= Scanner coin list ================= */
    function renderCoinList(){
      var q = ($("coinSearch").value || "").toUpperCase().trim();
      var pool = liquidPool();
      if (state.listFilter === "green") pool = pool.filter(function(t){ return parseFloat(t.priceChangePercent) >= 0; });
      if (state.listFilter === "red") pool = pool.filter(function(t){ return parseFloat(t.priceChangePercent) < 0; });
      if (state.listSort === "volume") pool.sort(function(a, b){ return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume); });
      if (state.listSort === "gainers") pool.sort(function(a, b){ return parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent); });
      if (state.listSort === "losers") pool.sort(function(a, b){ return parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent); });
      if (state.listSort === "az") pool.sort(function(a, b){ return a.symbol < b.symbol ? -1 : 1; });
      if (q) pool = pool.filter(function(t){ return t.symbol.indexOf(q) >= 0; });
      $("scannerMeta").textContent = pool.length + " pairs · " + (state.dataMode ? (sourceLabel(state.dataMode) + " · Live") : "Live") + " · " + timeNow();
      if (!pool.length){ $("coinList").innerHTML = '<div class="empty">No coins match your search/filter.</div>'; return; }
      $("coinList").innerHTML = pool.slice(0, 120).map(function(t){
        var ch = parseFloat(t.priceChangePercent), f = state.funding[t.symbol];
        return '<button type="button" class="coinrow" data-sym="' + esc(t.symbol) + '"><span class="cs">' + esc(t.symbol.replace(/USDT$/, "")) + '<span style="color:var(--ink3); font-weight:600; font-size:.8rem;"> / USDT</span></span>'
          + '<span class="cp mono">$' + fmtP(parseFloat(t.lastPrice)) + '</span>'
          + '<span class="cc"><span class="pct-pill ' + (ch >= 0 ? "up" : "down") + '">' + fmtPct(ch) + '</span></span>'
          + '<span class="cv">Vol ' + fmtMoney(parseFloat(t.quoteVolume)) + '</span>'
          + '<span class="cf">' + (f !== undefined ? "Funding " + (f >= 0 ? "+" : "") + f.toFixed(4) + "%" : state.dataMode === "futures" ? "Funding —" : state.dataMode ? sourceLabel(state.dataMode) + " live" : "Spot mode") + "</span></button>";
      }).join("") + (pool.length > 120 ? '<p class="small muted" style="text-align:center; font-weight:600;">Showing top 120 — use search to find any other pair.</p>' : "");
      $("coinList").querySelectorAll(".coinrow").forEach(function(b){ b.addEventListener("click", function(){ openAnalysis(b.getAttribute("data-sym")); }); });
    }

    /* ================= Initial market load ================= */
    function loadMarket(){
      // Full fallback chain from scratch every call (Retry uses this too).
      // Trying-source status is shown via notifyTrying() inside getAllTickers().
      $("dashError").classList.remove("on");
      return getAllTickers().then(function(tickers){
        state.tickers = tickers; state.bySym = {};
        tickers.forEach(function(t){ state.bySym[t.symbol] = t; });
        return getFunding();
      }).then(function(f){
        state.funding = f;
        $("dashError").classList.remove("on");
        renderOverview(); renderMovers(); renderPulse(); renderCoinList(); renderDiagSummary();
        return getKlines("BTCUSDT", "4h", 260).then(function(kl){
          if (kl && kl.length >= 20){
            var tr = trendOf(kl);
            state.btcCtx = { dir: tr.dir, label: tr.dir === "long" ? "Bullish" : tr.dir === "short" ? "Bearish" : "Sideways" };
          }
          renderOverview(); renderPulse();
        }).catch(function(){});
      }).catch(function(err){
        setLiveState("off");
        $("ovSrc").textContent = "Load Failed";
        $("ovUpdated").textContent = "Live data could not be loaded — tap Retry below";
        var errs = (err && err.sourceErrors) ? err.sourceErrors : state.lastSourceErrors;
        $("dashErrorTxt").textContent = "Live market data could not be loaded from any source (" + (err && err.message ? err.message : "network error") + "). The app tried 8 direct sources (Binance Futures, CoinGecko, Binance Vision, CoinPaprika, OKX, Bitget, Gate.io, Bybit) plus public relays — all failed in this browser. No prices are shown rather than fake ones. If the Binance app works but this page cannot load, the in-app browser is blocking the page's connections: try opening this page in Chrome (⋯ menu), turn off Private DNS / VPN / ad-blocker, or switch between WiFi and mobile data. Settings → Diagnostics shows exactly which sources fail. Per-source results:";
        var sr = $("dashSourceResults"); if (sr) sr.innerHTML = sourceResultsHTML(errs);
        // Also mirror into Settings diagnostics so the user can see it there
        if (errs && errs.length){
          state.diagResults = errs.map(function(x){ return { label: x.source, key: x.key, ok: false, status: null, error: x.error }; });
          var db = $("diagResults"); if (db) db.innerHTML = diagResultsHTML(state.diagResults);
        }
        $("dashError").classList.add("on");
        $("coinList").innerHTML = '<div class="empty">Live prices failed to load from all sources. Use Retry on the Dashboard, or check Settings → Diagnostics to see which source is blocked.</div>';
        renderDiagSummary();
      });
    }

    /* ================= Setup builder (shared) ================= */
    function tpMultiples(){ return settings.mode === "aggressive" ? [1, 2, 3] : [1.5, 2.5, 3.5]; }
    function buildSetup(price, isLong, atr, swingLow, swingHigh, qVol){
      var dist;
      if (isLong) dist = clamp(price - (swingLow - 0.15 * atr), Math.max(0.9 * atr, price * 0.004), 3.2 * atr);
      else dist = clamp((swingHigh + 0.15 * atr) - price, Math.max(0.9 * atr, price * 0.004), 3.2 * atr);
      var sl = isLong ? price - dist : price + dist;
      var mult = tpMultiples();
      var tps = mult.map(function(m){ return isLong ? price + m * dist : price - m * dist; });
      var wall = isLong ? swingHigh : swingLow, capped = false;
      // Cap TP1/TP2 at the nearest wall if the wall is closer (keeps targets realistic)
      for (var i = 0; i < 2; i++){
        if (isLong && wall > price && tps[i] > wall){ var adj = wall - 0.1 * atr; if (adj > price + 0.45 * dist){ tps[i] = adj; capped = true; } }
        if (!isLong && wall < price && tps[i] < wall){ var adj2 = wall + 0.1 * atr; if (adj2 < price - 0.45 * dist){ tps[i] = adj2; capped = true; } }
      }
      var rr = tps.map(function(tp){ return Math.abs(tp - price) / dist; });
      var slPct = dist / price * 100;
      var lev = slPct <= 1 ? 10 : slPct <= 1.8 ? 7 : slPct <= 2.8 ? 5 : slPct <= 4.5 ? 3 : 2;
      if (qVol < 15e6) lev = Math.min(lev, 5);
      lev = Math.max(1, Math.min(lev, settings.levLimit));
      var risk = riskUsd();
      var posSize = risk / (dist / price);
      return { sl: sl, dist: dist, slPct: slPct, tps: tps, tpR: rr, lev: lev, riskUsd: risk,
        posSize: posSize, qty: posSize / price, margin: posSize / lev, capped: capped,
        entryLow: isLong ? price - 0.25 * atr : price - 0.10 * atr, entryHigh: isLong ? price + 0.10 * atr : price + 0.25 * atr };
    }

    /* ================= Deep scan engine ================= */
    function rsiScore(rsi, dir){
      if (dir === "long"){ if (rsi >= 50 && rsi <= 68) return 12; if (rsi > 68 && rsi <= 75) return 4; if (rsi > 75) return -8; if (rsi >= 42) return 6; if (rsi >= 30) return 2; return -2; }
      if (rsi <= 50 && rsi >= 32) return 12; if (rsi < 32 && rsi >= 25) return 4; if (rsi < 25) return -8; if (rsi <= 58) return 6; if (rsi <= 70) return 2; return -2;
    }
    function analyzeCandidate(t, btcDir){
      var symbol = t.symbol;
      return Promise.all([
        getKlines(symbol, "15m", 120), getKlines(symbol, "1h", 260), getKlines(symbol, "4h", 260),
        getOIHist(symbol), getRatio("globalLongShortAccountRatio", symbol)
      ]).then(function(res){
        var kl15 = res[0], kl1 = res[1], kl4 = res[2], oi = res[3], lsRatio = res[4];
        if (kl1.length < 210 || kl4.length < 60) throw new Error("insufficient data");
        var price = parseFloat(t.lastPrice), change = parseFloat(t.priceChangePercent), qVol = parseFloat(t.quoteVolume);
        var closes1 = kl1.map(function(k){ return k.c; }), closes4 = kl4.map(function(k){ return k.c; });
        var atr = atrCalc(kl1, 14), atrPct = atr / price * 100;
        var tr15 = trendOf(kl15), tr1 = trendOf(kl1), tr4 = trendOf(kl4);
        var rsi1 = rsiCalc(closes1, 14), rsi4 = rsiCalc(closes4, 14);
        var mc = macdCalc(closes1);
        var vols = kl1.map(function(k){ return k.qv; }), avgVol = 0, i;
        for (i = vols.length - 21; i < vols.length - 1; i++) avgVol += vols[i]; avgVol /= 20;
        var volRatio = avgVol > 0 ? vols[vols.length - 2] / avgVol : 1;
        var volDir = kl1[kl1.length - 2].c >= kl1[kl1.length - 2].o ? "long" : "short";
        var sw = swings(kl1.slice(-60), 3);
        var swingLow = sw.lows.length ? sw.lows[sw.lows.length - 1].v : Math.min.apply(null, kl1.slice(-30).map(function(k){ return k.l; }));
        var swingHigh = sw.highs.length ? sw.highs[sw.highs.length - 1].v : Math.max.apply(null, kl1.slice(-30).map(function(k){ return k.h; }));
        var distRes = (swingHigh - price) / atr, distSup = (price - swingLow) / atr;
        var funding = (state.funding[symbol] === undefined) ? null : state.funding[symbol];

        var L = 0, S = 0;
        [[tr1, 20], [tr4, 16], [tr15, 10]].forEach(function(pair){
          var tr = pair[0], w = pair[1];
          if (tr.dir === "long") L += tr.strong ? w : w * 0.55;
          if (tr.dir === "short") S += tr.strong ? w : w * 0.55;
        });
        if (mc.hist > 0){ L += 9; if (mc.hist > mc.prev) L += 3; }
        if (mc.hist < 0){ S += 9; if (mc.hist < mc.prev) S += 3; }
        L += (rsiScore(rsi1, "long") + rsiScore(rsi4, "long")) / 2;
        S += (rsiScore(rsi1, "short") + rsiScore(rsi4, "short")) / 2;
        if (volRatio >= 1.4){ if (volDir === "long") L += 10; else S += 10; }
        else if (volRatio >= 1.05){ if (volDir === "long") L += 5; else S += 5; }
        else if (volRatio < 0.65){ L -= 3; S -= 3; }
        if (change > 0){ L += Math.min(change, 18) * 0.4; if (change > 30) L -= 8; }
        if (change < 0){ S += Math.min(-change, 18) * 0.4; if (change < -30) S -= 8; }
        if (distRes > 1.2) L += 7; else if (distRes <= 0.6) L -= 8;
        if (distSup > 1.2) S += 7; else if (distSup <= 0.6) S -= 8;
        if (symbol !== "BTCUSDT"){ if (btcDir === "up"){ L += 6; S -= 6; } if (btcDir === "down"){ S += 6; L -= 6; } }
        if (funding !== null){
          if (funding <= 0.01) L += 3; if (funding > 0.05) L -= 8; if (funding < -0.03) L += 6;
          if (funding >= -0.01) S += 3; if (funding < -0.05) S -= 8; if (funding > 0.03) S += 6;
        }
        if (oi){ if (oi.change4h > 0.5 && change > 0) L += 6; if (oi.change4h > 0.5 && change < 0) S += 6; if (oi.change4h < -1){ L -= 3; S -= 3; } }
        if (lsRatio !== null){ if (lsRatio > 2.2) L -= 5; if (lsRatio < 0.45) S -= 5; }
        L = Math.round(clamp(L, 0, 100)); S = Math.round(clamp(S, 0, 100));

        var isLong = L >= S, dir = isLong ? "LONG" : "SHORT";
        var setup = buildSetup(price, isLong, atr, swingLow, swingHigh, qVol);
        function passTrend(tr){ return tr.dir === (isLong ? "long" : "short"); }
        var checks = [];
        function chk(label, status, detail){ checks.push({ label: label, status: status, detail: detail }); }
        var tfAligned = [tr15, tr1, tr4].filter(passTrend).length;
        chk("Multi-Timeframe Trend (EMA 20/50/200)", tfAligned >= 2 ? "pass" : "fail",
          "15m: " + tr15.dir + " · 1H: " + tr1.dir + " · 4H: " + tr4.dir + (tr1.e200 ? " · Price vs EMA200 (1H): " + (price > tr1.e200 ? "above" : "below") : ""));
        var rsiOk = isLong ? (rsi1 >= 42 && rsi1 <= 72 && rsi4 <= 75) : (rsi1 >= 28 && rsi1 <= 58 && rsi4 >= 25);
        chk("RSI (1H & 4H)", rsiOk ? "pass" : "fail", "RSI 1H " + rsi1.toFixed(0) + " · RSI 4H " + rsi4.toFixed(0) + (rsi1 > 75 ? " — overbought, chasing is risky" : rsi1 < 25 ? " — oversold, shorting here is risky" : ""));
        chk("MACD (1H)", (isLong ? mc.hist > 0 : mc.hist < 0) ? "pass" : "fail", "MACD histogram is " + (mc.hist > 0 ? "positive (bullish momentum)" : "negative (bearish momentum)") + (Math.abs(mc.hist) > Math.abs(mc.prev) ? " and expanding" : " and shrinking"));
        chk("Volume vs Average", volRatio >= 1.05 && volDir === (isLong ? "long" : "short") ? "pass" : "fail", "Last completed 1H volume is " + volRatio.toFixed(2) + "x the 20-candle average");
        var room = isLong ? distRes : distSup;
        chk("Support / Resistance Room", room > 0.8 ? "pass" : "fail", (isLong ? "Resistance" : "Support") + " at $" + fmtP(isLong ? swingHigh : swingLow) + " is " + room.toFixed(1) + "x ATR away · Support $" + fmtP(swingLow) + " · Resistance $" + fmtP(swingHigh));
        chk("ATR / Volatility", (atrPct >= 0.3 && atrPct <= 5.5) ? "pass" : "fail", "ATR(14) on 1H = $" + fmtP(atr) + " (" + atrPct.toFixed(2) + "% of price) — " + (atrPct < 0.3 ? "too quiet, moves may not reach targets" : atrPct > 5.5 ? "extremely volatile, liquidation risk high" : "healthy range for trading"));
        if (funding === null) chk("Funding Rate", "na", state.dataMode === "spot" ? "Spot data mode — futures funding unavailable (check it in the Binance app before entering)" : "Funding data unavailable for this pair");
        else { var crowded = isLong ? funding > 0.05 : funding < -0.05; chk("Funding Rate", crowded ? "fail" : "pass", "Funding is " + (funding >= 0 ? "+" : "") + funding.toFixed(4) + "% — " + (crowded ? "this side is crowded, squeeze risk" : "no dangerous crowding")); }
        if (!oi) chk("Open Interest Change", "na", state.dataMode === "spot" ? "Spot data mode — open interest is a futures metric" : "Open interest history unavailable");
        else { var oiOk = oi.change4h > 0.5 && (isLong ? change > 0 : change < 0); chk("Open Interest Change", oiOk ? "pass" : oi.change4h < -1 ? "fail" : "na", "OI is " + fmtMoney(oi.value) + ", " + fmtPct(oi.change4h) + " in ~4h — " + (oiOk ? "new money is confirming the move" : oi.change4h < -1 ? "positions are closing, move is weakening" : "no strong OI confirmation")); }
        if (lsRatio === null) chk("Long / Short Ratio", "na", state.dataMode === "spot" ? "Spot data mode — futures ratios unavailable" : "Ratio data unavailable");
        else { var lsBad = isLong ? lsRatio > 2.2 : lsRatio < 0.45; chk("Long / Short Ratio", lsBad ? "fail" : "pass", "Global accounts long/short ratio is " + lsRatio.toFixed(2) + (lsBad ? " — retail is heavily crowded on this side" : " — positioning is not extreme")); }
        if (symbol === "BTCUSDT") chk("BTC Trend & Dominance", "na", "This is BTC itself — it sets the market direction");
        else { var btcOk = btcDir === "flat" || (isLong && btcDir === "up") || (!isLong && btcDir === "down"); chk("BTC Trend & Dominance", btcOk ? "pass" : "fail", "BTC 4H trend is " + (btcDir === "up" ? "up" : btcDir === "down" ? "down" : "sideways") + (state.cgGlobal ? " · BTC dominance " + state.cgGlobal.dom.toFixed(1) + "%" : "")); }
        var poolDist = isLong ? distSup : distRes;
        chk("Liquidity / Liquidation Pools", poolDist > 0.5 ? "pass" : "fail", "Nearest liquidity pool " + (isLong ? "below (sell-side, $" + fmtP(swingLow) + ")" : "above (buy-side, $" + fmtP(swingHigh) + ")") + " is " + poolDist.toFixed(1) + "x ATR from price" + (poolDist <= 0.5 ? " — a stop-hunt wick into the pool is likely before any move" : ""));
        chk("Risk : Reward", setup.tpR[1] >= 1.8 ? "pass" : "fail", "TP2 gives R:R of 1 : " + setup.tpR[1].toFixed(1) + (setup.capped ? " (targets capped by the nearest wall)" : "") + " · TP1 1 : " + setup.tpR[0].toFixed(1) + " · TP3 1 : " + setup.tpR[2].toFixed(1));

        var applicable = checks.filter(function(c){ return c.status !== "na"; }).length;
        var passes = checks.filter(function(c){ return c.status === "pass"; }).length;
        var score = isLong ? L : S;
        var conf = Math.round(clamp(0.55 * score + 0.45 * (applicable ? passes / applicable * 100 : 0), 0, 100));
        var cfg = modeCfg();
        var tradeable = passes >= 7 && conf >= cfg.minConf && Math.abs(L - S) >= 12;
        var failReasons = checks.filter(function(c){ return c.status === "fail"; }).map(function(c){ return c.label; });
        return { symbol: symbol, base: symbol.replace(/USDT$/, ""), price: price, change: change, qVol: qVol,
          longScore: L, shortScore: S, dir: dir, conf: conf, tradeable: tradeable, passes: passes, applicable: applicable,
          checks: checks, setup: setup, kl1: kl1, failReasons: failReasons,
          support: swingLow, resistance: swingHigh, rsi1: rsi1, volRatio: volRatio };
      });
    }

    /* ================= Signal rendering ================= */
    function confColor(c){ return c >= 75 ? "var(--long)" : c >= 60 ? "var(--gold)" : "var(--ink3)"; }
    function badgeFor(r){ return r.tradeable ? (r.dir === "LONG" ? "long" : "short") : "wait"; }
    function badgeText(r){ return r.tradeable ? (r.dir === "LONG" ? "▲ LONG" : "▼ SHORT") : "NO TRADE"; }
    function levelsHTML(r){
      var s = r.setup;
      function tpCell(n, tp, rr){ return '<div class="lvl tp"><div class="k">Target ' + n + ' · 1:' + rr.toFixed(1) + '</div><div class="v mono">$' + fmtP(tp) + '</div><div class="s">Profit if hit ≈ +$' + (s.riskUsd * rr).toFixed(2) + "</div></div>"; }
      return '<div class="levels">'
        + '<div class="lvl"><div class="k">Entry Zone</div><div class="v mono">$' + fmtP(s.entryLow) + " – $" + fmtP(s.entryHigh) + '</div><div class="s">Enter only inside this zone — do not chase</div></div>'
        + '<div class="lvl sl"><div class="k">Stop Loss</div><div class="v mono">$' + fmtP(s.sl) + '</div><div class="s">' + s.slPct.toFixed(2) + '% away · Max loss −$' + s.riskUsd.toFixed(2) + "</div></div>"
        + tpCell(1, s.tps[0], s.tpR[0]) + tpCell(2, s.tps[1], s.tpR[1]) + tpCell(3, s.tps[2], s.tpR[2])
        + '<div class="lvl"><div class="k">Leverage (suggested)</div><div class="v mono">' + s.lev + 'x</div><div class="s">Your limit: ' + settings.levLimit + "x (" + modeCfg().label + " mode)</div></div>"
        + '<div class="lvl"><div class="k">Position Size</div><div class="v mono">$' + s.posSize.toFixed(0) + ' USDT</div><div class="s">Qty ≈ ' + (s.qty >= 100 ? s.qty.toFixed(0) : s.qty >= 1 ? s.qty.toFixed(2) : s.qty.toFixed(4)) + " " + esc(r.base) + "</div></div>"
        + '<div class="lvl"><div class="k">Margin Needed</div><div class="v mono">$' + s.margin.toFixed(2) + '</div><div class="s">Capital $' + settings.capital + " · Risk " + settings.riskPct + "% = $" + s.riskUsd.toFixed(2) + "</div></div>"
        + '<div class="lvl"><div class="k">Confirmations</div><div class="v mono">' + r.passes + " / " + r.applicable + '</div><div class="s">Weighted framework parts passed · Need ' + modeCfg().minConf + '%+ and top priorities in agreement</div></div>'
        + "</div>";
    }
    function checksHTML(checks){
      var h = '<div class="checks"><h3>Confirmation Checklist — how this signal was calculated</h3><ul>';
      checks.forEach(function(c){
        var ic = c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "–";
        h += '<li><span class="ic ' + c.status + '">' + ic + '</span><span><b>' + esc(c.label) + '</b><span class="d">' + esc(c.detail) + "</span></span></li>";
      });
      return h + "</ul></div>";
    }
