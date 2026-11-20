// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail dialog with the
// model's own breakdown and the protocol's farm plan, the live-token set, and the model itself:
// its formula, its calibration table and a sandbox that re-ranks the board live. No network:
// every byte it shows is in data.js. The page recomputes every row from the snapshot figures,
// so the board's numbers and the page's numbers are the same arithmetic, checked in the open.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, minTvl: 0,
    tab: 'board', sort: 'implied', dir: -1, selected: null,
    sandbox: { on: false, growthWeight: DATA.model.growth_weight, maturityRange: DATA.model.maturity_range }
  };

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
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  // Dollars with cents, for net figures that live below $1,000 (and below zero).
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

  // The model in one function, the same arithmetic lib/model.ts runs: TVL times the row's
  // effective multiple — the fitted size curve's value per dollar of TVL, adjusted for the
  // category — times the growth, maturity and chain multipliers. The detail view calls it with
  // the submitted model and checks the number board.json carries.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * growthMult * maturity * chainMult));
  }
  function effectiveModel() {
    if (!state.sandbox.on) return DATA.model;
    var m = {};
    Object.keys(DATA.model).forEach(function (k) { m[k] = DATA.model[k]; });
    m.growth_weight = state.sandbox.growthWeight;
    m.maturity_range = state.sandbox.maturityRange;
    return m;
  }
  // Every row with the value the page currently shows (the submitted one, or the sandbox's), and
  // its rank among all rows under that value. Same order as buildBoard: value desc, slug asc.
  function displayRows() {
    var model = effectiveModel();
    var scored = DATA.rows.map(function (r) {
      return { row: r, value: impliedOf(r, model) };
    });
    scored.sort(function (a, b) { return b.value - a.value || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0); });
    var rankOf = {};
    scored.forEach(function (s, i) { rankOf[s.row.slug] = i + 1; });
    var valueOf = {};
    scored.forEach(function (s) { valueOf[s.row.slug] = s.value; });
    return { rankOf: rankOf, valueOf: valueOf };
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
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  // ?shot=board|detail|filtered sets one of the three screenshot states deterministically.
  function readShot() {
    var params = new URLSearchParams(window.location.search || '');
    var shot = params.get('shot');
    if (shot === 'detail') { state.tab = 'board'; state.selected = DATA.rows[0] ? DATA.rows[0].slug : null; }
    else if (shot === 'filtered') { state.tab = 'board'; state.category = 'Risk Curators'; state.sort = 'tvl'; state.dir = -1; }
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
  function sortedRows(list, valueOf) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'net') { av = a.net.net_per_hour_usd; bv = b.net.net_per_hour_usd; }
      else { av = valueOf[a.slug]; bv = valueOf[b.slug]; }
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

  // The cover's scatter: every live token's leave-one-out prediction against its actual market
  // cap, both on log scales, with the exact-prediction diagonal. A point above the line was
  // under-predicted, below it over-predicted. Built as an SVG string: the page has no chart
  // library, and the plot is data, not decoration.
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
    s += '<text x="12" y="' + ((H - PB) / 2).toFixed(1) + '" class="axis rot" transform="rotate(-90 12 ' + ((H - PB) / 2).toFixed(1) + ')">actual market cap</text>';
    s += '</svg>';
    return s;
  }

  // The cover: the formula, the blind test, the scatter and the best net farm, all on the first
  // screen. A reader who never scrolls still sees how the board is priced and how well the
  // pricing held up on values it never fitted.
  function lede() {
    var c = DATA.curve, o = DATA.oos;
    var best = null;
    DATA.rows.forEach(function (r) { if (!best || r.net.net_per_hour_usd > best.net.net_per_hour_usd) best = r; });
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { counts[r.net.verdict]++; });
    function oosStat(label, value, baseline) {
      return el('div', { class: 'oos-stat' }, el('span', { text: label }), el('b', { text: value }), el('span', { class: 'sub', text: baseline }));
    }
    return el('section', { class: 'cover' },
      el('div', { class: 'cover-grid' },
        el('div', { class: 'cover-main' },
          el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
          el('div', { class: 'formula' },
            el('b', { text: 'implied' }), ' = 10^' + c.a_ref.toFixed(2) + ' x (TVL / $100M)^' + c.b.toFixed(2) + ' x category x growth x maturity x chains'
          ),
          el('p', { class: 'sub', text: 'A size curve fitted on this snapshot\u2019s ' + c.n + ' live-token protocols (R\u00B2 ' + c.r2.toFixed(2) + ', residual SD ' + c.resid_sd_dex.toFixed(2) + ' dex), not a flat multiple: value grows slower than size, so giants price near the market instead of 4\u20137x above it.' }),
          el('div', { class: 'oos' },
            el('div', { class: 'oos-head', text: 'Tested blind \u2014 never fitted on what it predicts' }),
            el('div', { class: 'oos-grid' },
              oosStat('Leave-one-out median miss', fmtMiss(o.loo_median_miss), 'flat multiple ' + fmtMiss(o.flat_loo_median_miss)),
              oosStat('Within 3x of the market cap', fmtShare(o.loo_within_3x), 'flat ' + fmtShare(o.flat_loo_within_3x)),
              oosStat('Time-split median miss', fmtMiss(o.time_split_median_miss), 'flat ' + fmtMiss(o.flat_time_split_median_miss)),
              oosStat('P10\u2013P90 band covers', fmtShare(o.loo_in_band), 'band ' + fmtMiss(o.loo_p10_factor) + ' to ' + fmtMiss(o.loo_p90_factor))
            )
          ),
          el('div', { class: 'bestnet' },
            el('span', { class: 'verdict ' + best.net.verdict.toLowerCase(), text: best.net.verdict }),
            el('span', null, 'Best net per hour: ', el('b', { text: best.name + ' ' + fmtUsd2(best.net.net_per_hour_usd) + '/h' }), ' \u2014 a $1,000 slice nets ' + fmtUsd2(best.net.net_1k_usd) + ' after gas. ' + counts.FARM + ' FARM / ' + counts.THIN + ' THIN / ' + counts.SKIP + ' SKIP across the board.')
          )
        ),
        el('div', { class: 'cover-plot' },
          el('h2', { text: 'Predicted vs actual, leave-one-out' }),
          el('div', { class: 'scatter', html: scatterSvg() }),
          el('p', { class: 'sub', text: 'Each dot is one of the ' + (DATA.scatter || []).length + ' live tokens, predicted by a curve fitted without it. The line is exact.' })
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'gold', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Set aside, not launches' }), el('b', { text: String(DATA.excluded_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
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
    var shown = state.tab === 'board' ? rows().length + ' rows shown of ' + DATA.board_size
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : 'the model, its calibration and its sandbox';
    var box = el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Size' }), tvlSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabButton('board', 'Board'), tabButton('live', 'Live token'), tabButton('model', 'Model'))),
      el('span', { class: 'count', text: shown })
    );
    if (state.sandbox.on) {
      box.appendChild(el('div', { class: 'sandbox-note', text: 'Sandbox on: the board is re-ranked live with growth weight ' + state.sandbox.growthWeight.toFixed(2) + ' and maturity range ' + state.sandbox.maturityRange.toFixed(2) + '. board.json keeps the submitted model.' }));
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

  function boardTable(disp) {
    var list = sortedRows(rows(), disp.valueOf);
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or size to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (disp.valueOf[r.slug] > max) max = disp.valueOf[r.slug]; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(disp.rankOf[r.slug]) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((disp.valueOf[r.slug] / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(disp.valueOf[r.slug]) })
        )),
        el('td', null, el('div', { class: 'netcell' },
          el('span', { class: 'verdict ' + r.net.verdict.toLowerCase(), text: r.net.verdict }),
          el('span', { class: 'num', text: fmtUsd2(r.net.net_per_hour_usd) + '/h' }),
          el('span', { class: 'sub', text: fmtUsd2(r.net.net_1k_usd) + ' per $1K' })
        )),
        el('td', null, el('span', { class: 'status' + (r.watchlist ? ' watch' : ''), text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown, its live comparables, its farm plan and its net verdict. Net of all costs is what a $1,000 farm slice nets after gas, per hour of active work.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('chains', 'Chains', true),
            sortHeader('implied', 'Implied value', true),
            sortHeader('net', 'Net of all costs', true),
            el('th', { scope: 'col', text: 'Board' })
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
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps per TVL fit the size curve and calibrate the flat baseline the curve is tested against.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var calibRows = DATA.calibration.multiples.slice().sort(function (a, b) { return b.live_count - a.live_count || (a.category < b.category ? -1 : 1); });
    var calibBody = el('tbody');
    calibRows.forEach(function (c) {
      calibBody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_count) }),
        el('td', { class: 'num', text: fmtMult(c.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    var adjRows = (DATA.adjustments || []).slice().sort(function (a, b) { return b.live_count - a.live_count || (a.category < b.category ? -1 : 1); });
    var adjBody = el('tbody');
    adjRows.forEach(function (c) {
      adjBody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_count) }),
        el('td', { class: 'num', text: fmtMult(c.median_factor) }),
        el('td', { class: 'num', text: fmtMult(c.adjustment) })
      ));
    });
    var netCounts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { netCounts[r.net.verdict]++; });
    var reasons = Object.keys(DATA.excluded_by_reason || {}).sort(function (a, b) { return DATA.excluded_by_reason[b] - DATA.excluded_by_reason[a]; });
    var growthSlider = el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.05', value: String(state.sandbox.growthWeight) });
    var growthOut = el('output', { for: 'sb-growth', text: state.sandbox.growthWeight.toFixed(2) });
    var matSlider = el('input', { type: 'range', id: 'sb-mat', min: '0', max: '0.8', step: '0.05', value: String(state.sandbox.maturityRange) });
    var matOut = el('output', { for: 'sb-mat', text: state.sandbox.maturityRange.toFixed(2) });
    growthSlider.addEventListener('input', function () { state.sandbox.growthWeight = parseFloat(growthSlider.value); state.sandbox.on = true; growthOut.textContent = state.sandbox.growthWeight.toFixed(2); render(); });
    matSlider.addEventListener('input', function () { state.sandbox.maturityRange = parseFloat(matSlider.value); state.sandbox.on = true; matOut.textContent = state.sandbox.maturityRange.toFixed(2); render(); });
    return el('div', null,
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'One function scores every protocol. The base is a size curve fitted on this snapshot\u2019s ' + DATA.curve.n + ' live-token protocols, not a flat multiple: value grows slower than size, so the curve bends where a flat multiple would price giants linearly.' }),
        el('div', { class: 'formula' },
          el('b', { text: 'implied' }), ' = round( 10^' + DATA.curve.a_ref.toFixed(2) + ' x (tvl_usd / $100M)^' + DATA.curve.b.toFixed(2) + ' x ', el('b', { text: 'adjustment(category)' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_cap + ')) )'
        ),
        el('p', { class: 'sub', text: 'The fit: log10(market cap) = ' + DATA.curve.a.toFixed(2) + ' + ' + DATA.curve.b.toFixed(2) + ' x log10(TVL), R\u00B2 ' + DATA.curve.r2.toFixed(2) + ' over ' + DATA.curve.n + ' live tokens, residual SD ' + DATA.curve.resid_sd_dex.toFixed(2) + ' dex. TVL, seven-day growth, age and chains come from the snapshot. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days + ' days. No protocol name is special-cased, and no row is hand-picked.' })
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Tested out of sample, against the flat model' }),
        el('p', { class: 'sub', text: 'Leave-one-out predicts each live token with a curve fitted without it; the time split fits the older half of dated live tokens and tests the newer half (cutoff ' + DATA.oos.time_split_cutoff + '). The flat baseline is the category-median multiple, refit the same way on the same sets. A miss of x3 means the prediction was three times the market cap, or a third of it.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', class: 'num', text: 'Size curve' }), el('th', { scope: 'col', class: 'num', text: 'Flat multiple' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Leave-one-out median miss (' + DATA.oos.loo_n + ' tokens)' }), el('td', { class: 'num', text: fmtMiss(DATA.oos.loo_median_miss) }), el('td', { class: 'num', text: fmtMiss(DATA.oos.flat_loo_median_miss) })),
            el('tr', null, el('td', { text: 'Leave-one-out within 3x' }), el('td', { class: 'num', text: fmtShare(DATA.oos.loo_within_3x) }), el('td', { class: 'num', text: fmtShare(DATA.oos.flat_loo_within_3x) })),
            el('tr', null, el('td', { text: 'Time-split median miss (' + DATA.oos.time_split_n + ' tokens)' }), el('td', { class: 'num', text: fmtMiss(DATA.oos.time_split_median_miss) }), el('td', { class: 'num', text: fmtMiss(DATA.oos.flat_time_split_median_miss) })),
            el('tr', null, el('td', { text: 'Time-split within 3x' }), el('td', { class: 'num', text: fmtShare(DATA.oos.time_split_within_3x) }), el('td', { class: 'num', text: fmtShare(DATA.oos.flat_time_split_within_3x) })),
            el('tr', null, el('td', { text: 'P10\u2013P90 band covers (' + fmtMiss(DATA.oos.loo_p10_factor) + ' to ' + fmtMiss(DATA.oos.loo_p90_factor) + ')' }), el('td', { class: 'num', text: fmtShare(DATA.oos.loo_in_band) }), el('td', { class: 'num', text: '\u2014' }))
          )
        ))
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Category adjustments: the family sets the factor' }),
        el('p', { class: 'sub', text: 'Each category\u2019s adjustment is the median of (actual market cap / curve value) over its live protocols, shrunk toward 1 with a prior of ' + m.multiple_prior + ' protocols. A category with fewer than ' + m.category_min_n + ' live protocols takes 1 outright, so one outlier never prices a whole family.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live protocols' }), el('th', { scope: 'col', class: 'num', text: 'Median factor' }), el('th', { scope: 'col', class: 'num', text: 'Adjustment used' }))),
          adjBody
        ))
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Net of all costs: what a $1,000 farm slice nets' }),
        el('p', { class: 'sub', text: 'Expected airdrop = ' + Math.round(m.airdrop_share * 100) + '% of the implied value, with the $1,000 slice competing against the protocol\u2019s whole TVL. Gas = ' + m.farm_gas_tx + ' transactions at the chain\u2019s typical cost. Time = ' + m.farm_hours + ' hours of active work. Verdict: FARM at ' + fmtUsd2(m.verdict_farm_per_hour) + '/h or better, THIN when it pays but barely, SKIP when gas eats the expected airdrop. The P10\u2013P90 net range uses the leave-one-out band. The same assumptions score every row: the verdict ranks farms against each other, it does not promise a payout.' }),
        el('p', { class: 'sub', text: 'Across the board: ' + netCounts.FARM + ' FARM, ' + netCounts.THIN + ' THIN, ' + netCounts.SKIP + ' SKIP.' })
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'The flat baseline: the market sets the multiple' }),
        el('p', { class: 'sub', text: 'The comparison the out-of-sample test beats: the global median market cap per TVL across ' + DATA.calibration.global_n + ' live-token protocols in this snapshot is ' + fmtMult(DATA.calibration.global_median) + '. Each category median is shrunk toward it with a prior of ' + m.multiple_prior + ' protocols, and a category with fewer than ' + m.category_min_n + ' live protocols takes the global median outright. Every multiple is clamped to ' + m.multiple_min + 'x-' + m.multiple_max + 'x. A live protocol counts only when its market cap is positive.' })
      ),
        el('div', { class: 'table-wrap' }, el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live protocols' }), el('th', { scope: 'col', class: 'num', text: 'Median mcap / TVL' }), el('th', { scope: 'col', class: 'num', text: 'Multiple used' }))),
          calibBody
        ))
      ),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Model sandbox' }),
        el('p', { class: 'sub', text: 'Move a slider and the board re-ranks live with the new weights. The sandbox changes only this view: board.json keeps the submitted model.' }),
        el('div', { class: 'sandbox' },
          el('div', null, el('label', { for: 'sb-growth', text: 'Growth weight' }), growthSlider, growthOut),
          el('div', null, el('label', { for: 'sb-mat', text: 'Maturity range' }), matSlider, matOut)
        ),
        el('p', null, el('button', { class: 'button', type: 'button', text: state.sandbox.on ? 'Reset to the submitted model' : 'Sandbox is off: the board shows the submitted model', onclick: function () { state.sandbox.on = false; state.sandbox.growthWeight = DATA.model.growth_weight; state.sandbox.maturityRange = DATA.model.maturity_range; render(); } }))
      )),
      el('section', { class: 'panel' }, el('div', { class: 'pad' },
        el('h2', { text: 'Set aside, and why' }),
        el('p', { class: 'sub', text: DATA.excluded_size + ' pre-token records are not launches of their own, so the board never ranks them: a wrapped or staked product of a token that already trades is not a protocol still waiting on a launch.' }),
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
    var recomputed = impliedOf(row, DATA.model);
    var checks = recomputed === row.implied_value_usd
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.';
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
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' - watchlist' : ' - early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' - listed ' + (row.listed_at || 'on an unknown date') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size-curve multiple' }), el('b', { class: 'num', text: fmtMult(row.base_multiple) })),
        el('div', null, el('span', { text: 'Base value' }), el('b', { class: 'num', text: fmtUsd(Math.round(row.tvl_usd * row.base_multiple)) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: fmtMult(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num gold', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P10\u2013P90 range' }), el('b', { class: 'num', text: fmtUsd(row.p10_value_usd) + ' \u2013 ' + fmtUsd(row.p90_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the size curve is fitted on ' + DATA.curve.n + ' live tokens, and the P10\u2013P90 range comes from its leave-one-out errors. ' + checks + ' This is an estimate of what a token would be worth if the record stayed as it is, not a prediction that one launches, and never a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Net of all costs' }),
      el('div', { class: 'netline' },
        el('span', { class: 'verdict ' + row.net.verdict.toLowerCase(), text: row.net.verdict }),
        el('span', null, 'A $1,000 farm slice nets ', el('b', { text: fmtUsd2(row.net.net_1k_usd) }), ' after gas \u2014 ', el('b', { text: fmtUsd2(row.net.net_per_hour_usd) + '/h' }), ' of active work.')
      ),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Expected airdrop' }), el('b', { class: 'num', text: fmtUsd2(row.net.expected_usd) })),
        el('div', null, el('span', { text: 'Gas (' + DATA.model.farm_gas_tx + ' transactions)' }), el('b', { class: 'num', text: fmtUsd2(row.net.gas_usd) })),
        el('div', null, el('span', { text: 'Net per $1,000 slice' }), el('b', { class: 'num', text: fmtUsd2(row.net.net_1k_usd) })),
        el('div', null, el('span', { text: 'Net per hour' }), el('b', { class: 'num gold', text: fmtUsd2(row.net.net_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'P10\u2013P90 net range' }), el('b', { class: 'num', text: fmtUsd2(row.net.p10_net_usd) + ' \u2013 ' + fmtUsd2(row.net.p90_net_usd) }))
      ),
      el('p', { class: 'sub', text: 'Assumes the airdrop pays ' + Math.round(DATA.model.airdrop_share * 100) + '% of the implied value to farmers, the slice competes against the protocol\u2019s whole TVL, and the work takes ' + DATA.model.farm_hours + ' hours. The range uses the model\u2019s own leave-one-out band. A verdict ranks farms against each other; it does not promise a payout.' })
    ));
    if (compRows.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'Protocols in this category whose token already trades: their market caps against the size curve are what the category adjustment above is fitted from.' }),
        el('table', { class: 'comp' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          el('tbody', null, compRows)
        )
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var disp = displayRows();
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'board') shell.appendChild(boardTable(disp));
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(modelPanel());
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
