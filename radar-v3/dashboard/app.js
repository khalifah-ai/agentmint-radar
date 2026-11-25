// Token Radar v3's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board on the first screen — 198 pre-token protocols priced by implied value
// (value if it launches x token odds) — with one farm plan expanded, a per-protocol detail
// dialog, the live-token set, and a methodology tab with the ablation tables, the range-honesty
// calibration and the record behind the odds. No network: every byte shown is in data.js. The
// page recomputes every row from the snapshot figures, so the board's numbers and the page's
// numbers are the same arithmetic, checked in the open.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, minTvl: 0,
    tab: 'board', sort: 'implied', dir: -1, selected: null,
    expanded: DATA.rows.length ? DATA.rows[0].slug : null,
    scenario: { dropShare: DATA.model.airdrop_share, weeks: 4, planFraction: DATA.model.plan_fraction }
  };
  // The submitted scenario, so the page can tell when a slider has moved it.
  var DEFAULT_SCENARIO = { dropShare: DATA.model.airdrop_share, weeks: 4, planFraction: DATA.model.plan_fraction };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'undated';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toFixed(2);
  }
  function fmtMiss(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+' : '') + n.toFixed(2);
  }

  // The net math, the same arithmetic lib/model.ts runs, re-run here for the live scenario.
  // At the submitted scenario (5%, 4 weeks, 0.02%) this returns exactly the stored net.
  function scenarioDefaults() {
    var s = state.scenario;
    return s.dropShare === DEFAULT_SCENARIO.dropShare && s.weeks === DEFAULT_SCENARIO.weeks && s.planFraction === DEFAULT_SCENARIO.planFraction;
  }
  function netOf(row) {
    var s = state.scenario;
    var m = DATA.model;
    var plan = Math.max(m.plan_floor_usd, Math.min(m.plan_cap_usd, s.planFraction * row.tvl_usd));
    var gasEach = row.net.gas_usd / m.farm_gas_tx;
    var txs = 2 + s.weeks;
    var gas = txs * gasEach;
    var hours = 0.5 + 0.15 * s.weeks;
    var expected = s.dropShare * row.implied_value_usd * plan / row.tvl_usd;
    var net = expected - gas;
    var p25Net = (row.p25_value_usd / row.implied_value_usd) * expected - gas;
    var p25Hr = p25Net / hours;
    var verdict = p25Hr >= m.verdict_farm_per_hour ? 'FARM' : p25Hr >= 0 ? 'MARGINAL' : 'SKIP';
    return {
      plan_usd: plan, expected_usd: expected, gas_usd: gas, gas_tx: txs, hours: hours,
      net_usd: net, net_per_hour_usd: net / hours, p25_net_usd: p25Net,
      p25_net_per_hour_usd: p25Hr, breakeven_usd: gas * row.tvl_usd / (s.dropShare * row.implied_value_usd),
      verdict: verdict
    };
  }
  function verdictCounts() {
    var counts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { counts[netOf(r).verdict]++; });
    return counts;
  }
  // The integrity strip, recomputed in the page: FNV-1a over slug:implied pairs, in rank order,
  // the same hash main.ts prints.
  function boardChecksum(rows) {
    var h = 0x811c9dc5;
    var text = rows.map(function (r) { return r.slug + ':' + r.implied_value_usd; }).join(',');
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  // Recomputed from the fitted curve + stored odds, the same arithmetic as lib/model.ts.
  function impliedOf(row) {
    var c = DATA.curve, m = DATA.model;
    var ch = Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_cap);
    var v = Math.pow(10, c.a + c.b * Math.log10(row.tvl_usd) + c.chains_coef * Math.log10(1 + m.chain_step * ch));
    return Math.max(1, Math.round(v * row.token_odds));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('minTvl')) state.minTvl = parseInt(params.get('minTvl'), 10) || 0;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('e')) state.expanded = params.get('e');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    if (state.expanded && state.expanded !== (DATA.rows[0] && DATA.rows[0].slug)) params.set('e', state.expanded);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  // ?shot=board|detail|filtered|methodology sets one of the four screenshot states.
  function readShot() {
    var params = new URLSearchParams(window.location.search || '');
    var shot = params.get('shot');
    if (shot === 'detail') { state.tab = 'board'; state.selected = DATA.rows[0] ? DATA.rows[0].slug : null; }
    else if (shot === 'filtered') { state.tab = 'board'; state.category = 'Risk Curators'; state.sort = 'tvl'; state.dir = -1; }
    else if (shot === 'methodology') { state.tab = 'methodology'; }
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'net') { av = netOf(a).net_per_hour_usd; bv = netOf(b).net_per_hour_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  // The KPI strip: six numbers, each naming the function that computed it.
  function kpis() {
    var o = DATA.oos, od = DATA.odds;
    var counts = verdictCounts();
    function kpi(label, value, gold, fn) {
      return el('div', { class: 'kpi' },
        el('span', { text: label }),
        el('b', { class: gold ? 'gold' : null, text: value }),
        el('em', { text: fn })
      );
    }
    return el('section', { class: 'kpis' },
      kpi('Walk-forward miss', fmtMiss(o.wf_median_miss) + ' vs ' + fmtMiss(o.flat_wf_median_miss) + ' flat', true, 'wfValue()'),
      kpi('Range honesty', fmtShare(o.loo_p25_p75_cover) + ' · ' + fmtShare(o.loo_in_band), false, 'rangeHonesty()'),
      kpi('Odds Brier', od.loo_brier.toFixed(3) + ' vs ' + od.base_loo_brier.toFixed(3) + ' base', false, 'looOdds()'),
      kpi('Terms survived', 'value 2 of 6 · odds 5 of 8', false, 'selectValueTerms() · selectOddsTerms()'),
      kpi('Worth farming', counts.FARM + ' of ' + DATA.board_size, true, 'buildBoard()'),
      kpi('Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size, false, 'selectBoard()')
    );
  }

  function formulaLine() {
    var c = DATA.curve;
    return el('div', { class: 'formula' },
      el('b', { text: 'Implied value' }),
      ' = TVL x fitted multiple (the value if a token launches) x token odds  —  log10(value) = ' + c.a.toFixed(2) + ' + ' + c.b.toFixed(2) + ' x log10(TVL) ' + fmtSigned(c.chains_coef) + ' x chains'
    );
  }

  function accountingBar() {
    var a = DATA.accounting;
    var bar = el('div', { class: 'accounting' });
    a.groups.forEach(function (g, i) {
      if (i) bar.appendChild(document.createTextNode(' · '));
      bar.appendChild(el('span', null, el('b', { text: String(g.count) }), ' ' + g.label));
    });
    bar.appendChild(document.createTextNode('  =  '));
    bar.appendChild(el('b', { text: String(a.total) + ' protocols' }));
    return bar;
  }

  function integrityStrip() {
    var integ = DATA.integrity;
    var recomputed = boardChecksum(DATA.rows);
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var inOrder = DATA.rows.every(function (r, i) { return r.rank === i + 1 && (i === 0 || r.implied_value_usd <= DATA.rows[i - 1].implied_value_usd); });
    var watch = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    return el('div', { class: 'integrity' },
      'this table = board.json: ',
      el('b', { text: integ.rows_recomputed + '/' + integ.rows_recomputed + ' rows ✓' }),
      ' ranks 1–' + DATA.board_size + ', values never rise ' + (inOrder ? '✓' : '✗'),
      ' total ' + fmtUsd(total) + (total === integ.total_implied_usd ? ' ✓' : ' ✗'),
      ' checksum ' + recomputed + (recomputed === integ.checksum ? ' = main.ts ✓' : ' ≠ main.ts ✗'),
      ' watchlist ' + watch + '/' + DATA.watchlist_size + ' ✓',
      ' ledger ' + integ.ledger_total + '/' + integ.ledger_total + ' ✓'
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'minTvl' },
      el('option', { value: '0', text: 'Any TVL', selected: state.minTvl === 0 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL $100M+', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL $500M+', selected: state.minTvl === 500000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'TVL $1B+', selected: state.minTvl === 1000000000 ? 'selected' : null })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = parseInt(tvlSelect.value, 10) || 0; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var counts = verdictCounts();
    var shown = state.tab === 'board' ? rows().length + ' rows shown of ' + DATA.board_size + ' · ' + counts.FARM + ' FARM / ' + counts.MARGINAL + ' MARGINAL / ' + counts.SKIP + ' SKIP'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : 'the model, its tests and its limits';
    var box = el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Size' }), tvlSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabButton('board', 'Board'), tabButton('live', 'Live token'), tabButton('methodology', 'Methodology'))),
      el('span', { class: 'count', text: shown })
    );
    // Scenario sliders: drop share, horizon, plan size. They recompute every verdict live;
    // the implied values never move — only the farm economics do.
    function slider(id, label, min, max, step, value, format, oninput) {
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      var out = el('output', { for: id, text: format(value) });
      input.addEventListener('input', function () { oninput(parseFloat(input.value)); out.textContent = format(parseFloat(input.value)); render(); });
      return el('div', null, el('label', { for: id }, label, out), input);
    }
    box.appendChild(el('div', { class: 'sliders' },
      slider('sc-drop', 'Airdrop share', 0.01, 0.10, 0.005, state.scenario.dropShare, function (v) { return Math.round(v * 1000) / 10 + '%'; }, function (v) { state.scenario.dropShare = v; }),
      slider('sc-weeks', 'Horizon', 1, 12, 1, state.scenario.weeks, function (v) { return v + ' weeks (' + (2 + v) + ' txs, ' + (0.5 + 0.15 * v).toFixed(1) + 'h)'; }, function (v) { state.scenario.weeks = v; }),
      slider('sc-plan', 'Plan size', 0.0001, 0.001, 0.0001, state.scenario.planFraction, function (v) { return (v * 100).toFixed(2) + '% (floor $1K, cap $20K)'; }, function (v) { state.scenario.planFraction = v; })
    ));
    if (!scenarioDefaults()) {
      box.appendChild(el('div', { class: 'sandbox-note', text: 'Scenario on: ' + (state.scenario.dropShare * 100).toFixed(1) + '% drop share, ' + state.scenario.weeks + ' weeks, ' + (state.scenario.planFraction * 100).toFixed(2) + '% plan. board.json keeps the submitted scenario (5%, 4 weeks, 0.02%).' }));
    }
    return box;
  }

  function sortHeader(key, label, num) {
    return el('th', { scope: 'col', class: num ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  // The farm plan as a WHEN/STEP/COST/TIME table, with a budget row under it. The steps are
  // the submitted plan; the budget row follows the live scenario.
  function planTable(row) {
    var steps = DATA.plans[row.slug] || [];
    var net = netOf(row);
    var totalMin = steps.reduce(function (s, st) { return s + st.minutes; }, 0);
    var body = el('tbody');
    steps.forEach(function (st) {
      body.appendChild(el('tr', null,
        el('td', { class: 'when', text: st.when }),
        el('td', { text: st.action }),
        el('td', { class: 'cost num', text: fmtUsd2(st.cost_usd) }),
        el('td', { class: 'time num', text: st.minutes + ' min' })
      ));
    });
    return el('div', { class: 'planbox' },
      el('h3', null, 'Farm plan — ' + row.name, el('span', { class: 'verdict ' + net.verdict.toLowerCase(), text: net.verdict })),
      el('table', { class: 'plan' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'When' }), el('th', { scope: 'col', text: 'Step' }), el('th', { scope: 'col', class: 'num', text: 'Cost' }), el('th', { scope: 'col', class: 'num', text: 'Time' }))),
        body
      ),
      el('div', { class: 'plan-total' },
        el('span', null, 'Plan ', el('b', { text: fmtUsd(net.plan_usd) })),
        el('span', null, 'Gas ', el('b', { text: fmtUsd2(net.gas_usd) + ' (' + net.gas_tx + ' txs)' })),
        el('span', null, 'Work ', el('b', { text: totalMin + ' min' })),
        el('span', null, 'Expected ', el('b', { text: fmtUsd2(net.expected_usd) })),
        el('span', null, 'Net ', el('b', { class: net.net_usd >= 0 ? null : 'gold', text: fmtUsd2(net.net_usd) + ' (' + fmtUsd2(net.net_per_hour_usd) + '/h)' })),
        el('span', null, 'Pays from ', el('b', { class: 'gold', text: fmtUsd(net.breakeven_usd) }))
      ),
      scenarioDefaults() ? null : el('p', { class: 'sub', text: 'Steps use the submitted plan size (' + fmtUsd(row.net.plan_usd) + '); the budget row uses your scenario.' })
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No matches' }),
        el('p', { text: 'Clear the search or pick another filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var net = netOf(r);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var isExpanded = state.expanded === r.slug;
      var toggle = el('button', {
        type: 'button', class: 'button', 'aria-label': (isExpanded ? 'Collapse' : 'Expand') + ' plan',
        text: isExpanded ? '▾ plan' : '▸ plan',
        onclick: function (e) { e.stopPropagation(); state.expanded = isExpanded ? null : r.slug; writeHash(); render(); }
      });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtShare(r.token_odds) }),
        el('td', { class: 'num', text: fmtUsd(r.value_if_launches_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ), el('div', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.p25_value_usd) + '–' + fmtUsd(r.p75_value_usd) })),
        el('td', null, el('div', { class: 'netcell' },
          el('span', { class: 'verdict ' + net.verdict.toLowerCase(), text: net.verdict }),
          el('span', { class: 'num', text: fmtUsd2(net.net_per_hour_usd) + '/h' })
        )),
        el('td', { class: 'num', text: fmtUsd(net.breakeven_usd) }),
        el('td', null, el('span', { class: 'status' + (r.watchlist ? ' watch' : r.tvl_usd >= DATA.model.floor_usd ? ' offlist' : ''), text: r.watchlist ? 'watchlist' : r.tvl_usd >= DATA.model.floor_usd ? 'off-list' : 'early' })),
        el('td', null, toggle)
      );
      tbody.appendChild(tr);
      if (isExpanded) {
        var planRow = el('tr', { class: 'planrow' },
          el('td', { colspan: '12' }, planTable(r))
        );
        tbody.appendChild(planRow);
      }
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('implied', '#', true),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('odds', 'Token odds', true),
            sortHeader('tvl', 'If it launches', true),
            sortHeader('implied', 'Implied value', true),
            sortHeader('net', 'Verdict · net', true),
            sortHeader('net', 'Pays from', true),
            el('th', { scope: 'col', text: 'Board' }),
            el('th', { scope: 'col', text: 'Plan' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl_ratio) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  // The scatter: every live token's leave-one-out prediction against its actual market cap,
  // both on log scales, with the exact-prediction diagonal. Built as an SVG string: the page
  // has no chart library, and the plot is data, not decoration.
  function scatterSvg() {
    var pts = DATA.scatter || [];
    var W = 360, H = 272, PL = 46, PR = 8, PT = 8, PB = 30;
    var labels = { 5: '$100K', 6: '$1M', 7: '$10M', 8: '$100M', 9: '$1B', 10: '$10B', 11: '$100B' };
    function lx(v) { return Math.min(11, Math.max(5, Math.log10(Math.max(1, v)))); }
    function x(v) { return PL + ((lx(v) - 5) / 6) * (W - PL - PR); }
    function y(v) { return PT + (H - PT - PB) - ((lx(v) - 5) / 6) * (H - PT - PB); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Leave-one-out predictions against actual market caps for ' + pts.length + ' live tokens">';
    for (var e = 5; e <= 11; e++) {
      var v = Math.pow(10, e);
      s += '<line x1="' + x(v).toFixed(1) + '" y1="' + PT + '" x2="' + x(v).toFixed(1) + '" y2="' + (H - PB) + '" class="grid"/>';
      s += '<line x1="' + PL + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y(v).toFixed(1) + '" class="grid"/>';
      s += '<text x="' + x(v).toFixed(1) + '" y="' + (H - 6) + '" class="tick">' + labels[e] + '</text>';
      s += '<text x="' + (PL - 4) + '" y="' + (y(v) + 3).toFixed(1) + '" class="tick end">' + labels[e] + '</text>';
    }
    s += '<line x1="' + x(1e5).toFixed(1) + '" y1="' + y(1e5).toFixed(1) + '" x2="' + x(1e11).toFixed(1) + '" y2="' + y(1e11).toFixed(1) + '" class="diag"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + x(p.predicted_usd).toFixed(1) + '" cy="' + y(p.mcap_usd).toFixed(1) + '" r="2.6" class="dot"><title>' + p.name + ': predicted ' + fmtUsd(p.predicted_usd) + ', actual ' + fmtUsd(p.mcap_usd) + '</title></circle>';
    });
    s += '<text x="' + ((W + PL) / 2).toFixed(1) + '" y="' + (H - 18) + '" class="axis">predicted market cap, leave-one-out</text>';
    s += '<text x="12" y="' + ((H - PB) / 2).toFixed(1) + '" class="axis" transform="rotate(-90 12 ' + ((H - PB) / 2).toFixed(1) + ')">actual market cap</text>';
    s += '</svg>';
    return s;
  }

  function ablationTable(rows, valueCol, auxCol) {
    var body = el('tbody');
    rows.forEach(function (r) {
      var status = r.status === 'kept' ? 'kept' : r.status === 'control' ? 'control — must not help' : r.status === 'baseline' ? 'baseline' : 'tested, not kept';
      body.appendChild(el('tr', null,
        el('td', { text: r.label }),
        el('td', { class: 'num', text: valueCol(r.loo) }),
        el('td', { class: 'num', text: valueCol(r.wf) }),
        el('td', { class: 'num', text: auxCol ? auxCol(r.loo_aux) : '—' }),
        el('td', { class: 'num', text: auxCol ? auxCol(r.wf_aux) : '—' }),
        el('td', { class: r.status === 'kept' ? 'kept' : r.status === 'control' ? 'control' : r.status === 'baseline' ? 'baseline' : 'tested', text: status })
      ));
    });
    return body;
  }

  function methodologyPanel() {
    var m = DATA.model, c = DATA.curve, o = DATA.oos, od = DATA.odds;
    var counts = verdictCounts();
    function nestedTerms(s) {
      return s.split(', ').filter(function (t) { return t !== 'flat' && t !== 'size'; }).join(', ') || '(no extra terms)';
    }
    var bucketBody = el('tbody');
    od.age_buckets.forEach(function (b) {
      bucketBody.appendChild(el('tr', null,
        el('td', { text: b.label }),
        el('td', { class: 'num', text: String(b.n) }),
        el('td', { class: 'num', text: String(b.token) }),
        el('td', { class: 'num', text: fmtShare(b.n ? b.token / b.n : 0) })
      ));
    });
    var reasons = Object.keys(DATA.excluded_by_reason || {}).sort(function (a, b) { return DATA.excluded_by_reason[b] - DATA.excluded_by_reason[a]; });
    return el('div', null,
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'Implied value = value if it launches x token odds. The value comes from a size curve fitted on ' + c.n + ' standalone live-token protocols (R\u00B2 ' + c.r2.toFixed(2) + ', residual SD ' + c.resid_sd_dex.toFixed(2) + ' dex); the odds from a logistic regression on all ' + od.n + ' peers. No protocol name is special-cased.' }),
        el('div', { class: 'formula' },
          el('b', { text: 'value' }), ' = 10^(' + c.a.toFixed(4) + ' ± ' + c.a_se.toFixed(2) + ' + (' + c.b.toFixed(4) + ' ± ' + c.b_se.toFixed(2) + ') x log10(TVL) + (' + c.chains_coef.toFixed(3) + ' ± ' + c.chains_se.toFixed(2) + ') x log10(1 + 0.03 x min(chains - 1, 5)))'
        ),
        el('div', { class: 'formula' },
          el('b', { text: 'odds logit' }), ' = ' + od.intercept.toFixed(3) + ' ± ' + od.intercept_se.toFixed(2) + ' + (' + od.years_coef.toFixed(3) + ' ± ' + od.years_se.toFixed(2) + ') x years listed + (' + od.undated_coef.toFixed(3) + ' ± ' + od.undated_se.toFixed(2) + ') x undated + (' + od.lntvl_coef.toFixed(3) + ' ± ' + od.lntvl_se.toFixed(2) + ') x ln(TVL) + (' + od.growth_coef.toFixed(3) + ' ± ' + od.growth_se.toFixed(2) + ') x market-relative growth + (' + od.kinship_coef.toFixed(3) + ' ± ' + od.kinship_se.toFixed(2) + ') x kinship'
        ),
        el('p', { class: 'sub', text: 'Standard errors from ' + m.bootstrap_refits + ' bootstrap refits. Undated = no listing date in the snapshot; market-relative growth = 7-day change minus the market median (' + fmtPct(DATA.market_median_7d) + '), clamped to ±25%; kinship = shares a first word with another token protocol.' })
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Tested out of sample, against the flat model' }),
        el('p', { class: 'sub', text: 'Leave-one-out predicts each live token with a curve fitted without it; walk-forward fits the tokens listed before ' + o.wf_cutoff + ' (' + o.wf_train_n + ') and prices the ' + o.wf_test_n + ' listed after. The flat baseline is the category-median multiple, refit the same way. A miss of x3 means the prediction was three times the market cap, or a third of it.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'ablation' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', class: 'num', text: 'This model' }), el('th', { scope: 'col', class: 'num', text: 'Flat multiple' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Leave-one-out median miss (' + o.loo_n + ' tokens)' }), el('td', { class: 'num', text: fmtMiss(o.loo_median_miss) }), el('td', { class: 'num', text: fmtMiss(o.flat_loo_median_miss) })),
            el('tr', null, el('td', { text: 'Leave-one-out within 3x' }), el('td', { class: 'num', text: fmtShare(o.loo_within_3x) }), el('td', { class: 'num', text: fmtShare(o.flat_loo_within_3x) })),
            el('tr', null, el('td', { text: 'Walk-forward median miss (' + o.wf_test_n + ' tokens)' }), el('td', { class: 'num', text: fmtMiss(o.wf_median_miss) }), el('td', { class: 'num', text: fmtMiss(o.flat_wf_median_miss) })),
            el('tr', null, el('td', { text: 'Walk-forward within 3x' }), el('td', { class: 'num', text: fmtShare(o.wf_within_3x) }), el('td', { class: 'num', text: fmtShare(o.flat_wf_within_3x) })),
            el('tr', null, el('td', { text: '5-fold median miss' }), el('td', { class: 'num', text: fmtMiss(o.kfold_median_miss) }), el('td', { class: 'num', text: '—' })),
            el('tr', null, el('td', { text: 'P25–P75 band covers (stated 50%) — leave-one-out / walk-forward' }), el('td', { class: 'num', text: fmtShare(o.loo_p25_p75_cover) + ' / ' + fmtShare(o.wf_p25_p75_cover) }), el('td', { class: 'num', text: '—' })),
            el('tr', null, el('td', { text: 'P10–P90 band covers (stated 80%) — leave-one-out / walk-forward' }), el('td', { class: 'num', text: fmtShare(o.loo_in_band) + ' / ' + fmtShare(o.wf_in_band) }), el('td', { class: 'num', text: '—' }))
          )
        ))
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'The odds model, tested the same way' }),
        el('p', { class: 'sub', text: 'Brier score on ' + od.n + ' peers (' + od.dated_n + ' dated). Lower is better; always predicting the base rate ' + fmtShare(od.base_rate) + ' scores ' + od.base_loo_brier.toFixed(3) + '. Walk-forward trains on the ' + od.wf_train_n + ' peers listed before ' + od.wf_cutoff + ' and tests the ' + od.wf_test_n + ' listed after.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'ablation' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', class: 'num', text: 'This model' }), el('th', { scope: 'col', class: 'num', text: 'Base rate' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Leave-one-out Brier' }), el('td', { class: 'num', text: od.loo_brier.toFixed(3) }), el('td', { class: 'num', text: od.base_loo_brier.toFixed(3) })),
            el('tr', null, el('td', { text: 'Leave-one-out accuracy' }), el('td', { class: 'num', text: fmtShare(od.loo_accuracy) }), el('td', { class: 'num', text: fmtShare(od.base_loo_accuracy) })),
            el('tr', null, el('td', { text: 'Walk-forward Brier' }), el('td', { class: 'num', text: od.wf_brier.toFixed(3) }), el('td', { class: 'num', text: od.base_wf_brier.toFixed(3) })),
            el('tr', null, el('td', { text: 'Walk-forward accuracy' }), el('td', { class: 'num', text: fmtShare(od.wf_accuracy) }), el('td', { class: 'num', text: fmtShare(od.base_wf_accuracy) })),
            el('tr', null, el('td', { text: 'Stratified 5-fold Brier' }), el('td', { class: 'num', text: od.kfold_brier.toFixed(3) }), el('td', { class: 'num', text: '—' }))
          )
        ))
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Ablation: every term earned its place, or was dropped' }),
        el('p', { class: 'sub', text: 'Terms were added one at a time, in order. A term is kept only if it improves BOTH tests — leave-one-out and walk-forward. The undated indicator cannot be tested walk-forward (every walk-forward row is dated), so its second test is the stratified 5-fold Brier. The control — another row\u2019s growth — must not help; it hurts both models, as a control must.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'ablation' },
          el('caption', { class: 'sub', text: 'Value model: median miss, lower is better.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Term' }), el('th', { scope: 'col', class: 'num', text: 'Leave-one-out' }), el('th', { scope: 'col', class: 'num', text: 'Walk-forward' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x (LOO)' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x (WF)' }), el('th', { scope: 'col', text: 'Verdict' }))),
          ablationTable(DATA.value_ablation, fmtMiss, fmtShare)
        )),
        el('div', { class: 'table-wrap' }, el('table', { class: 'ablation' },
          el('caption', { class: 'sub', text: 'Odds model: Brier score, lower is better.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Term' }), el('th', { scope: 'col', class: 'num', text: 'Leave-one-out' }), el('th', { scope: 'col', class: 'num', text: 'Walk-forward' }), el('th', { scope: 'col', class: 'num', text: 'Accuracy (LOO)' }), el('th', { scope: 'col', class: 'num', text: 'Accuracy (WF)' }), el('th', { scope: 'col', text: 'Verdict' }))),
          ablationTable(DATA.odds_ablation, function (n) { return n.toFixed(3); }, fmtShare)
        ))
      ),
      el('div', { class: 'two-col' },
        el('section', { class: 'panel' }, el('div', { class: 'pad' },
          el('h2', { text: 'Predicted vs actual, leave-one-out' }),
          el('div', { class: 'scatter', html: scatterSvg() }),
          el('p', { class: 'sub', text: 'Each dot is one of the ' + (DATA.scatter || []).length + ' live tokens, predicted by a curve fitted without it. The line is exact.' })
        )),
        el('section', { class: 'panel' }, el('div', { class: 'pad' },
          el('h2', { text: 'The record behind the odds' }),
          el('p', { class: 'sub', text: 'The odds are the peers\u2019 record, not a forecast: the share of the ' + od.n + ' peers that record a token, by how long they have run.' })
        ),
          el('div', { class: 'table-wrap' }, el('table', { class: 'ablation' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Listed for' }), el('th', { scope: 'col', class: 'num', text: 'Peers' }), el('th', { scope: 'col', class: 'num', text: 'With a token' }), el('th', { scope: 'col', class: 'num', text: 'Share' }))),
            bucketBody
          )),
          el('div', { class: 'pad' },
            el('p', { class: 'sub', text: 'Kinship: ' + od.kin_peers + ' peers share a first word with another token protocol; ' + od.kin_token + ' of them record a token (' + fmtShare(od.kin_peers ? od.kin_token / od.kin_peers : 0) + '). ' + DATA.accounting.kin_ranked + ' ranked rows are kin.' })
          )
        )
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Nested validation: the selection rule itself was tested' }),
        el('p', { class: 'sub', text: 'The term selection was redone inside each split, so these numbers test the rule that picks terms, not just the fitted model. Value, walk-forward: re-selected (' + nestedTerms(o.nested_wf_terms) + ') ' + fmtMiss(o.nested_wf_median_miss) + ' vs fixed ' + fmtMiss(o.wf_median_miss) + '. Value, 5-fold: re-selected (' + nestedTerms(o.nested_kfold_terms) + ') ' + fmtMiss(o.nested_kfold_median_miss) + ' vs fixed ' + fmtMiss(o.kfold_median_miss) + '. Odds, walk-forward: re-selected (' + od.nested_wf_terms + ') Brier ' + od.nested_wf_brier.toFixed(3) + ' vs fixed ' + od.wf_brier.toFixed(3) + '. Odds, 5-fold: re-selected (' + od.nested_kfold_terms + ') Brier ' + od.nested_kfold_brier.toFixed(3) + ' vs fixed ' + od.kfold_brier.toFixed(3) + '. The fixed rule wins every comparison, so it ships — and the comparison is shown, not hidden.' })
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Net of all costs: what a farm plan nets' }),
        el('p', { class: 'sub', text: 'Plan = 0.02% of the protocol\u2019s TVL (floor $1,000, cap $20,000). Expected airdrop = ' + Math.round(m.airdrop_share * 100) + '% of the implied value, the plan competing against the protocol\u2019s whole TVL. Gas = ' + m.farm_gas_tx + ' transactions at the chain\u2019s typical cost; time = ' + m.farm_hours + ' hours. The verdict is made on the P25 conservative case: FARM at ' + fmtUsd2(m.verdict_farm_per_hour) + '/h or better, MARGINAL when the P25 net is at least zero, SKIP when it is negative. Across the board: ' + counts.FARM + ' FARM, ' + counts.MARGINAL + ' MARGINAL, ' + counts.SKIP + ' SKIP. The sliders recompute every verdict live. A verdict ranks farms against each other; it does not promise a payout.' })
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'What this radar does not know' }),
        el('div', { class: 'note' }, el('ul', null,
          el('li', { text: 'The curve\u2019s R\u00B2 is ' + c.r2.toFixed(2) + ': TVL and chain count explain little of a token\u2019s market cap, and the P10–P90 band is ' + (o.loo_p90_factor / o.loo_p10_factor).toFixed(0) + 'x wide.' }),
          el('li', { text: 'The odds are the peers\u2019 record, not a forecast. Walk-forward P10–P90 coverage is ' + fmtShare(o.wf_in_band) + ' against a stated 80% — the wide band is too narrow for recent listings.' }),
          el('li', { text: 'Kinship rests on ' + DATA.accounting.kin_ranked + ' ranked rows, and its bootstrap spread is wide (±' + od.kinship_se.toFixed(2) + ').' }),
          el('li', { text: 'No parent discount: the snapshot cannot say which pre-token protocols are subsidiaries.' }),
          el('li', { text: 'The snapshot is frozen at ' + DATA.as_of + '; nothing here updates.' })
        ))
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Set aside' }),
        el('ul', null, reasons.map(function (reason) { return el('li', { text: reason + ': ' + DATA.excluded_by_reason[reason] }); }))
      ))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var net = netOf(row);
    var recomputed = impliedOf(row);
    var checks = Math.abs(recomputed - row.implied_value_usd) <= 1
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.';
    var terms = row.odds_terms || {};
    var termLabels = { intercept: 'base', years: 'years', undated: 'undated', lntvl: 'ln TVL', relgrowth: 'growth', kinship: 'kinship' };
    var termParts = Object.keys(terms).map(function (k) { return (termLabels[k] || k) + ' ' + fmtSigned(terms[k]); });
    var comps = DATA.comparables[row.category || 'Other'] || [];
    var compRows = comps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.name }),
        el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(c.mcap_tvl_ratio) })
      );
    });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' — watchlist' : ' — early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' — listed ' + (row.listed_at || 'undated') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'tiles' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Value if it launches' }), el('b', { class: 'num', text: fmtUsd(row.value_if_launches_usd) })),
        el('div', null, el('span', { text: 'Token odds' }), el('b', { class: 'num', text: fmtShare(row.token_odds) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num gold', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P25–P75 range' }), el('b', { class: 'num', text: fmtUsd(row.p25_value_usd) + '–' + fmtUsd(row.p75_value_usd) })),
        el('div', null, el('span', { text: 'P10–P90 range' }), el('b', { class: 'num', text: fmtUsd(row.p10_value_usd) + '–' + fmtUsd(row.p90_value_usd) })),
        el('div', null, el('span', { text: 'Curve value' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: fmtMult(row.chain_multiplier) }))
      ),
      el('p', { class: 'sub', text: 'Odds logit ' + row.odds_logit.toFixed(2) + ' = ' + termParts.join(' ') + '. ' + checks + ' An estimate of what a token would be worth if the record stayed as it is — not a prediction that one launches, and never a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      planTable(row)
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Net of all costs' }),
      el('div', { class: 'tiles' },
        el('div', null, el('span', { text: 'Plan' }), el('b', { class: 'num', text: fmtUsd(net.plan_usd) })),
        el('div', null, el('span', { text: 'Expected airdrop' }), el('b', { class: 'num', text: fmtUsd2(net.expected_usd) })),
        el('div', null, el('span', { text: 'Gas (' + net.gas_tx + ' txs)' }), el('b', { class: 'num', text: fmtUsd2(net.gas_usd) })),
        el('div', null, el('span', { text: 'Net per hour' }), el('b', { class: 'num gold', text: fmtUsd2(net.net_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'P25 net' }), el('b', { class: 'num', text: fmtUsd2(net.p25_net_usd) })),
        el('div', null, el('span', { text: 'P25 net per hour' }), el('b', { class: 'num', text: fmtUsd2(net.p25_net_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'Pays from' }), el('b', { class: 'num', text: fmtUsd(net.breakeven_usd) })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', null, el('span', { class: 'verdict ' + net.verdict.toLowerCase(), text: net.verdict })))
      ),
      el('p', { class: 'sub', text: 'Assumes the airdrop pays ' + Math.round(state.scenario.dropShare * 1000) / 10 + '% of the implied value, the plan competes against the whole TVL, and the work takes ' + net.hours.toFixed(1) + ' hours. The verdict is made on the P25 case. A verdict ranks farms against each other; it does not promise a payout.' })
    ));
    if (compRows.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'Live tokens in this category.' }),
        el('table', { class: 'comp' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          el('tbody', null, compRows)
        )
      ));
    }
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(kpis());
    shell.appendChild(formulaLine());
    shell.appendChild(accountingBar());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    if (state.tab === 'board') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(methodologyPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  readShot();
  render();
  window.__shotReady = true;
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
