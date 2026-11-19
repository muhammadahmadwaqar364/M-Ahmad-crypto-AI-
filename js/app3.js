    function partSummary(r, needle, fallback){
      var p = findPart(r, needle);
      if (!p) return fallback;
      return (p.status === "pass" ? "Good for this trade. " : p.status === "fail" ? "Against this trade. " : "Neutral. ") + p.detail;
    }
    function renderPlainSections(r){
      var ctx = r.ctx || {};
      var s = r.setup;
      function sec(title, summary, body){
        return '<details class="plain-sec"><summary><b>' + title + '</b><div class="sum-line">' + esc(summary) + '</div></summary><div style="padding:0 16px 14px;" class="small muted">' + body + '</div></details>';
      }
      var trendSum = partSummary(r, "market structure", "Trend is mixed.");
      var mtfSum = partSummary(r, "multi-timeframe", "Timeframes are mixed.");
      var indBody = "RSI, MACD, EMA 20 / 50 / 200, VWAP, Bollinger Bands and ATR are checked together. " + partSummary(r, "momentum indicators", "") + " " + partSummary(r, "moving averages", "") + " " + partSummary(r, "vwap", "");
      var srSum = partSummary(r, "support & resistance", "Support $" + fmtP(r.support) + " · Resistance $" + fmtP(r.resistance));
      var volSum = partSummary(r, "volume analysis", "Volume vs average: " + (r.volRatio ? r.volRatio.toFixed(2)+"x" : "—"));
      var whaleSum = partSummary(r, "whale", "No extreme whale signal.");
      var oiSum = partSummary(r, "open interest", "") + " " + partSummary(r, "funding rate", "");
      var obSum = partSummary(r, "order book", "Order book checked for walls and spread.");
      var liqSum = partSummary(r, "liquidation", "") + " " + partSummary(r, "liquidity analysis", "");
      var smcSum = partSummary(r, "smart money", "BOS / CHOCH / FVG checked.");
      var btcSum = partSummary(r, "btc & overall", "BTC sets the market direction for altcoins.");
      var newsSum = partSummary(r, "news & events", "No verified live headline — nothing invented.") + " " + partSummary(r, "fundamental", "");
      var volaSum = partSummary(r, "volatility", "Volatility checked with ATR.");
      var setupBody = '<div class="setup-huge">'
        + '<div class="setup-cell"><div class="k">Entry</div><div class="v mono">$' + fmtP((s.entryLow+s.entryHigh)/2) + '</div><div class="small muted">Zone $' + fmtP(s.entryLow) + ' – $' + fmtP(s.entryHigh) + '</div></div>'
        + '<div class="setup-cell"><div class="k">Stop Loss</div><div class="v mono" style="color:var(--short);">$' + fmtP(s.sl) + '</div><div class="small muted">' + s.slPct.toFixed(2) + '% away · Max loss $' + s.riskUsd.toFixed(2) + '</div></div>'
        + '<div class="setup-cell"><div class="k">TP1</div><div class="v mono" style="color:var(--long);">$' + fmtP(s.tps[0]) + '</div><div class="small muted">1:' + s.tpR[0].toFixed(1) + ' · +$' + (s.riskUsd*s.tpR[0]).toFixed(2) + '</div></div>'
        + '<div class="setup-cell"><div class="k">TP2</div><div class="v mono" style="color:var(--long);">$' + fmtP(s.tps[1]) + '</div><div class="small muted">1:' + s.tpR[1].toFixed(1) + ' · +$' + (s.riskUsd*s.tpR[1]).toFixed(2) + '</div></div>'
        + '<div class="setup-cell"><div class="k">TP3</div><div class="v mono" style="color:var(--long);">$' + fmtP(s.tps[2]) + '</div><div class="small muted">1:' + s.tpR[2].toFixed(1) + ' · +$' + (s.riskUsd*s.tpR[2]).toFixed(2) + '</div></div>'
        + '<div class="setup-cell"><div class="k">Risk : Reward · Size · Leverage</div><div class="v mono">1:' + s.tpR[1].toFixed(1) + '</div><div class="small muted">Position $' + s.posSize.toFixed(0) + ' · Margin $' + s.margin.toFixed(2) + ' · ' + s.lev + 'x for $' + settings.capital + ' capital</div></div></div>'
        + '<p style="margin-top:10px;">' + esc(r.framework ? r.framework.invalidation : "") + '</p>';
      var h = '<div class="sec-head"><h2>Trade Setup — Big Numbers</h2><span class="meta">For $' + settings.capital + ' capital</span></div><div class="card" style="margin-bottom:14px;">' + setupBody + '</div>';
      h += '<div class="sec-head"><h2>Full Analysis — Tap to Open Each Part</h2><span class="meta">Summary is always visible</span></div>';
      h += sec("Market Trend", trendSum, "Direction comes from market structure (higher highs / lower lows), EMA alignment and ADX strength. " + esc(trendSum));
      h += sec("Multi-Timeframe (5m / 15m / 1H / 4H / 1D)", mtfSum, "All five timeframes are compared. The trade is stronger when most timeframes point the same way. " + esc(mtfSum));
      h += sec("Indicators — RSI / MACD / EMA 20·50·200 / VWAP / Bollinger / ATR", indBody, "See the chart stats above for live values. Overbought RSI (above 70) or price far outside Bollinger Bands means chasing is risky.");
      h += sec("Support & Resistance", srSum, "Support is where buyers stepped in before; resistance is where sellers pushed price down. Targets are capped at the nearest wall so they stay realistic.");
      h += sec("Volume", volSum, "Volume confirms a move. A breakout on low volume often fails; rising volume in the trade direction is a green flag.");
      h += sec("Smart Money & Whales", whaleSum, "Large order-book walls and top-trader positioning are used as the live whale proxy. On-chain wallet flows have no verified free live source, so they are never guessed.");
      h += sec("Open Interest & Funding", oiSum, "Open Interest shows if new money is entering. Funding shows if one side is crowded — crowded sides can squeeze hard the other way.");
      h += sec("Order Book", obSum, "Bid/ask depth within 1%, the biggest buy and sell walls, and the spread are checked so thin books and wide spreads are flagged before you enter.");
      h += sec("Liquidity & Liquidation", liqSum, "Price often visits liquidity pools (clusters of stop losses) before moving. If a pool is very close, expect a wick first.");
      h += sec("SMC — Smart Money Concepts", smcSum, "BOS (break of structure), CHOCH (change of character), order blocks, Fair Value Gaps and Premium / Discount zones are checked on the swing range.");
      h += sec("BTC & Market", btcSum, "Most altcoins follow Bitcoin. Trading against a strong BTC trend lowers the odds, even when the coin itself looks good.");
      h += sec("News & Fundamentals", newsSum, "Market cap, rank and supply come from CoinGecko when available. No headline is shown without a verified live source.");
      h += sec("Volatility", volaSum, "ATR and historical volatility size the stop loss. Too quiet means targets may not be reached; too wild means liquidation risk is high.");
      return h;
    }

    /* ================= Analysis page ================= */
    function switchPage(name){
      document.querySelectorAll(".page").forEach(function(p){ p.classList.toggle("active", p.id === "page-" + name); });
      document.querySelectorAll(".bottomnav button").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-page") === name ? "true" : "false"); });
      window.scrollTo({ top: 0 });
    }
    function openAnalysis(symbol){
      if (!symbol) return;
      symbol = symbol.toUpperCase().trim();
      if (!/USDT$/.test(symbol)) symbol += "USDT";
      state.anSymbol = symbol;
      var anIn = $("anSymbol"); if (anIn) anIn.value = symbol;
      var hc = $("homeCoinInput"); if (hc) hc.value = symbol.replace(/USDT$/,"");
      switchPage("dashboard");
      runAnalysis(symbol);
      setTimeout(function(){ var el = $("homeAnalysisAnchor"); if (el) el.scrollIntoView({behavior:"smooth", block:"start"}); }, 60);
    }
    function tfKlines(ctx, tf){
      return tf === "5m" ? ctx.kl5 : tf === "15m" ? ctx.kl15 : tf === "4h" ? ctx.kl4 : tf === "1d" ? ctx.kl1d : ctx.kl1;
    }
    function analysisChart(ctx, tf){
      var kl = tfKlines(ctx, tf); if (!kl || kl.length < 30) return '<p class="muted" style="font-weight:700;">Chart unavailable — price data live</p><p class="muted small">Not enough candle data for this timeframe from any source.</p>';
      var view = kl.slice(-70), closes = view.map(function(k){ return k.c; });
      var allCloses = kl.map(function(k){ return k.c; });
      var e20 = emaArr(allCloses, 20).slice(-70), e50 = emaArr(allCloses, 50).slice(-70);
      var bbAll = [], i;
      for (i = 0; i < allCloses.length; i++){ if (i >= 19){ var w = allCloses.slice(i - 19, i + 1), m = w.reduce(function(a, b){ return a + b; }, 0) / 20, sd = stdev(w); bbAll.push({ up: m + 2 * sd, dn: m - 2 * sd }); } else bbAll.push(null); }
      var bbv = bbAll.slice(-70);
      var vals = closes.concat(e20, e50);
      bbv.forEach(function(b){ if (b){ vals.push(b.up); vals.push(b.dn); } });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.07 || 1; lo -= pad; hi += pad;
      var W = 660, H = 240;
      function Y(v){ return (H - 12 - ((v - lo) / (hi - lo)) * (H - 24)).toFixed(1); }
      function X(j){ return (4 + (j / (view.length - 1)) * (W - 8)).toFixed(1); }
      function line(arr, color, wdt){ return '<polyline points="' + arr.map(function(v, j){ return X(j) + "," + Y(v); }).join(" ") + '" fill="none" style="stroke:' + color + '" stroke-width="' + wdt + '" stroke-linejoin="round"/>'; }
      var bandPath = "";
      var upPts = [], dnPts = [];
      bbv.forEach(function(b, j){ if (b){ upPts.push(X(j) + "," + Y(b.up)); dnPts.unshift(X(j) + "," + Y(b.dn)); } });
      if (upPts.length) bandPath = '<polygon points="' + upPts.concat(dnPts).join(" ") + '" style="fill:var(--ink3)" opacity="0.13"/>';
      var rsi = rsiCalc(allCloses, 14), mc = macdCalc(allCloses), atr = atrCalc(kl, 14);
      var vw = vwapCalc(kl.slice(-24)), bbNow = bollCalc(allCloses, 20, 2);
      var e200 = allCloses.length >= 200 ? emaLast(allCloses, 200) : null;
      var stats = '<table class="itable" style="margin-top:6px;">'
        + '<tr><td class="ik">RSI (14)</td><td class="iv mono">' + rsi.toFixed(1) + '<span class="id">' + (rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral zone") + "</span></td>"
        + '<td class="ik">MACD</td><td class="iv mono">' + (mc.hist > 0 ? "+" : "") + mc.hist.toPrecision(3) + '<span class="id">Histogram ' + (mc.hist > mc.prev ? "expanding" : "shrinking") + "</span></td></tr>"
        + '<tr><td class="ik">EMA 20 / 50</td><td class="iv mono">$' + fmtP(emaLast(allCloses, 20)) + " / $" + fmtP(emaLast(allCloses, 50)) + '<span class="id">Price is ' + (closes[closes.length-1] > emaLast(allCloses, 20) ? "above" : "below") + ' EMA 20</span></td>'
        + '<td class="ik">EMA 200</td><td class="iv mono">' + (e200 ? "$" + fmtP(e200) : "—") + '<span class="id">' + (e200 ? (closes[closes.length-1] > e200 ? "Above = long-term uptrend" : "Below = long-term downtrend") : "Needs 200 candles") + "</span></td></tr>"
        + '<tr><td class="ik">VWAP (24 periods)</td><td class="iv mono">' + (vw ? "$" + fmtP(vw) : "—") + '<span class="id">' + (vw ? (closes[closes.length-1] > vw ? "Price above VWAP" : "Price below VWAP") : "") + "</span></td>"
        + '<td class="ik">ATR / Bollinger %B</td><td class="iv mono">$' + fmtP(atr) + " · " + (bbNow ? bbNow.pctB.toFixed(2) : "—") + '<span class="id">Volatility per candle · %B &gt; 1 or &lt; 0 = outside the bands</span></td></tr></table>';
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Price chart with EMA and Bollinger Bands">' + bandPath + line(closes, "var(--ink)", 2.2) + line(e20, "var(--accent)", 1.6) + line(e50, "var(--gold)", 1.6) + "</svg>" + stats;
    }
    function groupSections(r){
      var order = [], map = {};
      r.checks.forEach(function(p){
        if (!map[p.group]){ map[p.group] = []; order.push(p.group); }
        map[p.group].push(p);
      });
      return order.map(function(g, gi){
        var items = map[g];
        var gp = items.filter(function(x){ return x.status === "pass"; }).length;
        var gf = items.filter(function(x){ return x.status === "fail"; }).length;
        var ga = items.filter(function(x){ return x.status !== "na"; }).length;
        var rows = items.map(function(p){
          var chip = p.status === "pass" ? '<span class="mini-badge long">PASS</span>' : p.status === "fail" ? '<span class="mini-badge short">FAIL</span>' : '<span class="mini-badge wait">NEUTRAL</span>';
          return '<li><span style="flex:1;"><b>' + esc(p.label) + '</b><span class="d">' + esc(p.detail) + "</span></span>" + chip + "</li>";
        }).join("");
        return '<details class="card" style="margin-bottom:11px; padding:0; overflow:hidden;"' + (gi < 3 ? " open" : "") + '>'
          + '<summary style="padding:14px 16px; cursor:pointer; font-weight:800; list-style:none; display:flex; justify-content:space-between; gap:10px; align-items:center;">' + esc(g) + '<span class="mini-badge ' + (gf > gp ? "short" : gp > 0 ? "long" : "wait") + '">' + gp + " pass · " + gf + " fail" + (ga < items.length ? " · " + (items.length - ga) + " neutral" : "") + "</span></summary>"
          + '<div class="checks" style="padding-top:0;"><ul>' + rows + "</ul></div></details>";
      }).join("");
    }
    function finalSetupCard(r){
      var s = r.setup, f = r.framework;
      var decision = r.tradeable ? '<span class="badge ' + (r.dir === "LONG" ? "long" : "short") + '">' + (r.dir === "LONG" ? "▲ LONG" : "▼ SHORT") + "</span>" : '<span class="badge wait">NO TRADE</span>';
      var reasonsFor = f.agree.length ? f.agree.join(" · ") : "—";
      var reasonsAgainst = (f.disagree.concat(f.conflicts)).join(" · ") || "—";
      return '<div class="sig"><div class="sig-top"><div><div class="sym" style="font-size:1.3rem;">Final Trade Setup &amp; Risk Management</div><div class="small muted" style="font-weight:600;">Section 14 · Decision from the weighted framework above</div></div>' + decision + "</div>"
        + levelsHTML(r)
        + '<div class="checks"><ul>'
        + '<li><span class="ic pass">i</span><span><b>Signal Expiry</b><span class="d">Valid until the next 1H candle close, or until price leaves the entry zone — whichever comes first. After that, re-analyze.</span></span></li>'
        + '<li><span class="ic fail">!</span><span><b>Trade Invalidation</b><span class="d">' + esc(f.invalidation) + "</span></span></li>"
        + '<li><span class="ic pass">✓</span><span><b>Reasons Supporting the Trade</b><span class="d">' + esc(reasonsFor) + "</span></span></li>"
        + '<li><span class="ic fail">✕</span><span><b>Reasons Against the Trade</b><span class="d">' + esc(reasonsAgainst) + "</span></span></li>"
        + "</ul></div>"
        + (r.tradeable ? '<div class="sig-actions"><button type="button" class="btn primary" id="anCopyBtn">Copy Setup</button></div>' : "")
        + "</div>";
    }
    var anRunning = false;
    async function runAnalysis(symbol){
      if (anRunning) return;
      anRunning = true;
      $("anError").classList.remove("on");
      $("anHead").innerHTML = '<div class="empty">Analyzing ' + esc(symbol) + " — fetching klines (5m–1D), order book, open interest, ratios and market context from live sources…</div>";
      $("anSections").innerHTML = "";
      try {
        var t = state.bySym[symbol];
        if (!t){
          try {
            var single = await fetchJSON(SAPI + "/ticker/24hr?symbol=" + encodeURIComponent(symbol), 6000);
            if (!single || !single.lastPrice) throw new Error("not found");
            t = single;
          } catch (eSingle) {
            var altT = null;
            try {
              var okx1 = await fetchJSON("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(symbol.replace(/USDT$/, "") + "-USDT-SWAP"), 6000);
              if (okx1 && okx1.data && okx1.data.length && parseFloat(okx1.data[0].last) > 0){
                var o1 = okx1.data[0], op1 = parseFloat(o1.open24h);
                altT = { symbol: symbol, lastPrice: o1.last, priceChangePercent: String(op1 ? (parseFloat(o1.last) - op1) / op1 * 100 : 0), quoteVolume: String(parseFloat(o1.volCcy24h || 0) * parseFloat(o1.last)), highPrice: o1.high24h, lowPrice: o1.low24h };
              }
            } catch (eOkx) {}
            if (!altT){
              try {
                var rl = await fetchProxiedJSON(SAPI + "/ticker/24hr?symbol=" + encodeURIComponent(symbol), 9000);
                if (rl && rl.lastPrice) altT = rl;
              } catch (eRelay) {}
            }
            if (altT) t = altT;
            else {
              var cgHit = state.cgMarkets[symbol];
              if (cgHit && cgHit.current_price) t = { symbol: symbol, lastPrice: String(cgHit.current_price), priceChangePercent: String(cgHit.price_change_percentage_24h || 0), quoteVolume: String(cgHit.total_volume || 0), highPrice: String(cgHit.high_24h || cgHit.current_price), lowPrice: String(cgHit.low_24h || cgHit.current_price) };
              else throw new Error("Pair not found on any live source");
            }
          }
        }
        var ctx = await gatherContext(symbol, t, true);
        var r = buildFramework(ctx);
        state.analysis = { ctx: ctx, r: r };
        var srcTxt = state.dataMode === "futures" ? "Binance USDT-M Futures API (live)" : state.dataMode === "coingecko" ? "CoinGecko · Live (klines via CoinGecko market_chart / Binance Vision — futures-only metrics marked Neutral)" : state.dataMode ? sourceLabel(state.dataMode) + " · Live (candles via the same exchange / Binance Vision / relay — futures-only metrics marked Neutral when unavailable)" : "Binance Vision Spot API (live fallback — futures-only metrics marked Neutral)";
        $("anHead").innerHTML = '<div class="card"><div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">'
          + '<div><div class="sym">' + esc(r.base) + '<small> / USDT</small></div><div class="mono" style="font-weight:700; font-size:1.1rem;">$' + fmtP(r.price) + ' <span class="' + (r.change >= 0 ? "up" : "down") + '">' + fmtPct(r.change) + " · 24h</span></div>"
          + '<div class="small muted" style="font-weight:600; margin-top:3px;">24h volume ' + fmtMoney(r.qVol) + " · Support $" + fmtP(r.support) + " · Resistance $" + fmtP(r.resistance) + "</div></div>"
          + '<div style="text-align:right;"><div class="small" style="color:var(--ink3); font-weight:800; letter-spacing:.06em;">WEIGHTED FRAMEWORK SCORE</div><div class="mono" style="font-size:2rem; font-weight:800; color:' + confColor(r.conf) + '">' + r.conf + '%</div>'
          + '<div class="small muted" style="font-weight:700;">Checklist: ' + r.passes + " pass / " + r.applicable + " decided · Decision: <b style='color:var(--ink);'>" + (r.tradeable ? r.dir : "NO TRADE") + "</b></div></div></div>"
          + '<p class="small" style="color:var(--ink3); font-weight:600; margin-top:10px;">Data source: ' + srcTxt + " · Market context: CoinGecko + alternative.me · Updated " + timeNow() + "</p></div>";
        $("anChart").innerHTML = analysisChart(ctx, state.anTf);
        renderDecisionHero(r);
        $("anSections").innerHTML = renderPlainSections(r)
          + '<div class="sec-head"><h2>Weighted 30-Part Checklist — Score Bars</h2><span class="meta">Priority order · tap a group</span></div>'
          + '<div class="card" style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><b>Overall Checklist Score</b><span class="mono" style="font-weight:800;">' + r.conf + ' / 100</span></div><div class="meter"><i style="width:' + r.conf + '%; background:' + confColor(r.conf) + '"></i></div><p class="small muted" style="margin-top:8px; font-weight:600;">Groups in priority order: 1 Market Structure &amp; Trend · 2 Liquidity &amp; Price Action · 3 Volume &amp; Order Flow · 4 OI &amp; Funding · 5 Multi-Timeframe · 6 Support/Resistance · 7 Whales · 8 BTC &amp; Market · 9 Momentum · 10 Risk/Reward. A trade needs top priorities agreeing — a high score alone is not enough.</p></div>'
          + groupSections(r)
          + '<div class="sec-head"><h2>Final Setup</h2></div>' + finalSetupCard(r);
        var cb = $("anCopyBtn");
        if (cb) cb.addEventListener("click", function(){ copySetup(r); });
      } catch (err) {
        var tFallback = state.bySym[symbol];
        if (tFallback && err && /insufficient candle|klines|chart/i.test(err.message || "")){
          // Klines failed on every source — still show live ticker price/change/volume
          $("anHead").innerHTML = '<div class="card"><div class="sym">' + esc(symbol.replace(/USDT$/, "")) + '<small> / USDT</small></div><div class="mono" style="font-weight:700; font-size:1.1rem;">$' + fmtP(parseFloat(tFallback.lastPrice)) + ' <span class="' + (parseFloat(tFallback.priceChangePercent) >= 0 ? "up" : "down") + '">' + fmtPct(parseFloat(tFallback.priceChangePercent)) + ' · 24h</span></div><div class="small muted" style="font-weight:600; margin-top:3px;">24h volume ' + fmtMoney(parseFloat(tFallback.quoteVolume)) + ' · Source: ' + esc(state.dataMode ? (sourceLabel(state.dataMode) + " · Live") : "Live") + '</div></div>';
          $("anChart").innerHTML = '<p class="muted" style="font-weight:700; padding:10px 2px;">Chart unavailable — price data live</p><p class="muted small">Candles could not be loaded from Binance Vision or CoinGecko for this coin right now, so indicators are not shown rather than invented. Price, 24h change and volume above are live. Try again in a moment.</p>';
          $("anSections").innerHTML = "";
        } else {
          $("anHead").innerHTML = "";
          $("anErrorTxt").textContent = "Analysis failed for " + symbol + " — " + (err && err.message ? err.message : "network error") + ". Check the symbol (USDT pairs only) and your connection. No data is shown rather than invented data.";
          $("anError").classList.add("on");
        }
      } finally { anRunning = false; }
    }

    /* ================= Settings & calculator ================= */
    function syncSettingsUI(){
      $("setCapital").value = settings.capital;
      $("setRisk").value = settings.riskPct;
      $("setLev").value = settings.levLimit;
      $("modeSafe").setAttribute("aria-pressed", settings.mode === "safe" ? "true" : "false");
      $("modeAgg").setAttribute("aria-pressed", settings.mode === "aggressive" ? "true" : "false");
      var cfg = modeCfg();
      var hsl = $("homeSetupLine"); if (hsl) hsl.textContent = "Capital $" + settings.capital + " · " + cfg.label + " mode · Risk " + settings.riskPct + "% ($" + riskUsd().toFixed(2) + ") per trade · Max " + settings.levLimit + "x · Target $" + cfg.target[0] + "–$" + cfg.target[1] + "/day";
      $("settingsNote").textContent = "Current setup: " + cfg.label + " mode · Capital $" + settings.capital + " · Risk " + settings.riskPct + "% = $" + riskUsd().toFixed(2) + " max loss per trade · Leverage capped at " + settings.levLimit + "x · Signals need " + cfg.minConf + "%+ weighted confidence with top priorities in agreement.";
      renderTracker();
      if (state.scanResults.length) renderSignals(); else {
        $("sigSummary").textContent = cfg.label + " mode · Capital $" + settings.capital + " · Risk " + settings.riskPct + "% ($" + riskUsd().toFixed(2) + ") per trade · Daily target $" + cfg.target[0] + "–$" + cfg.target[1] + " · Only " + cfg.minConf + "%+ confidence setups are presented (top 1–3).";
        $("modeSummary").textContent = "Current mode: " + cfg.label + " (risk " + settings.riskPct + "%/trade, min confidence " + cfg.minConf + "%). Change it in Settings.";
      }
    }
    function setMode(m){
      settings.mode = m;
      settings.riskPct = MODES[m].riskPct;
      settings.levLimit = MODES[m].levCap;
      syncSettingsUI();
      toast(m === "aggressive" ? "Aggressive mode ON — $10–$15/day target, 2.5% risk, max 3 trades/day. High risk: read the warning." : "Safe mode ON — $2–$6/day target, 1% risk per trade.");
    }
    var calcDir = "LONG";
    function renderCalc(){
      var entry = parseFloat($("calcEntry").value), sl = parseFloat($("calcSL").value);
      var out = $("calcOut");
      if (!isFinite(entry) || !isFinite(sl) || entry <= 0 || sl <= 0){ out.innerHTML = '<p class="muted small">Enter an entry and stop loss — quantity, position size, margin and maximum loss are calculated from your capital and risk settings above.</p>'; return; }
      var distPct = Math.abs(entry - sl) / entry * 100;
      var wrong = (calcDir === "LONG" && sl >= entry) || (calcDir === "SHORT" && sl <= entry);
      if (wrong){ out.innerHTML = '<p class="small" style="color:var(--short); font-weight:700;">For a ' + calcDir + ", the stop loss must be " + (calcDir === "LONG" ? "below" : "above") + " the entry price. Check your numbers.</p>"; return; }
      var risk = riskUsd(), pos = risk / (distPct / 100), qty = pos / entry, margin = pos / settings.levLimit;
      out.innerHTML = '<div class="levels" style="padding:0;">'
        + '<div class="lvl"><div class="k">Risk Amount</div><div class="v mono">$' + risk.toFixed(2) + '</div><div class="s">' + settings.riskPct + "% of $" + settings.capital + "</div></div>"
        + '<div class="lvl"><div class="k">SL Distance</div><div class="v mono">' + distPct.toFixed(2) + '%</div><div class="s">' + calcDir + " · Entry $" + fmtP(entry) + " · SL $" + fmtP(sl) + "</div></div>"
        + '<div class="lvl"><div class="k">Position Size</div><div class="v mono">$' + pos.toFixed(2) + '</div><div class="s">Qty ≈ ' + (qty >= 100 ? qty.toFixed(0) : qty >= 1 ? qty.toFixed(3) : qty.toFixed(5)) + " coins</div></div>"
        + '<div class="lvl"><div class="k">Margin at ' + settings.levLimit + 'x</div><div class="v mono">$' + margin.toFixed(2) + '</div><div class="s">Profit at 1R +$' + risk.toFixed(2) + " · 2R +$" + (risk * 2).toFixed(2) + " · 3R +$" + (risk * 3).toFixed(2) + "</div></div></div>"
        + (margin > settings.capital ? '<p class="small" style="color:var(--short); font-weight:700; margin-top:10px;">Warning: margin needed ($' + margin.toFixed(2) + ") is larger than your capital — lower the leverage limit is NOT the fix; this setup's stop is too wide for your account at this risk %. Skip it or reduce risk %.</p>" : "");
    }

    /* ================= Wiring ================= */
    document.querySelectorAll(".bottomnav button").forEach(function(b){
      b.addEventListener("click", function(){
        var pg = b.getAttribute("data-page");
        if (pg === "scanner"){ switchPage("dashboard"); setTimeout(function(){ var el=$("scanBtn"); if(el) el.scrollIntoView({behavior:"smooth", block:"center"}); },60); return; }
        if (pg === "signals"){ switchPage("dashboard"); setTimeout(function(){ var el=$("homeSignalsAnchor"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); return; }
        if (pg === "analysis"){ switchPage("dashboard"); setTimeout(function(){ var el=$("homeAnalysisAnchor"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); return; }
        switchPage(pg);
      });
    });
    $("scanBtn").addEventListener("click", runScan);
    $("retryBtn").addEventListener("click", runScan);
    $("sigScanBtn").addEventListener("click", runScan);
    $("dashRetry").addEventListener("click", function(){ $("dashError").classList.remove("on"); state.tickers = []; state.bySym = {}; loadMarket(); toast("Retrying — full source chain from scratch"); });
    $("testConnBtn").addEventListener("click", function(){ testConnection(); });
    $("dataSourceSeg").addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      $("dataSourceSeg").querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      settings.dataSourcePref = b.getAttribute("data-source");
      renderDiagSummary();
      toast("Data source: " + (settings.dataSourcePref === "auto" ? "Auto (Futures → CoinGecko → Vision → CoinPaprika → OKX → Bitget → Gate.io → Bybit → Relays)" : sourceLabel(settings.dataSourcePref) + " first") + " — reloading…");
      state.tickers = []; state.bySym = {}; state.lastUpdated = null;
      loadMarket();
    });
    $("coinSearch").addEventListener("input", renderCoinList);
    $("sortSeg").addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      $("sortSeg").querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true"); state.listSort = b.getAttribute("data-sort"); renderCoinList();
    });
    $("filterChips").addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      $("filterChips").querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true"); state.listFilter = b.getAttribute("data-filter"); renderCoinList();
    });
    $("trkWinBtn").addEventListener("click", function(){
      var v = parseFloat($("trkAmt").value);
      if (!isFinite(v) || v <= 0){ toast("Enter the trade result amount first (e.g. 5)"); return; }
      addTracker(Math.abs(v), "Manual trade (win)"); $("trkAmt").value = ""; toast("Win added to today's tracker");
    });
    $("trkLossBtn").addEventListener("click", function(){
      var v = parseFloat($("trkAmt").value);
      if (!isFinite(v) || v <= 0){ toast("Enter the trade result amount first (e.g. 5)"); return; }
      addTracker(-Math.abs(v), "Manual trade (loss)"); $("trkAmt").value = ""; toast("Loss added to today's tracker");
    });
    $("modeSafe").addEventListener("click", function(){ setMode("safe"); });
    $("modeAgg").addEventListener("click", function(){ setMode("aggressive"); });
    $("setCapital").addEventListener("change", function(){ var v = parseFloat(this.value); settings.capital = (isFinite(v) && v >= 10) ? v : 200; syncSettingsUI(); renderCalc(); });
    $("setRisk").addEventListener("change", function(){ var v = parseFloat(this.value); settings.riskPct = (isFinite(v) && v > 0 && v <= 5) ? v : settings.riskPct; syncSettingsUI(); renderCalc(); });
    $("setLev").addEventListener("change", function(){ var v = parseInt(this.value, 10); settings.levLimit = (isFinite(v) && v >= 1 && v <= 20) ? v : settings.levLimit; syncSettingsUI(); renderCalc(); });
    ["calcEntry", "calcSL"].forEach(function(id){ $(id).addEventListener("input", renderCalc); });
    $("calcDirSeg").addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      $("calcDirSeg").querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true"); calcDir = b.getAttribute("data-dir"); renderCalc();
    });
    $("anLoadBtn").addEventListener("click", function(){ openAnalysis($("anSymbol").value); });
    $("anSymbol").addEventListener("keydown", function(e){ if (e.key === "Enter") openAnalysis(this.value); });
    $("anTfSeg").addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      $("anTfSeg").querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true"); state.anTf = b.getAttribute("data-tf");
      if (state.analysis) $("anChart").innerHTML = analysisChart(state.analysis.ctx, state.anTf);
    });
    $("anQuick").innerHTML = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "PEPEUSDT", "HUMAUSDT"].map(function(s){
      return '<button type="button" class="chip-btn" data-sym="' + s + '">' + s.replace(/USDT$/, "") + "</button>";
    }).join("");
    $("anQuick").querySelectorAll("button").forEach(function(b){ b.addEventListener("click", function(){ openAnalysis(b.getAttribute("data-sym")); }); });

    /* Home All-in-One wiring */
    (function(){
      function doAnalyze(){
        var v = ($("homeCoinInput").value || "").trim();
        if (!v){ toast("Type a coin first — e.g. BTC, SOL, HUMA"); return; }
        openAnalysis(v);
      }
      var hab = $("homeAnalyzeBtn"); if (hab) hab.addEventListener("click", doAnalyze);
      var hci = $("homeCoinInput"); if (hci) hci.addEventListener("keydown", function(e){ if (e.key === "Enter") doAnalyze(); });
      var hq = $("homeQuick"); if (hq) hq.querySelectorAll("button").forEach(function(b){ b.addEventListener("click", function(){ openAnalysis(b.getAttribute("data-sym")); }); });
      var hms = $("homeModeSafe"); if (hms) hms.addEventListener("click", function(){ setMode("safe"); });
      var hma = $("homeModeAgg"); if (hma) hma.addEventListener("click", function(){ setMode("aggressive"); });
      var hgs = $("homeGoSettings"); if (hgs) hgs.addEventListener("click", function(){ switchPage("settings"); });
      ["goHomeFromScanner","goHomeFromSignals","goHomeFromAnalysis"].forEach(function(id){ var b = $(id); if (b) b.addEventListener("click", function(){ switchPage("dashboard"); window.scrollTo({top:0}); }); });
      var bl = $("buyLongBtn"); if (bl) bl.addEventListener("click", function(){ toast("LONG side highlighted above — copy Entry / SL / TP from the Trade Setup and place the trade in the Binance app. This app never trades for you."); });
      var sb = $("sellShortBtn"); if (sb) sb.addEventListener("click", function(){ toast("SHORT side highlighted above — copy Entry / SL / TP from the Trade Setup and place the trade in the Binance app. This app never trades for you."); });
    })();

    /* Tradebise-style market tabs */
    (function(){
      var tabs = document.querySelectorAll("[data-tbtab]");
      tabs.forEach(function(b){
        b.addEventListener("click", function(){
          tabs.forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          var k = b.getAttribute("data-tbtab");
          if (k === "gold"){ openAnalysis("PAXGUSDT"); return; }
          var target = k === "gainers" ? $("gainersCard") : k === "losers" ? $("losersCard") : document.querySelector(".market-strip");
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    })();

    /* ================= Init ================= */
    syncSettingsUI();
    renderHistory();
    loadMarket();
    loadGlobalExtras();
    