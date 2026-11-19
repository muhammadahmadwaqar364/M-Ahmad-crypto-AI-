    function levelsChart(r){
      var kl = r.kl1.slice(-48), pts = kl.map(function(k){ return k.c; });
      var s = r.setup;
      var lo = Math.min.apply(null, pts.concat([s.sl, s.entryLow])), hi = Math.max.apply(null, pts.concat([s.tps[2], s.entryHigh]));
      var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
      var W = 640, H = 190, X1 = 460;
      function Y(v){ return (H - 14 - ((v - lo) / (hi - lo)) * (H - 28)).toFixed(1); }
      function X(i){ return (6 + (i / (pts.length - 1)) * (X1 - 6)).toFixed(1); }
      var line = pts.map(function(v, i){ return X(i) + "," + Y(v); }).join(" ");
      function hline(v, color, label){ return '<line x1="0" x2="' + W + '" y1="' + Y(v) + '" y2="' + Y(v) + '" style="stroke:' + color + '" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.85"/><text x="' + (W - 4) + '" y="' + (parseFloat(Y(v)) - 4) + '" text-anchor="end" font-size="12.5" font-weight="700" style="fill:' + color + '" font-family="IBM Plex Mono, monospace">' + label + " $" + fmtP(v) + "</text>"; }
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Price chart with entry, stop loss and target levels"><polyline points="' + line + '" fill="none" style="stroke:var(--ink2)" stroke-width="2" stroke-linejoin="round"/>'
        + hline(s.tps[2], "var(--long)", "TP3") + hline(s.tps[1], "var(--long)", "TP2") + hline(s.tps[0], "var(--long)", "TP1")
        + hline(r.price, "var(--gold)", "NOW") + hline(s.sl, "var(--short)", "SL") + "</svg>";
    }
    function setupText(r){
      var s = r.setup;
      return r.symbol + " — " + (r.tradeable ? r.dir : "NO TRADE (lean " + r.dir + ")") + " · Confidence " + r.conf + "% · Confirmations " + r.passes + "/" + r.applicable + "\n"
        + "Price now: $" + fmtP(r.price) + " (" + fmtPct(r.change) + " 24h)\n"
        + "Entry Zone: $" + fmtP(s.entryLow) + " – $" + fmtP(s.entryHigh) + "\n"
        + "Stop Loss: $" + fmtP(s.sl) + " (" + s.slPct.toFixed(2) + "%) · Max loss −$" + s.riskUsd.toFixed(2) + "\n"
        + "TP1: $" + fmtP(s.tps[0]) + " (+$" + (s.riskUsd * s.tpR[0]).toFixed(2) + ") · TP2: $" + fmtP(s.tps[1]) + " (+$" + (s.riskUsd * s.tpR[1]).toFixed(2) + ") · TP3: $" + fmtP(s.tps[2]) + " (+$" + (s.riskUsd * s.tpR[2]).toFixed(2) + ")\n"
        + "Leverage: " + s.lev + "x · Position: $" + s.posSize.toFixed(0) + " USDT · Margin: $" + s.margin.toFixed(2) + "\n"
        + "Note: Confirm the live price on Binance before entering. Always set the stop loss.";
    }
    function copySetup(r){
      var txt = setupText(r);
      function done(){ toast("Setup copied — paste it anywhere, then enter the values on Binance"); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(function(){ fallbackCopy(txt); done(); });
      else { fallbackCopy(txt); done(); }
    }
    function fallbackCopy(txt){ var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); }

    function outcomeButtons(r){
      var h = state.history.find(function(x){ return x.symbol === r.symbol && !x.outcome && Math.abs(x.entry - r.price) / r.price < 0.02; });
      if (!r.tradeable || !h) return "";
      return '<div class="outcome-row"><span class="small muted" style="font-weight:800; align-self:center;">TOOK THIS TRADE? MARK RESULT:</span>'
        + '<button type="button" class="btn" data-outcome="TP1" data-hid="' + h.id + '">TP1 hit +$' + (h.riskUsd * h.tpR[0]).toFixed(2) + "</button>"
        + '<button type="button" class="btn" data-outcome="TP2" data-hid="' + h.id + '">TP2 hit +$' + (h.riskUsd * h.tpR[1]).toFixed(2) + "</button>"
        + '<button type="button" class="btn" data-outcome="TP3" data-hid="' + h.id + '">TP3 hit +$' + (h.riskUsd * h.tpR[2]).toFixed(2) + "</button>"
        + '<button type="button" class="btn" data-outcome="SL" data-hid="' + h.id + '">SL hit −$' + h.riskUsd.toFixed(2) + "</button>"
        + '<button type="button" class="btn" data-outcome="BE" data-hid="' + h.id + '">Break-even $0</button></div>';
    }
    function signalCard(r, rank){
      var topTag = (r.tradeable && rank <= 3) ? ' <span class="mini-badge" style="background:var(--accent-dk); color:var(--accent);">TOP SETUP #' + rank + "</span>" : "";
      var head = '<div class="sig-top"><div><div class="sym">' + esc(r.base) + '<small> / USDT · Perpetual</small></div>'
        + '<div class="mono" style="font-weight:700; margin-top:2px;">$' + fmtP(r.price) + ' <span class="' + (r.change >= 0 ? "up" : "down") + '">' + fmtPct(r.change) + " · 24h</span></div></div>"
        + '<span class="badge ' + badgeFor(r) + '">' + badgeText(r) + "</span>" + topTag
        + '<div class="conf"><div class="lab"><span>Confidence</span><span class="mono">' + r.conf + '%</span></div><div class="meter"><i style="width:' + r.conf + '%; background:' + confColor(r.conf) + '"></i></div>'
        + '<div class="small" style="color:var(--ink3); font-weight:600; margin-top:5px;">LONG score ' + r.longScore + " · SHORT score " + r.shortScore + " · " + r.passes + "/" + r.applicable + " confirmations</div></div></div>";
      if (!r.tradeable){
        var why = [];
        if (r.passes < 7) why.push("only " + r.passes + " of " + r.applicable + " confirmations passed (need 7+)");
        if (r.conf < modeCfg().minConf) why.push("confidence " + r.conf + "% is below the " + modeCfg().minConf + "% " + modeCfg().label + "-mode threshold");
        if (Math.abs(r.longScore - r.shortScore) < 12) why.push("LONG and SHORT scores are too close — no clear direction");
        if (r.failReasons.length) why.push("failed: " + r.failReasons.slice(0, 3).join(", "));
        return head + '<div style="padding:15px 16px 4px;"><b>Why NO TRADE:</b> <span class="muted">' + esc(why.join(" · ")) + '. Forcing a trade here is how accounts bleed — wait for a cleaner setup or scan again later.</span></div>'
          + frameworkHTML(r) + '<div class="chart-box">' + levelsChart(r) + "</div>" + checksHTML(r.checks)
          + '<div class="sig-actions"><button type="button" class="btn copy-btn">Copy Watch Setup</button><button type="button" class="btn analyze-btn">Full Analysis</button></div>';
      }
      return head + levelsHTML(r) + frameworkHTML(r) + '<div class="chart-box">' + levelsChart(r) + "</div>" + checksHTML(r.checks)
        + outcomeButtons(r)
        + '<div class="sig-actions"><button type="button" class="btn primary copy-btn">Copy Setup</button><button type="button" class="btn analyze-btn">Full Analysis</button></div>'
        + '<p class="small" style="padding:0 16px 16px; color:var(--ink3); font-weight:600;">Setup is valid only while price is inside the entry zone. If price runs away, the setup is over — do not chase; scan again.</p>';
    }
    function wireCardButtons(container, results){
      container.querySelectorAll(".sig, details.sig-det").forEach(function(card, i){
        var r = results[i]; if (!r) return;
        var cp = card.querySelector(".copy-btn"), an = card.querySelector(".analyze-btn");
        if (cp) cp.addEventListener("click", function(){ copySetup(r); });
        if (an) an.addEventListener("click", function(){ openAnalysis(r.symbol); });
        card.querySelectorAll("[data-outcome]").forEach(function(b){
          b.addEventListener("click", function(){ markOutcome(parseInt(b.getAttribute("data-hid"), 10), b.getAttribute("data-outcome")); });
        });
      });
    }
    function renderSignals(){
      var results = state.scanResults, cfg = modeCfg();
      var tradeable = results.filter(function(r){ return r.tradeable; });
      $("sigSummary").innerHTML = esc(cfg.label + " mode · Capital $" + settings.capital + " · Risk " + settings.riskPct + "% ($" + riskUsd().toFixed(2) + ") per trade · Target $" + cfg.target[0] + "–$" + cfg.target[1] + "/day · Only " + cfg.minConf + "%+ confidence with 7+ confirmations is shown as a trade.")
        + (settings.mode === "aggressive" ? '<br /><span style="color:var(--gold);">Aggressive target warning: $10–$15/day at 2.5% risk per trade is NOT guaranteed — a losing day can be −$5 to −$7.50 or more.</span>' : "");
      $("modeSummary").textContent = "Current mode: " + cfg.label + " (risk " + settings.riskPct + "%/trade, min confidence " + cfg.minConf + "%). Change it in Settings.";
      if (!results.length) return;
      $("signalsEmpty").classList.add("hidden");
      $("bestWrap").classList.remove("hidden"); $("signalsWrap").classList.remove("hidden");
      $("bestMeta").textContent = "Scan " + timeNow() + " · " + (state.dataMode ? (sourceLabel(state.dataMode) + " · Live") : "Live data") + " · " + tradeable.length + " tradeable of " + results.length;
      var best = results[0];
      $("bestCard").innerHTML = signalCard(best, 1);
      wireCardButtons($("bestCard"), [best]);
      var rank = 0;
      $("signalsList").innerHTML = results.map(function(r){
        if (r.tradeable) rank++;
        return '<details class="sig-det" style="background:var(--surface); border:1px solid var(--line); border-radius:14px; margin-bottom:10px; overflow:hidden;">'
          + '<summary style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:13px 15px; cursor:pointer; list-style:none;">'
          + '<b style="font-size:1rem;">' + esc(r.base) + '</b><span class="mono muted small">$' + fmtP(r.price) + '</span>'
          + '<span class="mono small ' + (r.change >= 0 ? "up" : "down") + '" style="font-weight:700;">' + fmtPct(r.change) + "</span>"
          + '<span class="mini-badge ' + badgeFor(r) + '">' + badgeText(r) + "</span>"
          + '<span class="small muted" style="font-weight:700;">Confidence ' + r.conf + "% · " + r.passes + "/" + r.applicable + " checks</span></summary>"
          + '<div style="border-top:1px solid var(--line);">' + signalCard(r, r.tradeable ? rank : 99) + "</div></details>";
      }).join("");
      // signalCard inside details repeats header; acceptable as full detail view
      wireCardButtons($("signalsList"), results);
      $("signalsMeta").textContent = results.length + " coins deep-analyzed · Top setups: " + Math.min(3, tradeable.length) + " · Ranked by checklist score";
    }

    /* ================= History & outcomes ================= */
    var histSeq = 1;
    function registerHistory(results){
      results.filter(function(r){ return r.tradeable; }).slice(0, 5).forEach(function(r){
        state.history.unshift({ id: histSeq++, symbol: r.symbol, dir: r.dir, conf: r.conf, time: timeNow(),
          entry: r.price, sl: r.setup.sl, tps: r.setup.tps, tpR: r.setup.tpR, riskUsd: r.setup.riskUsd, outcome: null, pnl: null });
      });
      if (state.history.length > 30) state.history.length = 30;
      renderHistory();
    }
    function markOutcome(id, kind){
      var h = state.history.find(function(x){ return x.id === id; });
      if (!h || h.outcome) return;
      var pnl = kind === "TP1" ? h.riskUsd * h.tpR[0] : kind === "TP2" ? h.riskUsd * h.tpR[1] : kind === "TP3" ? h.riskUsd * h.tpR[2] : kind === "SL" ? -h.riskUsd : 0;
      h.outcome = kind; h.pnl = pnl;
      addTracker(pnl, h.symbol.replace(/USDT$/, "") + " " + kind);
      renderHistory(); renderSignals();
      toast(h.symbol + " marked " + kind + " (" + (pnl >= 0 ? "+$" : "−$") + Math.abs(pnl).toFixed(2) + ") — added to today's tracker");
    }
    function renderHistory(){
      $("histEmpty").style.display = state.history.length ? "none" : "block";
      $("histList").innerHTML = state.history.map(function(h){
        var oc = h.outcome ? '<span class="mono" style="font-weight:800; color:' + (h.pnl > 0 ? "var(--long)" : h.pnl < 0 ? "var(--short)" : "var(--ink2)") + '">' + h.outcome + " · " + (h.pnl >= 0 ? "+$" : "−$") + Math.abs(h.pnl).toFixed(2) + "</span>"
          : '<span style="display:flex; gap:6px; flex-wrap:wrap;">'
            + '<button type="button" class="chip-btn" data-hid="' + h.id + '" data-k="TP1" style="min-height:36px;">TP1</button>'
            + '<button type="button" class="chip-btn" data-hid="' + h.id + '" data-k="TP2" style="min-height:36px;">TP2</button>'
            + '<button type="button" class="chip-btn" data-hid="' + h.id + '" data-k="TP3" style="min-height:36px;">TP3</button>'
            + '<button type="button" class="chip-btn" data-hid="' + h.id + '" data-k="SL" style="min-height:36px;">SL</button>'
            + '<button type="button" class="chip-btn" data-hid="' + h.id + '" data-k="BE" style="min-height:36px;">BE</button></span>';
        return '<div class="hist-item"><span><b>' + esc(h.symbol) + '</b> <span class="mini-badge ' + (h.dir === "LONG" ? "long" : "short") + '">' + h.dir + '</span> <span class="muted small">' + h.time + " · Conf " + h.conf + "% · Entry $" + fmtP(h.entry) + "</span></span>" + oc + "</div>";
      }).join("");
      $("histList").querySelectorAll("[data-hid]").forEach(function(b){
        b.addEventListener("click", function(){ markOutcome(parseInt(b.getAttribute("data-hid"), 10), b.getAttribute("data-k")); });
      });
    }

    /* ================= Scan flow ================= */
    function setStep(n, st){ var li = $("st" + n); li.className = st; if (st === "done") li.querySelector(".st").textContent = "✓"; }
    function resetSteps(){ for (var i = 1; i <= 4; i++){ var li = $("st" + i); li.className = ""; li.querySelector(".st").textContent = String(i); } $("coinCounter").textContent = ""; $("barFill").style.width = "0%"; }
    async function runScan(){
      if (state.scanning) return;
      state.scanning = true;
      switchPage("dashboard");
      $("scanBtn").disabled = true; $("scanBtnTxt").textContent = "SCANNING…";
      $("errorBox").classList.remove("on"); $("progressBox").classList.add("on"); resetSteps();
      try {
        setStep(1, "doing"); $("barFill").style.width = "10%";
        if (!state.tickers.length) await loadMarket();
        if (!state.tickers.length) throw new Error("market data unavailable");
        if (state.dataMode === "futures" && !Object.keys(state.funding).length){ state.funding = await getFunding(); }
        setStep(1, "done"); $("barFill").style.width = "24%";
        setStep(2, "doing");
        var pool = liquidPool();
        var seen = {}, cand = [];
        function add(list){ list.forEach(function(t){ if (!seen[t.symbol]){ seen[t.symbol] = 1; cand.push(t); } }); }
        var byChg = pool.slice().sort(function(a, b){ return parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent); });
        var byVol = pool.slice().sort(function(a, b){ return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume); });
        add(byChg.slice(0, 5)); add(byChg.slice(-5).reverse()); add(byVol.slice(0, 6));
        if (state.bySym["BTCUSDT"]) add([state.bySym["BTCUSDT"]]);
        if (state.bySym["ETHUSDT"]) add([state.bySym["ETHUSDT"]]);
        cand = cand.slice(0, 12);
        setStep(2, "done"); $("barFill").style.width = "36%";
        var btcDir = state.btcCtx ? (state.btcCtx.dir === "long" ? "up" : state.btcCtx.dir === "short" ? "down" : "flat") : "flat";
        setStep(3, "doing");
        var results = [], done = 0, idx = 0;
        async function worker(){
          while (idx < cand.length){
            var t = cand[idx++];
            try { results.push(await analyzeCandidate(t, btcDir)); } catch (e) { /* skip coin with insufficient data */ }
            done++;
            $("coinCounter").textContent = "(" + done + "/" + cand.length + ")";
            $("barFill").style.width = (36 + Math.round(done / cand.length * 52)) + "%";
          }
        }
        await Promise.all([worker(), worker(), worker(), worker()]);
        setStep(3, "done");
        if (!results.length) throw new Error("No coin returned enough candle data to analyze. Try again in a moment.");
        setStep(4, "doing"); $("barFill").style.width = "95%";
        results.sort(function(a, b){ return (b.tradeable - a.tradeable) || (b.conf - a.conf) || (b.passes - a.passes); });
        state.scanResults = results;
        registerHistory(results);
        renderSignals();
        setStep(4, "done"); $("barFill").style.width = "100%";
        setTimeout(function(){ $("progressBox").classList.remove("on"); }, 900);
        switchPage("dashboard");
        if (results.length) renderDecisionHero(results[0]);
        setTimeout(function(){ var el = $("homeSignalsAnchor"); if (el) el.scrollIntoView({behavior:"smooth", block:"start"}); }, 120);
        var tr = results.filter(function(r){ return r.tradeable; }).length;
        toast(tr ? tr + " tradeable setup(s) found — see AI Signals" : "Scan complete — NO TRADE: no coin passed all conditions");
      } catch (err) {
        $("progressBox").classList.remove("on");
        $("errorTxt").textContent = "Scan failed — " + (err && err.message ? err.message : "network error") + ". Check your connection and try again. No signal is shown rather than a made-up one.";
        $("errorBox").classList.add("on");
      } finally {
        state.scanning = false;
        $("scanBtn").disabled = false; $("scanBtnTxt").textContent = "SCAN MARKET";
      }
    }

    /* ================= 30-Part Weighted Framework Engine ================= */
    /* Priority groups (weights sum to 100):
       G1 Market Structure & Trend 16 · G2 Liquidity & Price Action 15 · G3 Volume & Order Flow 14
       G4 Open Interest & Funding 12 · G5 Multi-Timeframe 10 · G6 Support/Resistance & Fibonacci 8
       G7 Whale & Smart Money 6 · G8 BTC Market & Sentiment 7 · G9 Momentum & Volatility 7 · G10 Risk/Reward & Execution 5
       Fundamentals / News / Unlocks are shown for information (no live verified source = Neutral, never invented). */
    function fwItem(group, name, weight, status, detail){ return { group: group, label: name, weight: weight, status: status, detail: detail }; }
    function takerStats(kl){
      var tb = 0, qv = 0; kl.forEach(function(k){ tb += k.tbq || 0; qv += k.qv || 0; });
      return qv ? tb / qv * 100 : 50;
    }
    function cvdCalc(kl){ var c = 0, out = []; kl.forEach(function(k){ c += 2 * (k.tbq || 0) - (k.qv || 0); out.push(c); }); return out; }
    function candlePatterns(kl){
      var n = kl.length; if (n < 3) return { name: null, dir: null };
      var a = kl[n-2], b = kl[n-1];
      var bodyB = Math.abs(b.c - b.o), rangeB = (b.h - b.l) || 1e-9;
      var upWick = b.h - Math.max(b.c, b.o), dnWick = Math.min(b.c, b.o) - b.l;
      if (b.c > b.o && a.c < a.o && b.c > a.o && b.o < a.c) return { name: "Bullish Engulfing", dir: "long" };
      if (b.c < b.o && a.c > a.o && b.c < a.o && b.o > a.c) return { name: "Bearish Engulfing", dir: "short" };
      if (dnWick > bodyB * 2 && upWick < rangeB * 0.25) return { name: b.c >= b.o ? "Hammer (rejection of lows)" : "Inverted Hammer", dir: "long" };
      if (upWick > bodyB * 2 && dnWick < rangeB * 0.25) return { name: "Shooting Star (rejection of highs)", dir: "short" };
      return { name: null, dir: null };
    }
    function fvgFind(kl){
      for (var i = kl.length - 1; i >= 2; i--){
        if (kl[i].l > kl[i-2].h) return { dir: "long", low: kl[i-2].h, high: kl[i].l, i: i };
        if (kl[i].h < kl[i-2].l) return { dir: "short", low: kl[i].h, high: kl[i-2].l, i: i };
      }
      return null;
    }
    async function gatherContext(symbol, t, full){
      var reqs = [
        getKlines(symbol, "15m", 120), getKlines(symbol, "1h", 260), getKlines(symbol, "4h", 260),
        getKlines(symbol, "1d", 90), getKlines(symbol, "5m", 90),
        getDepth(symbol), getOIHist(symbol),
        getRatio("globalLongShortAccountRatio", symbol), getRatio("topLongShortPositionRatio", symbol)
      ];
      if (full) reqs.push(getKlines(symbol, "1w", 12), getFundingHist(symbol), getSpotTicker(symbol), getRatio("topLongShortAccountRatio", symbol));
      var r = await Promise.all(reqs.map(function(p){ return p.catch(function(){ return null; }); }));
      if (!r[1] || r[1].length < 50 || !r[2] || r[2].length < 30) throw new Error("insufficient candle data");
      if (!r[0]) r[0] = r[1];
      if (!r[4]) r[4] = r[1];
      if (!r[3]) r[3] = r[2];
      if (!state.cache) state.cache = {};
      if (!state.cache.btc1h){ try { state.cache.btc1h = await getKlines("BTCUSDT", "1h", 260); } catch (e) { state.cache.btc1h = null; } }
      if (!state.cache.btc4h){ try { state.cache.btc4h = await getKlines("BTCUSDT", "4h", 260); } catch (e) { state.cache.btc4h = null; } }
      if (!state.cache.eth4h){ try { state.cache.eth4h = await getKlines("ETHUSDT", "4h", 260); } catch (e) { state.cache.eth4h = null; } }
      return { symbol: symbol, t: t, kl5: r[4], kl15: r[0], kl1: r[1], kl4: r[2], kl1d: r[3],
        depth: r[5], oi: r[6], lsGlobal: r[7], lsTopPos: r[8],
        kl1w: full ? r[9] : null, fundingHist: full ? r[10] : null, spotTicker: full ? r[11] : null, lsTopAcc: full ? r[12] : null,
        btc1h: state.cache.btc1h, btc4h: state.cache.btc4h, eth4h: state.cache.eth4h,
        cg: state.cgMarkets[symbol] || null, full: !!full };
    }

    function buildFramework(ctx){
      var symbol = ctx.symbol, t = ctx.t;
      var price = parseFloat(t.lastPrice), change = parseFloat(t.priceChangePercent), qVol = parseFloat(t.quoteVolume);
      var kl15 = ctx.kl15, kl1 = ctx.kl1, kl4 = ctx.kl4, kl1d = ctx.kl1d, kl5 = ctx.kl5;
      var closes1 = kl1.map(function(k){ return k.c; }), closes4 = kl4.map(function(k){ return k.c; }), closes15 = kl15.map(function(k){ return k.c; });
      var atr = atrCalc(kl1, 14), atrPct = atr / price * 100;
      var tr5 = kl5 ? trendOf(kl5) : { dir: "flat" }, tr15 = trendOf(kl15), tr1 = trendOf(kl1), tr4 = trendOf(kl4), tr1d = kl1d ? trendOf(kl1d) : { dir: "flat" };
      var rsi1 = rsiCalc(closes1, 14), rsi4 = rsiCalc(closes4, 14);
      var mc = macdCalc(closes1), mc4 = macdCalc(closes4);
      var srsi = stochRsi(closes1, 14);
      var adx = adxCalc(kl1, 14);
      var obv = obvCalc(kl1);
      var vwap1 = vwapCalc(kl1.slice(-24));
      var bb = bollCalc(closes1, 20, 2);
      var vols = kl1.map(function(k){ return k.qv; }), avgVol = 0, i;
      for (i = vols.length - 21; i < vols.length - 1; i++) avgVol += vols[i]; avgVol /= 20;
      var volRatio = avgVol > 0 ? vols[vols.length - 2] / avgVol : 1;
      var volDir = kl1[kl1.length - 2].c >= kl1[kl1.length - 2].o ? "long" : "short";
      var taker1h = takerStats(kl1.slice(-24)), taker15 = takerStats(kl15.slice(-16));
      var cvd = cvdCalc(kl1.slice(-48));
      var cvdSlope = cvd.length > 12 ? cvd[cvd.length - 1] - cvd[cvd.length - 13] : 0;
      var sw1 = swings(kl1.slice(-70), 3), sw4 = swings(kl4.slice(-70), 3);
      var swingLow = sw1.lows.length ? sw1.lows[sw1.lows.length - 1].v : Math.min.apply(null, kl1.slice(-30).map(function(k){ return k.l; }));
      var swingHigh = sw1.highs.length ? sw1.highs[sw1.highs.length - 1].v : Math.max.apply(null, kl1.slice(-30).map(function(k){ return k.h; }));
      var distRes = (swingHigh - price) / atr, distSup = (price - swingLow) / atr;
      var funding = (state.funding[symbol] === undefined) ? null : state.funding[symbol];
      var oi = ctx.oi, lsG = ctx.lsGlobal, lsTP = ctx.lsTopPos;
      var btcTr = ctx.btc4h ? trendOf(ctx.btc4h) : (state.btcCtx ? { dir: state.btcCtx.dir } : { dir: "flat" });
      var btcDir = btcTr.dir === "long" ? "up" : btcTr.dir === "short" ? "down" : "flat";
      var ethTr = ctx.eth4h ? trendOf(ctx.eth4h) : { dir: "flat" };
      var corr = (ctx.btc1h && symbol !== "BTCUSDT") ? correlation(closes1, ctx.btc1h.map(function(k){ return k.c; })) : null;
      // Depth analytics
      var depthInfo = null;
      if (ctx.depth){
        var mid = price, bidSum = 0, askSum = 0, bigBid = null, bigAsk = null;
        ctx.depth.bids.forEach(function(b){ if (b[0] >= mid * 0.99){ var v = b[0] * b[1]; bidSum += v; if (!bigBid || v > bigBid.v) bigBid = { p: b[0], v: v }; } });
        ctx.depth.asks.forEach(function(a){ if (a[0] <= mid * 1.01){ var v = a[0] * a[1]; askSum += v; if (!bigAsk || v > bigAsk.v) bigAsk = { p: a[0], v: v }; } });
        var bestBid = ctx.depth.bids.length ? ctx.depth.bids[0][0] : null, bestAsk = ctx.depth.asks.length ? ctx.depth.asks[0][0] : null;
        depthInfo = { bidSum: bidSum, askSum: askSum, bigBid: bigBid, bigAsk: bigAsk,
          imb: (bidSum + askSum) ? (bidSum - askSum) / (bidSum + askSum) * 100 : 0,
          spreadBps: (bestBid && bestAsk) ? (bestAsk - bestBid) / mid * 10000 : null };
      }

      /* --- Direction scoring (which side, before framework gating) --- */
      var L = 0, S = 0;
      [[tr1, 20], [tr4, 16], [tr15, 10], [tr1d, 8]].forEach(function(pair){
        var tr = pair[0], w = pair[1];
        if (tr.dir === "long") L += tr.strong ? w : w * 0.55;
        if (tr.dir === "short") S += tr.strong ? w : w * 0.55;
      });
      if (mc.hist > 0){ L += 9; if (mc.hist > mc.prev) L += 3; } if (mc.hist < 0){ S += 9; if (mc.hist < mc.prev) S += 3; }
      L += (rsiScore(rsi1, "long") + rsiScore(rsi4, "long")) / 2; S += (rsiScore(rsi1, "short") + rsiScore(rsi4, "short")) / 2;
      if (volRatio >= 1.4){ if (volDir === "long") L += 10; else S += 10; } else if (volRatio >= 1.05){ if (volDir === "long") L += 5; else S += 5; }
      if (taker1h > 54) L += 5; if (taker1h < 46) S += 5;
      if (cvdSlope > 0) L += 4; if (cvdSlope < 0) S += 4;
      if (change > 0){ L += Math.min(change, 18) * 0.4; if (change > 30) L -= 8; }
      if (change < 0){ S += Math.min(-change, 18) * 0.4; if (change < -30) S -= 8; }
      if (distRes > 1.2) L += 7; else if (distRes <= 0.6) L -= 8;
      if (distSup > 1.2) S += 7; else if (distSup <= 0.6) S -= 8;
      if (symbol !== "BTCUSDT"){ if (btcDir === "up"){ L += 6; S -= 6; } if (btcDir === "down"){ S += 6; L -= 6; } }
      if (funding !== null){ if (funding > 0.05) L -= 8; if (funding < -0.05) S -= 8; if (funding < -0.03) L += 5; if (funding > 0.03) S += 5; }
      if (oi){ if (oi.change4h > 0.5 && change > 0) L += 6; if (oi.change4h > 0.5 && change < 0) S += 6; }
      L = Math.round(clamp(L, 0, 100)); S = Math.round(clamp(S, 0, 100));
      var isLong = L >= S, dir = isLong ? "LONG" : "SHORT";
      var setup = buildSetup(price, isLong, atr, swingLow, swingHigh, qVol);
      var B = isLong ? "long" : "short"; // bias key for evaluators
      function stAligned(d){ return d === B ? "pass" : d === "flat" ? "na" : "fail"; }

      /* --- Structure helpers --- */
      var lastHighs = sw1.highs.slice(-3), lastLows = sw1.lows.slice(-3);
      var hhhl = lastHighs.length >= 2 && lastLows.length >= 2 && lastHighs[lastHighs.length-1].v > lastHighs[lastHighs.length-2].v && lastLows[lastLows.length-1].v > lastLows[lastLows.length-2].v;
      var lhll = lastHighs.length >= 2 && lastLows.length >= 2 && lastHighs[lastHighs.length-1].v < lastHighs[lastHighs.length-2].v && lastLows[lastLows.length-1].v < lastLows[lastLows.length-2].v;
      var pat = candlePatterns(kl1);
      var fvg = fvgFind(kl15) || fvgFind(kl1);
      var rangeHi = Math.max.apply(null, kl4.map(function(k){ return k.h; })), rangeLo = Math.min.apply(null, kl4.map(function(k){ return k.l; }));
      var rangePos = (rangeHi - rangeLo) ? (price - rangeLo) / (rangeHi - rangeLo) * 100 : 50;
      var fibBase = rangeHi - rangeLo;
      var histVol = (function(){ var rets = []; for (var j = 1; j < closes1.length; j++) rets.push(Math.log(closes1[j] / closes1[j-1])); return stdev(rets.slice(-72)) * Math.sqrt(24) * 100; })();
      var pdh = null, pdl = null, pivot = null;
      if (kl1d && kl1d.length >= 2){ var pd = kl1d[kl1d.length - 2]; pdh = pd.h; pdl = pd.l; pivot = (pd.h + pd.l + pd.c) / 3; }
      var pwh = null, pwl = null;
      if (ctx.kl1w && ctx.kl1w.length >= 2){ var pw = ctx.kl1w[ctx.kl1w.length - 2]; pwh = pw.h; pwl = pw.l; }

      var P = []; // the 30 parts
      // G1 — Market Structure & Trend (16)
      var structDir = hhhl ? "long" : lhll ? "short" : tr1.dir;
      P.push(fwItem("G1 · Priority 1 — Market Structure & Trend", "1. Market Structure & Trend", 16,
        structDir === B ? "pass" : structDir === "flat" ? "na" : "fail",
        "Structure: " + (hhhl ? "Higher Highs & Higher Lows (bullish)" : lhll ? "Lower Highs & Lower Lows (bearish)" : "no clean swing sequence (mixed)") + " · 1H trend " + tr1.dir + (adx ? " · ADX " + adx.adx.toFixed(0) + (adx.adx >= 25 ? " (strong trend)" : adx.adx >= 20 ? " (developing)" : " (weak / ranging)") : "")));
      // G5 — Multi-Timeframe (10)
      var tfList = [["1D", tr1d], ["4H", tr4], ["1H", tr1], ["15M", tr15], ["5M", tr5]];
      var tfAligned = tfList.filter(function(x){ return x[1].dir === B; }).length;
      P.push(fwItem("G5 · Priority 5 — Multi-Timeframe", "2. Multi-Timeframe Analysis", 10,
        tfAligned >= 3 ? "pass" : tfAligned === 2 ? "na" : "fail",
        tfList.map(function(x){ return x[0] + " " + x[1].dir; }).join(" · ") + " — " + tfAligned + "/5 timeframes agree with " + dir));
      // G6 — Support & Resistance (5) + Fibonacci (3)
      var room = isLong ? distRes : distSup;
      P.push(fwItem("G6 · Priority 6 — Support & Resistance", "3. Support & Resistance", 5,
        room > 0.8 ? "pass" : room > 0.45 ? "na" : "fail",
        "Major support $" + fmtP(swingLow) + " · Major resistance $" + fmtP(swingHigh) + (pdh ? " · Prev day H/L $" + fmtP(pdh) + " / $" + fmtP(pdl) : "") + (pwh ? " · Prev week H/L $" + fmtP(pwh) + " / $" + fmtP(pwl) : "") + (pivot ? " · Daily pivot $" + fmtP(pivot) : "") + " · Room to the wall: " + room.toFixed(1) + "x ATR"));
      // G2 — Liquidity (4), SMC (3), Price Action (4), Liquidation (2), Entry Confirmation (2)
      var poolNear = isLong ? distSup : distRes;
      P.push(fwItem("G2 · Priority 2 — Liquidity & Price Action", "4. Liquidity Analysis", 4,
        poolNear > 0.5 ? "pass" : "fail",
        "Buy-side liquidity (above): $" + fmtP(swingHigh) + " · Sell-side liquidity (below): $" + fmtP(swingLow) + " · Nearest pool behind price is " + poolNear.toFixed(1) + "x ATR away" + (poolNear <= 0.5 ? " — stop-hunt wick into the pool is likely first" : "")));
      var bosDir = null;
      if (lastHighs.length && price > lastHighs[lastHighs.length-1].v) bosDir = "long";
      if (lastLows.length && price < lastLows[lastLows.length-1].v) bosDir = "short";
      var smcTxt = "BOS: " + (bosDir ? (bosDir === "long" ? "broke above last swing high (bullish)" : "broke below last swing low (bearish)") : "no recent break of structure");
      smcTxt += " · CHOCH/MSS: " + ((isLong && lhll && bosDir === "long") || (!isLong && hhhl && bosDir === "short") ? "character change detected against the old trend" : "none confirmed");
      smcTxt += " · FVG: " + (fvg ? (fvg.dir === "long" ? "bullish" : "bearish") + " gap $" + fmtP(fvg.low) + "–$" + fmtP(fvg.high) : "none recent");
      smcTxt += " · Zone: price is in " + (rangePos < 40 ? "Discount" : rangePos > 60 ? "Premium" : "Equilibrium") + " (" + rangePos.toFixed(0) + "% of 4H range)";
      var smcPass = (bosDir === B) || (fvg && fvg.dir === B) || (isLong && rangePos < 40) || (!isLong && rangePos > 60);
      var smcFail = (bosDir && bosDir !== B) || (isLong && rangePos > 78) || (!isLong && rangePos < 22);
      P.push(fwItem("G2 · Priority 2 — Liquidity & Price Action", "5. Smart Money Concepts (BOS / CHOCH / OB / FVG)", 3, smcFail ? "fail" : smcPass ? "pass" : "na", smcTxt));
      var paTxt = pat.name ? "Last 1H pattern: " + pat.name : "No major candlestick pattern on the last 1H candles";
      paTxt += " · Breakout: " + (bosDir ? bosDir + " break of the last swing" : "none") + " · Last candle wick rejection: " + (function(){ var b = kl1[kl1.length-1], r = (b.h - b.l) || 1e-9, uw = (b.h - Math.max(b.c, b.o)) / r, dw = (Math.min(b.c, b.o) - b.l) / r; return uw > 0.45 ? "upper wick " + Math.round(uw*100) + "% (sellers rejected highs)" : dw > 0.45 ? "lower wick " + Math.round(dw*100) + "% (buyers rejected lows)" : "none strong"; })();
      P.push(fwItem("G2 · Priority 2 — Liquidity & Price Action", "6. Price Action", 4,
        pat.dir ? (pat.dir === B ? "pass" : "fail") : bosDir ? (bosDir === B ? "pass" : "fail") : "na", paTxt));
      // G3 — Volume (6), Order Flow (4), Order Book (4)
      P.push(fwItem("G3 · Priority 3 — Volume & Order Flow", "7. Volume Analysis", 6,
        volRatio >= 1.05 && volDir === B ? "pass" : volRatio < 0.7 ? "fail" : "na",
        "Futures 24h volume " + fmtMoney(qVol) + " · Last 1H volume " + volRatio.toFixed(2) + "x the 20-candle average" + (ctx.spotTicker ? " · Spot 24h volume " + fmtMoney(ctx.spotTicker.qv) : "") + " · Taker-buy share (24h of 1H): " + taker1h.toFixed(0) + "%"));
      P.push(fwItem("G3 · Priority 3 — Volume & Order Flow", "8. Order Flow (CVD / Delta)", 4,
        (cvdSlope > 0) === isLong && Math.abs(cvdSlope) > 0 ? (Math.abs(cvdSlope) > avgVol * 0.02 ? "pass" : "na") : "fail",
        "CVD (48h window) is " + (cvdSlope > 0 ? "rising — net aggressive buying" : "falling — net aggressive selling") + " · Taker-buy share 15M: " + taker15.toFixed(0) + "% · Aggressive " + (taker15 >= 55 ? "buyers in control (15M)" : taker15 <= 45 ? "sellers in control (15M)" : "flow is balanced (15M)")));
      if (!depthInfo) P.push(fwItem("G3 · Priority 3 — Volume & Order Flow", "9. Order Book & Market Depth", 4, "na", "Order book snapshot unavailable for this pair right now"));
      else P.push(fwItem("G3 · Priority 3 — Volume & Order Flow", "9. Order Book & Market Depth", 4,
        (depthInfo.imb > 8) === isLong && Math.abs(depthInfo.imb) > 8 ? "pass" : Math.abs(depthInfo.imb) <= 8 ? "na" : "fail",
        "Bid/ask imbalance (within 1%): " + (depthInfo.imb >= 0 ? "+" : "") + depthInfo.imb.toFixed(0) + "% · Buy depth " + fmtMoney(depthInfo.bidSum) + " · Sell depth " + fmtMoney(depthInfo.askSum) + (depthInfo.bigBid ? " · Biggest buy wall " + fmtMoney(depthInfo.bigBid.v) + " @ $" + fmtP(depthInfo.bigBid.p) : "") + (depthInfo.bigAsk ? " · Biggest sell wall " + fmtMoney(depthInfo.bigAsk.v) + " @ $" + fmtP(depthInfo.bigAsk.p) : "") + (depthInfo.spreadBps !== null ? " · Spread " + depthInfo.spreadBps.toFixed(1) + " bps" : "")));
      // G4 — OI (5), Funding (4), L/S Ratio (3)
      if (!oi) P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "10. Open Interest", 5, "na", state.dataMode === "spot" ? "Spot data mode — open interest is a futures-only metric" : "Open interest history unavailable"));
      else { var oiQuad = change > 0 && oi.change4h > 0 ? "Price up + OI up = new longs, trend has fuel" : change < 0 && oi.change4h > 0 ? "Price down + OI up = new shorts, trend has fuel" : oi.change4h < 0 ? "OI falling = positions closing, move is losing fuel" : "Price and OI are not moving together";
        P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "10. Open Interest", 5,
          oi.change4h > 0.5 && (isLong ? change > 0 : change < 0) ? "pass" : oi.change4h < -1 ? "fail" : "na",
          "Open interest " + fmtMoney(oi.value) + ", " + fmtPct(oi.change4h) + " in ~4h · " + oiQuad)); }
      if (funding === null) P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "11. Funding Rate", 4, "na", state.dataMode === "spot" ? "Spot data mode — futures funding unavailable (check it in the Binance app)" : "Funding unavailable"));
      else { var crowd = isLong ? funding > 0.05 : funding < -0.05;
        var fhTxt = ctx.fundingHist && ctx.fundingHist.length ? " · Last rates: " + ctx.fundingHist.map(function(x){ return (x >= 0 ? "+" : "") + x.toFixed(4) + "%"; }).join(", ") : "";
        P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "11. Funding Rate", 4, crowd ? "fail" : "pass",
          "Funding " + (funding >= 0 ? "+" : "") + funding.toFixed(4) + "% — " + (funding > 0 ? "longs pay shorts" : funding < 0 ? "shorts pay longs" : "neutral") + (crowd ? " · This side is crowded — extreme funding, squeeze risk" : " · No extreme crowding") + fhTxt)); }
      if (lsG === null && lsTP === null) P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "12. Long / Short Ratios", 3, "na", state.dataMode === "spot" ? "Spot data mode — futures ratios unavailable" : "Ratio data unavailable"));
      else { var lsBad = isLong ? (lsG !== null && lsG > 2.2) || (lsTP !== null && lsTP > 2.6) : (lsG !== null && lsG < 0.45) || (lsTP !== null && lsTP < 0.38);
        P.push(fwItem("G4 · Priority 4 — Open Interest & Funding", "12. Long / Short Ratios", 3, lsBad ? "fail" : "pass",
          (lsTP !== null ? "Top traders position ratio " + lsTP.toFixed(2) : "") + (lsG !== null ? " · All accounts ratio " + lsG.toFixed(2) : "") + (ctx.lsTopAcc ? " · Top accounts ratio " + ctx.lsTopAcc.toFixed(2) : "") + (lsBad ? " — positioning is extremely crowded on this side" : " — positioning is not extreme"))); }
      // G7 — Whale Activity (6)
      var whaleTxt = [], whaleStatus = "na";
      if (depthInfo && depthInfo.bigBid && depthInfo.bigAsk){
        whaleTxt.push("Largest buy order " + fmtMoney(depthInfo.bigBid.v) + " vs largest sell order " + fmtMoney(depthInfo.bigAsk.v));
        if (depthInfo.bigBid.v > depthInfo.bigAsk.v * 1.6) { whaleStatus = isLong ? "pass" : "fail"; whaleTxt.push("buy-side whale wall dominates"); }
        else if (depthInfo.bigAsk.v > depthInfo.bigBid.v * 1.6) { whaleStatus = isLong ? "fail" : "pass"; whaleTxt.push("sell-side whale wall dominates"); }
      }
      if (lsTP !== null) whaleTxt.push("Top traders are " + (lsTP > 1.15 ? "net long" : lsTP < 0.87 ? "net short" : "balanced") + " (" + lsTP.toFixed(2) + ")");
      whaleTxt.push("On-chain whale transactions & wallet flows: no verified live source available — not guessed");
      P.push(fwItem("G7 · Priority 7 — Whale & Smart Money", "13. Whale Activity", 6, whaleStatus, whaleTxt.join(" · ")));
      // G2 — Liquidation (2)
      var liqBelow = price * (1 - 1 / 25 * 0.9), liqAbove = price * (1 + 1 / 25 * 0.9);
      var huntRisk = (isLong && distSup <= 0.5) || (!isLong && distRes <= 0.5);
      P.push(fwItem("G2 · Priority 2 — Liquidity & Price Action", "14. Liquidation Analysis", 2, huntRisk ? "fail" : "pass",
        "Estimated 25x long liquidations cluster near $" + fmtP(liqBelow) + " · 25x short liquidations near $" + fmtP(liqAbove) + " (estimates from leverage math, not exchange data) · Main clusters sit at the swing pools $" + fmtP(swingLow) + " / $" + fmtP(swingHigh) + (huntRisk ? " · A pool sits within 0.5 ATR of price — stop-hunt / squeeze risk is high" : " · No pool is dangerously close")));
      // G9 — Volatility (1.5), Momentum (2.5), MAs (2), VWAP (1)
      P.push(fwItem("G9 · Priority 9 — Momentum & Volatility", "15. Volatility Analysis", 1.5,
        (atrPct >= 0.3 && atrPct <= 5.5) ? "pass" : "fail",
        "ATR(14) 1H $" + fmtP(atr) + " (" + atrPct.toFixed(2) + "%) · Historical volatility ≈ " + histVol.toFixed(1) + "%/day" + (bb ? " · Bollinger %B " + bb.pctB.toFixed(2) + (bb.pctB > 1 ? " (price above the upper band — extended)" : bb.pctB < 0 ? " (below the lower band — extended)" : "") : "")));
      var momOk = isLong ? (rsi1 >= 42 && rsi1 <= 72 && mc.hist > 0) : (rsi1 >= 28 && rsi1 <= 58 && mc.hist < 0);
      P.push(fwItem("G9 · Priority 9 — Momentum & Volatility", "16. Momentum Indicators (RSI / MACD / Stoch RSI / ADX)", 2.5, momOk ? "pass" : "fail",
        "RSI 1H " + rsi1.toFixed(0) + " · RSI 4H " + rsi4.toFixed(0) + " · MACD hist " + (mc.hist > 0 ? "positive" : "negative") + (Math.abs(mc.hist) > Math.abs(mc.prev) ? " & expanding" : " & shrinking") + (srsi !== null ? " · Stoch RSI " + srsi.toFixed(0) : "") + (adx ? " · ADX " + adx.adx.toFixed(0) + " (+" + "DI " + adx.pdi.toFixed(0) + " / −DI " + adx.ndi.toFixed(0) + ")" : "") + " · OBV trend " + (obv.length > 15 ? (obv[obv.length-1] > obv[obv.length-15] ? "rising" : "falling") : "n/a")));
      var closesAll = closes1;
      var emaTxt = [9, 20, 50, 100, 200].map(function(p){ var e = closesAll.length >= p ? emaLast(closesAll, p) : null; return e ? "EMA" + p + " " + (price > e ? "below price" : "above price") : "EMA" + p + " n/a"; }).join(" · ");
      var e9 = emaLast(closesAll, 9), e20 = emaLast(closesAll, 20);
      P.push(fwItem("G9 · Priority 9 — Momentum & Volatility", "17. Moving Averages (EMA 9/20/50/100/200)", 2,
        (isLong ? price > e20 && e9 > e20 : price < e20 && e9 < e20) ? "pass" : (isLong ? price < e20 : price > e20) ? "fail" : "na", emaTxt + " · EMA9/20 cross: " + (e9 > e20 ? "bullish (9 above 20)" : "bearish (9 below 20)")));
      P.push(fwItem("G9 · Priority 9 — Momentum & Volatility", "18. VWAP Analysis", 1,
        vwap1 ? ((isLong ? price > vwap1 : price < vwap1) ? "pass" : "fail") : "na",
        vwap1 ? "VWAP (last 24h of 1H candles, also the anchored VWAP for this window) $" + fmtP(vwap1) + " — price is " + (price > vwap1 ? "above it (buyers in control intraday)" : "below it (sellers in control intraday)") : "VWAP unavailable"));
      // G6 — Fibonacci (3)
      var fibLevels = [0.382, 0.5, 0.618].map(function(f){ return rangeHi - fibBase * f; });
      var nearFib = fibLevels.some(function(f){ return Math.abs(price - f) / atr < 0.5; });
      P.push(fwItem("G6 · Priority 6 — Support & Resistance", "19. Fibonacci Analysis", 3,
        nearFib ? "pass" : "na",
        "From the 4H swing range $" + fmtP(rangeLo) + "–$" + fmtP(rangeHi) + ": retracements 38.2% $" + fmtP(fibLevels[0]) + " · 50% $" + fmtP(fibLevels[1]) + " · 61.8% $" + fmtP(fibLevels[2]) + " · 1.618 extension $" + fmtP(isLong ? rangeHi + fibBase * 0.618 : rangeLo - fibBase * 0.618) + (nearFib ? " · Price is reacting at a Fibonacci level now (confluence)" : "")));
      // G8 — BTC & Market (4), Sentiment (1.5), Correlation (1.5)
      if (symbol === "BTCUSDT") P.push(fwItem("G8 · Priority 8 — BTC & Market", "20. BTC & Overall Market Conditions", 4, "na", "This is BTC itself — it defines overall market conditions · BTC dominance " + (state.cgGlobal ? state.cgGlobal.dom.toFixed(1) + "%" : "n/a")));
      else { var btcOk = btcDir === "flat" || (isLong && btcDir === "up") || (!isLong && btcDir === "down");
        P.push(fwItem("G8 · Priority 8 — BTC & Market", "20. BTC & Overall Market Conditions", 4, btcOk ? "pass" : "fail",
          "BTC 4H trend " + btcDir + " · ETH 4H trend " + ethTr.dir + " · BTC dominance " + (state.cgGlobal ? state.cgGlobal.dom.toFixed(1) + "%" : "n/a") + " · Total market cap " + (state.cgGlobal ? fmtMoney(state.cgGlobal.mcap) : "n/a"))); }
      P.push(fwItem("G8 · Priority 8 — BTC & Market", "21. Market Sentiment", 1.5,
        state.fng ? ((state.fng.value <= 25 && isLong) || (state.fng.value >= 75 && !isLong) ? "na" : "pass") : "na",
        state.fng ? "Fear & Greed " + state.fng.value + " (" + state.fng.label + ")" + (state.fng.value <= 20 ? " — extreme fear: bounce possible, but catching knives is risky" : state.fng.value >= 80 ? " — extreme greed: late longs get punished" : "") + " · Crowd positioning: " + (lsG !== null ? "accounts ratio " + lsG.toFixed(2) : "n/a") : "Fear & Greed feed unavailable right now"));
      // Fundamentals / News / Unlocks — informational, honest N/A
      var cg = ctx.cg;
      P.push(fwItem("Info — Fundamentals", "22. Fundamental Analysis", 0, "na",
        cg ? "CoinGecko: market cap " + fmtMoney(cg.market_cap || 0) + " · Rank #" + (cg.market_cap_rank || "—") + " · Circulating supply " + (cg.circulating_supply ? Number(cg.circulating_supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a") + " · Total supply " + (cg.total_supply ? Number(cg.total_supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a") + (cg.max_supply ? " · Max supply " + Number(cg.max_supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : " · Max supply: none (inflationary)") : "CoinGecko supply data not loaded for this coin — shown as unknown, never guessed"));
      P.push(fwItem("Info — News & Events", "23. News & Events", 0, "na", "No verified news found — no keyless live news feed is available, so no headlines, listing or partnership claims are invented. Check Binance announcements in the app before trading a news-driven coin."));
      P.push(fwItem("Info — Token Unlocks", "24. Token Unlocks & Supply Changes", 0, "na",
        cg ? "Circulating supply (CoinGecko): " + (cg.circulating_supply ? Number(cg.circulating_supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a") + " of " + (cg.total_supply ? Number(cg.total_supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a") + " total (" + (cg.circulating_supply && cg.total_supply ? (cg.circulating_supply / cg.total_supply * 100).toFixed(0) + "% unlocked" : "ratio n/a") + ") · Upcoming unlock schedule: no verified live source available — a large unlock near your trade is a real risk, verify it before entering" : "No verified live unlock/supply source available for this coin"));
      P.push(fwItem("G8 · Priority 8 — BTC & Market", "25. Correlation Analysis", 1.5, "na",
        corr !== null ? "Correlation with BTC (1H returns): " + corr.toFixed(2) + (Math.abs(corr) > 0.7 ? " — this coin moves with BTC; the BTC check above matters a lot" : Math.abs(corr) > 0.35 ? " — moderate link to BTC" : " — largely independent of BTC right now") : "Correlation needs BTC candle history — unavailable for this coin"));
      // G10 — Execution (1.5), Fees (1), R/R (2.5)
      var slipTxt = "Spread " + (depthInfo && depthInfo.spreadBps !== null ? depthInfo.spreadBps.toFixed(1) + " bps" : "n/a") + " · Depth within 1%: " + (depthInfo ? fmtMoney(depthInfo.bidSum + depthInfo.askSum) : "n/a") + " · Your position is $" + setup.posSize.toFixed(0);
      var slipOk = depthInfo ? (depthInfo.spreadBps !== null && depthInfo.spreadBps < 15 && (depthInfo.bidSum + depthInfo.askSum) > setup.posSize * 20) : null;
      P.push(fwItem("G10 · Priority 10 — Risk, Reward & Execution", "26. Liquidity & Execution Risk", 1.5, slipOk === null ? "na" : slipOk ? "pass" : "fail", slipTxt + (slipOk === false ? " — thin book / wide spread for your size, slippage can eat the edge" : slipOk ? " — book is deep enough for your size" : "")));
      var feePct = 0.05 * 2; // round-trip taker approx
      var fundingCost = funding !== null ? Math.abs(funding) / 100 * setup.posSize : null;
      P.push(fwItem("G10 · Priority 10 — Risk, Reward & Execution", "27. Trading Fees & Funding Costs", 1,
        (feePct / (setup.tpR[0] * setup.slPct) * 100) < 25 ? "pass" : "fail",
        "Binance futures standard fees ≈ 0.02% maker / 0.05% taker — a round trip at taker ≈ " + feePct.toFixed(2) + "% of position ($" + (setup.posSize * feePct / 100).toFixed(2) + ")" + (fundingCost !== null ? " · One funding payment on this position ≈ $" + fundingCost.toFixed(2) : "") + " · Fees are small vs the TP1 distance: " + (feePct / (setup.tpR[0] * setup.slPct) * 100).toFixed(0) + "% of the TP1 move"));
      // G2 — Entry Confirmation (2)
      var entryOk = bosDir === B || (pat.dir && pat.dir === B) || (isLong && distSup < 1.1 && taker15 > 52) || (!isLong && distRes < 1.1 && taker15 < 48);
      P.push(fwItem("G2 · Priority 2 — Liquidity & Price Action", "28. Entry Confirmation", 2, entryOk ? "pass" : "na",
        bosDir === B ? "Breakout confirmed in the trade direction (swing break with the move)" : pat.dir === B ? "Candlestick confirmation present: " + pat.name : "No clean breakout/retest/rejection trigger yet — the setup is a zone watch, enter only on confirmation inside the entry zone"));
      // G10 — R/R (2.5)
      P.push(fwItem("G10 · Priority 10 — Risk, Reward & Execution", "29. Risk / Reward Analysis", 2.5,
        setup.tpR[1] >= 1.8 ? "pass" : "fail",
        "Risk $" + setup.riskUsd.toFixed(2) + " (" + settings.riskPct + "% of $" + settings.capital + ") · TP1 1:" + setup.tpR[0].toFixed(1) + " (+$" + (setup.riskUsd * setup.tpR[0]).toFixed(2) + ") · TP2 1:" + setup.tpR[1].toFixed(1) + " (+$" + (setup.riskUsd * setup.tpR[1]).toFixed(2) + ") · TP3 1:" + setup.tpR[2].toFixed(1) + " (+$" + (setup.riskUsd * setup.tpR[2]).toFixed(2) + ")" + (setup.capped ? " · Targets capped by the nearest wall" : "")));
      // Trade Invalidation — informational, always defined
      var invalidation = "Invalidation: the " + dir + " idea is WRONG if a 1H candle closes " + (isLong ? "below $" + fmtP(setup.sl) : "above $" + fmtP(setup.sl)) + " (the stop loss) or if BTC breaks " + (isLong ? "down" : "up") + " against the position. Exit without negotiation at the stop — do not widen it.";
      P.push(fwItem("Info — Invalidation", "30. Trade Invalidation", 0, "pass", invalidation));

      /* --- Weighted score + confluence rule --- */
      var wSum = 0, wGot = 0, passes = 0, applicable = 0;
      var groups = {};
      P.forEach(function(p){
        if (p.weight > 0 && p.status !== "na"){ wSum += p.weight; if (p.status === "pass"){ wGot += p.weight; passes++; } applicable++; }
        else if (p.weight > 0){ /* na excluded */ }
        var g = p.group.split(" · ")[0];
        if (!groups[g]) groups[g] = { pass: 0, fail: 0, label: p.group };
        if (p.status === "pass") groups[g].pass++;
        if (p.status === "fail") groups[g].fail++;
      });
      var weighted = wSum ? Math.round(wGot / wSum * 100) : 0;
      var agree = [], disagree = [];
      Object.keys(groups).forEach(function(g){
        if (!/^G\d+$/.test(g)) return;
        var gr = groups[g];
        if (gr.pass > gr.fail) agree.push(gr.label.replace(/^G\d+ · /, ""));
        else if (gr.fail > gr.pass) disagree.push(gr.label.replace(/^G\d+ · /, ""));
      });
      var conflicts = [];
      var g1 = P[0];
      if (g1.status === "fail") conflicts.push("Priority 1 (Market Structure & Trend) is AGAINST the " + dir + " idea");
      ["G2", "G3", "G4"].forEach(function(g){
        if (groups[g] && groups[g].fail > groups[g].pass) conflicts.push(groups[g].label.replace(/^G\d+ · /, "") + " disagrees (more fails than passes)");
      });
      if (groups["G1"] && groups["G2"] && groups["G1"].pass > groups["G1"].fail && groups["G2"].fail > groups["G2"].pass) conflicts.push("Structure says go, but Liquidity & Price Action says no — top priorities conflict");
      var margin = Math.abs(L - S);
      var cfg = modeCfg();
      var confluenceOk = conflicts.length === 0;
      var tradeable = confluenceOk && weighted >= cfg.minConf && margin >= 12;
      if (!confluenceOk) conflicts.forEach(function(c){ /* listed as reasons */ });
      var failReasons = conflicts.slice();
      P.filter(function(p){ return p.status === "fail" && p.weight >= 4; }).forEach(function(p){ failReasons.push(p.label + " failed"); });
      return { symbol: symbol, base: symbol.replace(/USDT$/, ""), price: price, change: change, qVol: qVol,
        longScore: L, shortScore: S, dir: dir, conf: weighted, tradeable: tradeable,
        passes: passes, applicable: applicable, checks: P, setup: setup, kl1: kl1, kl15: kl15, kl4: kl4,
        support: swingLow, resistance: swingHigh, rsi1: rsi1, volRatio: volRatio,
        framework: { score: weighted, agree: agree, disagree: disagree, conflicts: conflicts, invalidation: invalidation },
        failReasons: failReasons, ctx: ctx };
    }

    /* Override the scan's analyzer with the framework engine */
    analyzeCandidate = async function(t, btcDir){
      var ctx = await gatherContext(t.symbol, t, false);
      return buildFramework(ctx);
    };

    /* ================= Framework summary block (signal cards) ================= */
    function frameworkHTML(r){
      if (!r.framework) return "";
      var f = r.framework;
      var h = '<div style="padding:13px 16px 4px;"><div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:baseline;">'
        + '<b>AI Framework — Weighted Score</b><span class="mono" style="font-weight:800; font-size:1.15rem; color:' + confColor(f.score) + '">' + f.score + ' / 100</span></div>'
        + '<div class="meter"><i style="width:' + f.score + '%; background:' + confColor(f.score) + '"></i></div>';
      if (f.agree.length) h += '<p class="small" style="margin-top:9px;"><span style="color:var(--long); font-weight:800;">AGREEING (top priorities):</span> <span class="muted">' + esc(f.agree.join(" · ")) + "</span></p>";
      if (f.disagree.length) h += '<p class="small" style="margin-top:4px;"><span style="color:var(--short); font-weight:800;">DISAGREEING:</span> <span class="muted">' + esc(f.disagree.join(" · ")) + "</span></p>";
      if (f.conflicts.length) h += '<p class="small" style="margin-top:4px;"><span style="color:var(--gold); font-weight:800;">CONFLICTS:</span> <span class="muted">' + esc(f.conflicts.join(" · ")) + "</span></p>";
      h += '<p class="small" style="margin-top:8px; background:var(--chip); border-radius:9px; padding:9px 11px;"><b>Trade Invalidation:</b> <span class="muted">' + esc(f.invalidation) + "</span></p></div>";
      return h;
    }


    /* ================= All-in-One: decision hero + plain sections ================= */
    function plainLineFor(r){
      if (!r) return "";
      if (r.tradeable && r.dir === "LONG") return r.base + " looks strong — trend, momentum and volume agree for a LONG. Use the setup below and always keep the stop loss.";
      if (r.tradeable && r.dir === "SHORT") return r.base + " looks weak — trend, momentum and volume agree for a SHORT. Use the setup below and always keep the stop loss.";
      var why = (r.failReasons && r.failReasons.length) ? r.failReasons.slice(0,2).join("; ") : "not enough confirmations agree";
      return "No clear trade on " + r.base + " right now — " + why + ". Waiting protects your $200 better than forcing a trade.";
    }
    function renderDecisionHero(r){
      if (!r) return;
      var w = $("decisionWord"), line = $("decisionLine");
      var bl = $("buyLongBtn"), ss = $("sellShortBtn");
      if (!w) return;
      var hero = $("decisionHero");
      if (r.tradeable && r.dir === "LONG"){ w.textContent = "LONG"; w.className = "decision-word long"; if(bl) bl.classList.remove("dim"); if(ss) ss.classList.add("dim"); }
      else if (r.tradeable && r.dir === "SHORT"){ w.textContent = "SHORT"; w.className = "decision-word short"; if(ss) ss.classList.remove("dim"); if(bl) bl.classList.add("dim"); }
      else { w.textContent = "NO TRADE"; w.className = "decision-word wait"; if(bl) bl.classList.add("dim"); if(ss) ss.classList.add("dim"); }
      if (line) line.textContent = plainLineFor(r) + " Confidence " + r.conf + "% · " + r.passes + "/" + r.applicable + " confirmations · Price $" + fmtP(r.price) + " (" + fmtPct(r.change) + " 24h).";
      if (hero) hero.style.borderColor = r.tradeable ? (r.dir === "LONG" ? "var(--long)" : "var(--short)") : "var(--line)";
    }
    function findPart(r, needle){
      if (!r || !r.checks) return null;
      for (var i=0;i<r.checks.length;i++){ if (r.checks[i].label.toLowerCase().indexOf(needle) >= 0) return r.checks[i]; }
      return null;
    }
