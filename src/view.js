(function () {
  'use strict';
  const root = document.getElementById('compact-learning-explorer');
  if (!root) return;
  const M = globalThis.CompactLearning;
  const d3 = globalThis.d3;
  const status = root.querySelector('#cl-status');
  if (!M || !d3) {
    status.textContent = 'The chart could not load. The standalone version includes its chart library.';
    return;
  }
  const $ = selector => root.querySelector(selector);
  const inputs = [...root.querySelectorAll('[data-param]')];
  const chart = $('#cl-chart');
  const tooltip = $('#cl-tooltip');
  const inspect = $('#cl-year');
  const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});
  const short = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
  const money = value => value < 0.01 ? '<$0.01/MWh' : '$' + value.toLocaleString('en-US', {minimumFractionDigits: value < 100 ? 2 : 0, maximumFractionDigits: value < 100 ? 2 : 0}) + '/MWh';
  const tickMoney = value => '$' + value.toLocaleString('en-US', {maximumFractionDigits: 6}) + '/MWh';
  const premium = value => value >= 1e9 ? '$' + short.format(value / 1e9) + 'bn' : value >= 1e6 ? '$' + short.format(value / 1e6) + 'm' : '$' + number.format(value);
  const color = scenario => scenario.compact ? 'var(--viz-series-1)' : 'var(--viz-series-2)';
  const dash = scenario => scenario.limited ? '7 5' : null;
  const factors = {rate: 100, growth: 100, capacityCap: 0.001};
  let params = {...M.DEFAULTS};
  let visible = new Set(M.SCENARIOS.map(s => s.id));
  let cases = [];
  let pinned = false;
  let lastX = null;
  let chartState = null;
  let restorePending = false;
  let lastWidth = 0;
  let lastPoints = new Map();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const svg = d3.select(chart).append('svg').attr('role', 'img').attr('aria-labelledby', 'cl-chart-title cl-chart-description');
  svg.append('title').attr('id', 'cl-chart-title').text('Electricity cost over time for compact and large fusion products');
  svg.append('desc').attr('id', 'cl-chart-description').text('Four hypothetical deployment cases. Solid lines have continuing early demand. Dashed lines have limited early demand. Wholesale competitiveness permits orders to grow. Use the year control or touch the plot for production counts and doublings.');
  svg.append('defs').append('clipPath').attr('id', 'cl-clip').append('rect');
  const base = svg.append('g');
  const lines = svg.append('g').attr('clip-path', 'url(#cl-clip)');
  const annotations = svg.append('g');
  const guide = svg.append('g').style('display', 'none');
  const hit = svg.append('rect').attr('data-chart-hit', '').attr('data-chart-hover-overlay', 'cross-series').attr('fill', 'transparent');

  function readState(snapshot) {
    const saved = snapshot?.modelContent;
    if (!saved || saved.schema !== 1) return;
    params = M.normalize({...M.DEFAULTS, ...(saved.assumptions || {})});
    if (Array.isArray(saved.visible)) visible = new Set(saved.visible.filter(id => M.SCENARIOS.some(s => s.id === id)));
    if (!visible.size) visible.add(M.SCENARIOS[0].id);
    inspect.value = Math.min(params.horizon, Math.max(0, Number(saved.inspectYear) || 0));
  }
  function persist() {
    const state = {modelContent: {schema: 1, assumptions: params, visible: [...visible], inspectYear: Number(inspect.value)}, privateContent: null};
    try {
      const promise = window.openai?.setWidgetState?.(state);
      if (promise?.catch) promise.catch(() => {});
    } catch (_) { /* State persistence is optional. */ }
  }
  readState(window.openai?.widgetState);
  window.addEventListener('openai:set_globals', event => {
    const snapshot = event.detail?.globals?.widgetState;
    if (!snapshot || restorePending) return;
    restorePending = true;
    readState(snapshot);
    syncInputs(); update(false);
    restorePending = false;
  });

  function displayValue(key, value) {
    if (key === 'rate') return short.format(value * 100) + '%';
    if (key === 'floor') return tickMoney(value);
    return String(value);
  }
  function syncInputs() {
    inputs.forEach(input => {
      const key = input.dataset.param;
      input.value = params[key] * (factors[key] || 1);
      root.querySelectorAll('[data-value="' + key + '"]').forEach(out => { out.textContent = displayValue(key, params[key]); });
    });
    inspect.max = params.horizon;
    inspect.value = Math.min(Number(inspect.value), params.horizon);
    $('#cl-year-value').textContent = inspect.value;
  }
  function updateFromInput(input) {
    if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) return;
    const value = Number(input.value);
    if (value < Number(input.min) || value > Number(input.max)) return;
    params = M.normalize({...params, [input.dataset.param]: value / (factors[input.dataset.param] || 1)});
    syncInputs(); pinned = false; hideInspection(); update(true); persist();
  }
  inputs.forEach(input => {
    input.addEventListener('input', () => updateFromInput(input));
    input.addEventListener('change', () => {
      if (input.value.trim() === '' || !input.validity.valid) syncInputs();
    });
  });

  function milestone(priceYear, deliveryYear, possible) {
    if (!possible) return 'Not attainable';
    if (priceYear === null) return 'Not reached';
    return 'Year ' + priceYear + ' / ' + (deliveryYear === null ? 'no delivery modeled' : 'year ' + deliveryYear);
  }
  function updateTable() {
    $('#cl-cost-header').textContent = 'Cost in year ' + params.horizon;
    $('#cl-wholesale-header').replaceChildren(document.createTextNode(tickMoney(params.benchmark)), document.createElement('br'), document.createTextNode('price / delivery'));
    const body = $('#cl-results'); body.replaceChildren();
    cases.filter(c => visible.has(c.id)).forEach(c => {
      const s = c.summary;
      const row = document.createElement('tr'); row.dataset.case = c.id;
      const values = [c.name, money(s.finalCost), number.format(s.completed),
        milestone(s.wholesaleYear, s.wholesaleDeliveryYear, s.wholesaleMinimum.possible),
        milestone(s.targetYear, s.targetDeliveryYear, s.targetMinimum.possible), premium(s.lifetimePremium)];
      values.forEach((value, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        else cell.className = 'tabular-nums';
        cell.textContent = value;
        if (i === 2) {
          const secondary = document.createElement('span'); secondary.className = 'cl-secondary text-small';
          secondary.textContent = s.doublings.toFixed(2) + ' doublings'; cell.append(secondary);
        }
        row.append(cell);
      });
      body.append(row);
    });
    $('#cl-premium-note').textContent = 'Lifetime payments above ' + tickMoney(params.benchmark) + ' from customers or subsidies · 90% utilization · 30-year unit life · constant dollars, undiscounted';
    if (params.floor >= params.target) {
      status.textContent = 'The ' + tickMoney(params.floor) + ' fixed contribution prevents a finite-volume cost of ' + tickMoney(params.target) + '.';
    } else if (params.rate === 0) {
      status.textContent = 'At 0% learning, additional production does not reduce electricity cost.';
    } else if (params.capacityCap === 0) {
      status.textContent = 'At zero production capacity, no units follow the first unit.';
    } else {
      const requirement = minimum => {
        const count = minimum.units === null ? 'a unit count beyond the numerical range' : minimum.units >= 1e9 ? minimum.units.toExponential(2) + ' units' : number.format(minimum.units) + ' units';
        return count + (minimum.doublings === null ? '' : ' (' + minimum.doublings.toFixed(2) + ' doublings)');
      };
      status.textContent = 'Minimum compact production: ' + tickMoney(params.benchmark) + ' at ' + requirement(cases[0].summary.wholesaleMinimum) + '; ' + tickMoney(params.target) + ' at ' + requirement(cases[0].summary.targetMinimum) + '.';
    }
  }
  function updateLegend() {
    const legend = $('#cl-legend');
    if (!legend.children.length) {
      M.SCENARIOS.forEach(s => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.case = s.id;
        button.className = 'cursor-interaction';
        const swatch = document.createElement('span'); swatch.className = 'cl-swatch' + (s.compact ? '' : ' large') + (s.limited ? ' limited' : ''); swatch.setAttribute('aria-hidden', 'true');
        button.append(swatch, document.createTextNode(s.name));
        button.addEventListener('click', () => {
          if (visible.has(s.id) && visible.size > 1) visible.delete(s.id); else visible.add(s.id);
          pinned = false; hideInspection(); updateLegend(); updateTable(); draw(false); persist();
        });
        legend.append(button);
      });
    }
    [...legend.children].forEach(button => button.setAttribute('aria-pressed', String(visible.has(button.dataset.case))));
  }

  function rowAt(c, year) {
    return c.rows[Math.min(c.rows.length - 1, Math.max(0, Math.floor(year + 1e-9)))];
  }
  function tidyLabels() {
    const labels = [...chart.querySelectorAll('.tick text,.axis-title,.cl-reference-label,.cl-end-label')];
    const taken = [];
    labels.forEach(node => {
      const box = node.getBoundingClientRect();
      const optional = node.classList.contains('cl-end-label') || node.classList.contains('cl-reference-label');
      const collides = taken.some(r => !(box.right + 4 < r.left || box.left - 4 > r.right || box.bottom + 4 < r.top || box.top - 4 > r.bottom));
      if (optional && collides) node.style.display = 'none';
      else taken.push(box);
    });
  }
  function draw(animate) {
    const width = Math.max(280, Math.floor(chart.getBoundingClientRect().width));
    lastWidth = width;
    const height = width < 440 ? 340 : 380;
    const margin = {left: 96, right: 14, top: 40, bottom: 48};
    const left = margin.left, right = width - margin.right, top = margin.top, bottom = height - margin.bottom;
    svg.attr('viewBox', '0 0 ' + width + ' ' + height).attr('height', height);
    const shown = cases.filter(c => visible.has(c.id));
    const allRows = cases.flatMap(c => c.rows);
    const [loX, hiX] = d3.extent(allRows, r => r.year);
    const [loY, hiY] = d3.extent([...allRows.map(r => r.cost), params.target, params.benchmark].filter(v => v > 0));
    const x = d3.scaleLinear().domain([loX, hiX || 1]).range([left + 4, right - 5]);
    const y = d3.scaleLog().domain([loY / 1.2, hiY * 1.2]).range([bottom - 5, top + 5]);
    chartState = {width, height, left, right, top, bottom, x, y, shown};
    svg.select('#cl-clip rect').attr('x', left).attr('y', top).attr('width', right - left).attr('height', bottom - top);
    base.selectAll('*').remove(); annotations.selectAll('*').remove();
    base.append('rect').attr('data-chart-frame', '').attr('x', left).attr('y', top).attr('width', right - left).attr('height', bottom - top);
    let yTicks = [...new Set([0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 5, 10, 20, 60, 100, 250, 500, 1000, 2000, params.target, params.benchmark])].filter(v => v >= y.domain()[0] && v <= y.domain()[1]).sort((a,b) => a-b);
    const accepted = [];
    yTicks.forEach(v => { if (!accepted.some(other => Math.abs(y(v) - y(other)) < 24)) accepted.push(v); });
    yTicks = accepted;
    base.selectAll('.cl-grid').data(yTicks).join('line').attr('class', 'cl-grid').attr('x1', left).attr('x2', right).attr('y1', y).attr('y2', y);
    const maxXTicks = width <= 380 ? 3 : width < 600 ? 5 : 8;
    base.append('g').attr('transform', 'translate(0,' + bottom + ')').call(d3.axisBottom(x).ticks(maxXTicks).tickFormat(d3.format('d')).tickSizeOuter(0));
    base.append('g').attr('transform', 'translate(' + left + ',0)').call(d3.axisLeft(y).tickValues(yTicks).tickFormat(tickMoney).tickSizeOuter(0));
    base.append('text').attr('class', 'axis-title').attr('data-axis', 'y').attr('x', width < 440 ? 0 : left).attr('y', 17).text('New-order cost ($/MWh, log scale)');
    base.append('text').attr('class', 'axis-title').attr('data-axis', 'x').attr('x', (left + right) / 2).attr('y', height - 6).attr('text-anchor', 'middle').text(width < 400 ? 'Years after first units' : 'Years after first units enter service');
    [{value: params.benchmark, label: 'Wholesale ' + tickMoney(params.benchmark), dash: '3 4'}, {value: params.target, label: 'Target ' + tickMoney(params.target), dash: '7 4'}].forEach(ref => {
      base.append('line').attr('class', 'cl-reference').attr('x1', left).attr('x2', right).attr('y1', y(ref.value)).attr('y2', y(ref.value)).attr('stroke-dasharray', ref.dash);
      annotations.append('text').attr('class', 'cl-reference-label').attr('x', right - 7).attr('y', y(ref.value) - 7).attr('text-anchor', 'end').text(ref.label);
    });
    const path = d3.line().curve(d3.curveStepAfter);
    const curves = lines.selectAll('path.cl-curve').data(shown, c => c.id);
    curves.exit().interrupt().remove();
    curves.enter().append('path').attr('class', 'cl-curve').merge(curves)
      .attr('data-series', c => c.id).attr('stroke', color).attr('stroke-dasharray', dash)
      .each(function(c) {
        const points = d3.range(101).map(i => { const year = Math.min(i, params.horizon); return [x(year), y(rowAt(c, year).cost)]; });
        const previous = lastPoints.get(c.id);
        const selected = d3.select(this).interrupt();
        if (animate && previous && !reduced.matches) {
          const interpolate = d3.interpolateArray(previous, points);
          selected.transition().duration(220).attrTween('d', () => t => path(interpolate(t)));
        } else selected.attr('d', path(points));
        lastPoints.set(c.id, points);
      });
    const events = shown.flatMap(c => [
      {year: c.summary.wholesaleYear, cost: params.benchmark, c, kind: 'wholesale'},
      {year: c.summary.targetYear, cost: params.target, c, kind: 'target'}
    ]).filter(e => e.year !== null).map(e => ({...e, actualCost: rowAt(e.c,e.year).cost}));
    lines.selectAll('circle.cl-event').data(events, e => e.c.id + e.kind).join('circle').attr('class', 'cl-event').attr('r', 3.5)
      .attr('cx', e => x(e.year)).attr('cy', e => y(e.actualCost)).attr('fill', e => color(e.c));
    if (width >= 530) shown.forEach(c => {
      annotations.append('text').attr('class', 'cl-end-label').attr('x', right - 8).attr('y', y(c.summary.finalCost) - 8).attr('text-anchor', 'end').text(money(c.summary.finalCost));
    });
    hit.attr('x', left).attr('y', top).attr('width', right - left).attr('height', bottom - top);
    guide.selectAll('*').remove();
    guide.append('line').attr('data-chart-hover-guide', '').attr('y1', top).attr('y2', bottom).attr('stroke', 'var(--muted-foreground)').attr('stroke-width', 1);
    tidyLabels();
    if (pinned && lastX !== null) showInspection(lastX, false);
  }

  function hideInspection() {
    tooltip.style.display = 'none'; guide.style('display', 'none');
  }
  function showInspection(year, announce) {
    if (!chartState) return;
    const state = chartState;
    year = Math.max(0, Math.min(params.horizon, year)); lastX = year;
    const pointX = state.x(year);
    guide.style('display', null);
    guide.select('[data-chart-hover-guide]').attr('x1', pointX).attr('x2', pointX);
    guide.selectAll('circle').data(state.shown, c => c.id).join('circle').attr('data-chart-hover-marker', '').attr('r', 4)
      .attr('cx', pointX).attr('cy', c => state.y(rowAt(c, year).cost)).attr('fill', color);
    tooltip.replaceChildren();
    const title = document.createElement('div'); title.textContent = 'Year ' + (Number.isInteger(year) ? year : year.toFixed(1)); tooltip.append(title);
    const accessible = [];
    state.shown.forEach(c => {
      const row = rowAt(c, year);
      const block = document.createElement('div'); block.className = 'cl-tooltip-row'; block.dataset.series = c.id;
      const name = document.createElement('span'); name.textContent = c.name;
      const cost = document.createElement('span'); cost.className = 'tabular-nums'; cost.textContent = money(row.cost) + ' · ' + number.format(row.completed) + ' units · ' + row.doublings.toFixed(2) + ' doublings';
      const production = document.createElement('span'); production.className = 'text-small'; production.textContent = number.format(row.orders) + ' new orders · ' + short.format(row.cumulativeGW) + ' GWe completed';
      block.append(name, cost, production); tooltip.append(block);
      accessible.push(c.name + ': ' + cost.textContent + ', ' + production.textContent);
    });
    tooltip.style.display = 'block';
    const chartBox = chart.getBoundingClientRect(), rootBox = root.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    let x = pointX + 14;
    if (x + box.width > state.width - 8) x = pointX - box.width - 14;
    x = Math.max(8, Math.min(x, state.width - box.width - 8));
    tooltip.style.left = x + 'px';
    tooltip.style.top = (chartBox.top - rootBox.top + state.top + 8) + 'px';
    inspect.value = Math.floor(year); $('#cl-year-value').textContent = Math.floor(year);
    if (announce) $('#cl-accessible-detail').textContent = 'Year ' + Math.floor(year) + '. ' + accessible.join('. ');
  }
  hit.on('pointermove', event => {
    if (pinned || event.pointerType === 'touch') return;
    const [px] = d3.pointer(event, svg.node()); showInspection(chartState.x.invert(px), false);
  }).on('pointerleave', () => { if (!pinned) hideInspection(); })
    .on('click', event => {
      if (pinned) { pinned = false; hideInspection(); return; }
      const [px] = d3.pointer(event, svg.node()); pinned = true; showInspection(chartState.x.invert(px), true); persist();
    });
  inspect.addEventListener('input', () => { pinned = true; showInspection(Number(inspect.value), true); persist(); });
  root.addEventListener('pointerdown', event => {
    if (!chart.contains(event.target) && event.target !== inspect) { pinned = false; hideInspection(); }
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { pinned = false; hideInspection(); } });
  function update(animate) {
    cases = M.simulateAll(params); updateLegend(); updateTable(); draw(animate);
  }
  syncInputs(); update(false);
  new ResizeObserver(entries => {
    const width = Math.floor(entries[0].contentRect.width);
    if (Math.abs(width - lastWidth) > 1) draw(false);
  }).observe(chart);
  globalThis.CompactLearningView = {getState: () => ({params: {...params}, visible: [...visible], cases}), redraw: () => draw(false)};
})();
