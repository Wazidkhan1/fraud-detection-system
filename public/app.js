/* No framework or external CDN is required for the dashboard. */
const $ = (selector) => document.querySelector(selector);
const icons = {
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  arrows: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  flag: '<path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18m-5 5h5m-5 3h1M3 5l14-3v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', play: '<path d="m8 4 12 8-12 8Z"/>',
  pie: '<path d="M11 3a9 9 0 1 0 10 10H11Zm4 0v6h6a8 8 0 0 0-6-6Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
};
function drawIcons() {
  document.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[element.dataset.icon] || icons.grid}</svg>`;
  });
}
drawIcons();
const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = (value) => new Intl.NumberFormat('en-IN').format(value);
const money = (minor) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100);
const compactMoney = (minor) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
const time = (value) => new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
const fullTime = (value) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const statuses = { pending: 'Pending review', not_required: 'No review needed', fraud: 'Confirmed fraud', legitimate: 'Legitimate' };
const state = { page: 'overview', offset: 0, limit: 8, total: 0, accounts: [], hours: 24, stats: null,
  model: null, health: null, simulation: null, simulating: false, listSerial: 0, detailSerial: 0 };
let refreshTimer, toastTimer;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function errorBanner(message) {
  $('#error-banner').textContent = message;
  $('#error-banner').hidden = !message;
}

function renderChart() {
  if (!state.stats) return;
  const rows = state.stats.hourly;
  const now = new Date(); now.setUTCMinutes(0, 0, 0);
  const points = Array.from({ length: state.hours }, (_, index) => {
    const hour = new Date(now.getTime() - (state.hours - 1 - index) * 3600000).toISOString();
    return rows.find((row) => row.hour === hour) || { hour, total: 0, flagged: 0 };
  });
  const width = Math.max(270, $('#activity-chart').clientWidth - 24), height = 220, left = 30, top = 12, bottom = 185, chartWidth = width - 45;
  const maximum = Math.max(4, ...points.map((point) => point.total));
  const step = chartWidth / points.length, barWidth = Math.max(4, step * 0.45);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Hourly transaction counts over the last ${state.hours} hours">`;
  for (let index = 0; index < 5; index++) {
    const y = bottom - index * (bottom - top) / 4;
    svg += `<line x1="${left}" x2="${width - 10}" y1="${y}" y2="${y}" class="chart-grid"/><text x="20" y="${y + 3}" text-anchor="end" class="chart-label">${Math.round(maximum * index / 4)}</text>`;
  }
  points.forEach((point, index) => {
    const x = left + index * step + (step - barWidth) / 2;
    const barHeight = point.total / maximum * (bottom - top);
    const flaggedHeight = point.flagged / maximum * (bottom - top);
    const label = `${fullTime(point.hour)} IST: ${point.total} transactions, ${point.flagged} high risk`;
    svg += `<rect x="${x}" y="${bottom - barHeight}" width="${barWidth}" height="${barHeight}" class="chart-bar"><title>${label}</title></rect>`;
    if (point.flagged) svg += `<rect x="${x}" y="${bottom - flaggedHeight}" width="${barWidth}" height="${flaggedHeight}" rx="2" class="chart-flagged"><title>${label}</title></rect>`;
    if (index % Math.ceil(points.length / (width < 400 ? 3 : 5)) === 0 || index === points.length - 1)
      svg += `<text x="${x + barWidth / 2}" y="210" text-anchor="middle" class="chart-label">${time(point.hour)}</text>`;
  });
  $('#activity-chart').innerHTML = svg + '</svg>';
  $('#chart-range').textContent = `Last ${state.hours} hours · IST`;
}

function renderStats(stats) {
  state.stats = stats;
  $('#total-count').textContent = number(stats.total);
  $('#total-volume').textContent = compactMoney(stats.volumeMinor);
  $('#high-count').textContent = number(stats.high);
  $('#pending-count').textContent = number(stats.pending);
  $('#nav-pending').textContent = number(stats.pending);
  $('#flagged-volume').textContent = compactMoney(stats.flaggedVolumeMinor);
  $('#donut-total').textContent = number(stats.total);
  const circumference = 2 * Math.PI * 62;
  let offset = 0;
  const groups = [ ['low', 'Low risk', '#54b69f'], ['medium', 'Medium risk', '#e7b95f'], ['high', 'High risk', '#e88b98'] ];
  $('#donut-segments').innerHTML = groups.map(([key, , color]) => {
    const length = stats.total ? stats[key] / stats.total * circumference : 0;
    const result = `<circle cx="80" cy="80" r="62" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"/>`;
    offset += length;
    return result;
  }).join('');
  $('#risk-legend').innerHTML = groups.map(([key, label]) => `<div><i class="risk-dot ${key}"></i>${label}<strong>${stats[key]}</strong><em>${stats.total ? Math.round(stats[key] / stats.total * 100) : 0}%</em></div>`).join('');
  renderChart();
}

async function loadTransactions() {
  const serial = ++state.listSerial;
  const parameters = new URLSearchParams({ limit: state.limit, offset: state.offset,
    risk: $('#risk-filter').value, review: state.page === 'reviews' ? 'pending' : $('#review-filter').value, search: $('#search').value.trim() });
  const result = await api(`/transactions?${parameters}`);
  if (serial !== state.listSerial) return;
  if (result.total && state.offset >= result.total) {
    state.offset = Math.floor((result.total - 1) / state.limit) * state.limit;
    return loadTransactions();
  }
  state.total = result.total;
  $('#ledger-total').textContent = number(result.total);
  $('#transaction-rows').innerHTML = result.items.length ? result.items.map((transaction) => `<tr data-id="${transaction.id}">
    <td><div class="merchant-cell"><span class="merchant-icon">${escapeHtml(transaction.merchant[0].toUpperCase())}</span><div><strong>${escapeHtml(transaction.merchant)}</strong><small>${escapeHtml(transaction.externalId)}</small></div></div></td>
    <td><strong>${escapeHtml(transaction.accountName)}</strong><small>${escapeHtml(transaction.accountId)}</small></td>
    <td><strong>${money(transaction.amountMinor)}</strong><small>${escapeHtml(transaction.channel.replace('_', ' '))} · ${escapeHtml(transaction.country)}</small></td>
    <td><div class="risk-cell"><span class="risk-number ${transaction.riskLevel}">${transaction.riskScore}</span><span class="pill ${transaction.riskLevel}">${transaction.riskLevel[0].toUpperCase() + transaction.riskLevel.slice(1)}</span></div></td>
    <td><span class="pill ${transaction.reviewStatus}">${statuses[transaction.reviewStatus]}</span></td>
    <td>${time(transaction.createdAt)}<small>${new Date(transaction.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}</small></td>
    <td><button class="icon-button detail-button" data-id="${transaction.id}" aria-label="View ${escapeHtml(transaction.merchant)} transaction">→</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No transactions match this view.</td></tr>';
  $('#pagination-label').textContent = result.total ? `Showing ${state.offset + 1}–${Math.min(state.offset + state.limit, result.total)} of ${number(result.total)} transactions` : '0 transactions';
  $('#previous').disabled = state.offset === 0;
  $('#next').disabled = state.offset + state.limit >= result.total;
}

async function refresh() {
  try {
    const [stats] = await Promise.all([api('/stats'), loadTransactions()]);
    renderStats(stats);
    errorBanner('');
  } catch (error) { errorBanner(error.message); }
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150); }

function navigate() {
  const page = location.hash.slice(1) || 'overview';
  state.page = ['overview', 'transactions', 'reviews', 'model'].includes(page) ? page : 'overview';
  const labels = {
    overview: ['Your risk, in focus.', 'A clear view of transactions. An earlier signal of risk.'],
    transactions: ['Every transaction, visible.', 'Explore the ledger and inspect the signals behind each score.'],
    reviews: ['A closer look at risk.', 'Review flagged transactions and record your assessment.'],
    model: ['Meet the model.', 'Transparent features, measured results, and honest limitations.'],
  };
  $('#page-title').textContent = labels[state.page][0];
  $('#page-description').textContent = labels[state.page][1];
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === state.page);
    link.setAttribute('aria-label', link.dataset.page === 'reviews' ? 'Review queue' : link.dataset.page);
    link.dataset.page === state.page ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
  });
  $('#overview-page').hidden = state.page !== 'overview';
  $('#transactions-page').hidden = state.page === 'model';
  $('#model-page').hidden = state.page !== 'model';
  $('#ledger-title').firstChild.textContent = state.page === 'reviews' ? 'Awaiting your review ' : state.page === 'transactions' ? 'Transaction ledger ' : 'Recent transactions ';
  $('#ledger-subtitle').textContent = state.page === 'reviews' ? 'High and medium risk signals that need an analyst decision.' : 'Every transaction scored. Every signal visible.';
  $('#review-filter').disabled = state.page === 'reviews';
  state.offset = 0;
  if (state.health) loadTransactions().catch((error) => errorBanner(error.message));
}
window.addEventListener('hashchange', navigate);
window.addEventListener('resize', renderChart);
$('#risk-filter').addEventListener('change', () => { state.offset = 0; scheduleRefresh(); });
$('#review-filter').addEventListener('change', () => { state.offset = 0; scheduleRefresh(); });
$('#search').addEventListener('input', () => { state.offset = 0; scheduleRefresh(); });
$('#refresh').addEventListener('click', refresh);
$('#previous').addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); scheduleRefresh(); });
$('#next').addEventListener('click', () => { state.offset += state.limit; scheduleRefresh(); });
document.querySelectorAll('[data-hours]').forEach((button) => button.addEventListener('click', () => {
  state.hours = Number(button.dataset.hours);
  document.querySelectorAll('[data-hours]').forEach((item) => item.classList.toggle('selected', item === button));
  renderChart();
}));

function showDialog(dialog) { if (!dialog.open) dialog.showModal(); }
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right)) dialog.close();
}));
$('#new-transaction').addEventListener('click', () => { $('#form-error').textContent = ''; showDialog($('#transaction-dialog')); });
$('#account-select').addEventListener('change', () => {
  const account = state.accounts.find((item) => item.id === $('#account-select').value);
  if (account) $('#device-input').value = account.knownDevices[0] || 'new-device';
});
$('#transaction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const amountMinor = Math.round(Number(form.get('amount')) * 100);
  $('#submit-transaction').disabled = true;
  $('#form-error').textContent = '';
  try {
    const result = await post('/transactions', { externalId: `MANUAL-${crypto.randomUUID()}`, accountId: form.get('accountId'),
      merchant: form.get('merchant'), amountMinor, currency: 'INR', country: form.get('country'),
      deviceId: form.get('deviceId'), channel: form.get('channel') });
    $('#transaction-dialog').close();
    toast(`Transaction analyzed · ${result.transaction.riskLevel} risk · score ${result.transaction.riskScore}/100`);
    state.offset = 0;
    await refresh();
    await openDetails(result.transaction.id);
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#submit-transaction').disabled = false; }
});

async function openDetails(id) {
  const serial = ++state.detailSerial;
  $('#transaction-details').textContent = 'Loading assessment…';
  showDialog($('#details-dialog'));
  try {
    const transaction = await api(`/transactions/${id}`);
    if (serial !== state.detailSerial) return;
    $('#transaction-details').innerHTML = `<div class="score-card"><div><strong>${transaction.riskScore}</strong><small> / 100</small><p>Model signal · not a calibrated probability</p></div><span class="pill ${transaction.riskLevel}">${transaction.riskLevel.toUpperCase()} RISK</span></div>
      <dl class="detail-list">${[
        ['Merchant', transaction.merchant], ['Account', `${transaction.accountName} · ${transaction.accountId}`],
        ['Amount', money(transaction.amountMinor)], ['Country', transaction.country], ['Device', transaction.deviceId],
        ['Received', `${fullTime(transaction.createdAt)} IST`], ['Model', transaction.modelVersion],
        ['Reference', transaction.externalId], ['Review', statuses[transaction.reviewStatus]],
      ].map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      <div class="detail-section"><h3>Observed risk indicators</h3>${transaction.indicators.length ? transaction.indicators.map((item) => `<div class="indicator">↗ ${escapeHtml(item.label)}</div>`).join('') : '<p class="detail-help">No configured risk indicators were triggered.</p>'}<p class="detail-help">These are behavioral conditions, not feature attributions from the neural network.</p></div>
      ${transaction.reviewStatus === 'pending' ? '<div class="detail-section"><h3>Record your assessment</h3><form id="review-form"><label class="sr-only" for="review-note">Review note</label><textarea id="review-note" required maxlength="500" placeholder="Add a brief reason for your decision…"></textarea><p class="inline-error" id="review-error" role="alert"></p><div class="review-buttons"><button class="button secondary" name="verdict" value="legitimate" type="submit">Mark legitimate</button><button class="button danger" name="verdict" value="fraud" type="submit">Confirm fraud</button></div></form></div>' : ''}
      ${transaction.reviews.length ? `<div class="detail-section"><h3>Review history</h3>${transaction.reviews.map((review) => `<div class="review-record"><strong>${escapeHtml(statuses[review.verdict])}</strong> · ${fullTime(review.created_at)} IST<p>${escapeHtml(review.note)}</p></div>`).join('')}</div>` : ''}`;
    $('#review-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const buttons = [...event.target.querySelectorAll('button')];
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await post(`/transactions/${id}/review`, { verdict: event.submitter.value, note: $('#review-note').value });
        toast('Assessment saved to the review history.');
        await Promise.all([openDetails(id), refresh()]);
      } catch (error) { if ($('#review-error')) $('#review-error').textContent = error.message; }
      finally { buttons.forEach((button) => { button.disabled = false; }); }
    });
  } catch (error) { $('#transaction-details').textContent = error.message; }
}
$('#transaction-rows').addEventListener('click', (event) => {
  const row = event.target.closest('[data-id]');
  if (row) openDetails(row.dataset.id);
});

function renderModel(model) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  $('#model-metrics').innerHTML = [['precision', 'Precision'], ['recall', 'Recall'], ['f1', 'F1 score']].map(([key, name]) => `<div><strong>${percent(model.test[key])}</strong><span>${name} · synthetic</span></div>`).join('');
  $('#model-facts').innerHTML = [ ['Model version', model.version], ['Architecture', model.architecture],
    ['Training / validation / test', `${model.trainCount} / ${model.validationCount} / ${model.testCount}`],
    ['High-risk threshold', `${Math.round(model.threshold * 100)}/100 (selected on validation F1)`],
    ['Framework', model.framework], ['Training completed', `${fullTime(model.trainedAt)} IST`],
  ].map(([key, value]) => `<div><span>${key}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('#confusion').innerHTML = [['tp', 'True positives'], ['fp', 'False positives'], ['tn', 'True negatives'], ['fn', 'False negatives']].map(([key, name]) => `<div>${name}<strong>${model.test.confusion[key]}</strong></div>`).join('');
  $('#footer-model').textContent = `Model ${model.version} · 8 behavioral features`;
}

function stopSimulation() {
  state.simulating = false;
  clearTimeout(state.simulation);
  $('#simulate-label').textContent = 'Start simulation';
  $('#simulate').setAttribute('aria-pressed', 'false');
}
async function simulateNext() {
  if (!state.simulating) return;
  try { await post('/demo/transactions', {}); }
  catch (error) { stopSimulation(); toast(error.message); return; }
  if (state.simulating) state.simulation = setTimeout(simulateNext, 2500);
}
$('#simulate').addEventListener('click', () => {
  if (state.simulating) { stopSimulation(); return; }
  state.simulating = true;
  $('#simulate-label').textContent = 'Pause simulation';
  $('#simulate').setAttribute('aria-pressed', 'true');
  simulateNext();
});

async function initialize() {
  $('#today').textContent = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  navigate();
  try {
    const [health, model, accounts] = await Promise.all([api('/health'), api('/model'), api('/accounts')]);
    state.health = health; state.model = model; state.accounts = accounts;
    $('#sidebar-storage').textContent = health.storage === 'demo' ? 'Embedded PostgreSQL · demo' : 'PostgreSQL connected';
    $('#storage-notice').textContent = health.storage === 'demo' ? 'Records reset when the server stops.' : 'Records persist in PostgreSQL.';
    if (!health.demoEnabled) {
      $('#demo-notice').firstElementChild.nextElementSibling.innerHTML = '<strong>Local development workspace.</strong> Model trained on synthetic data. Records persist in PostgreSQL.';
      $('#simulate').hidden = true;
      $('.drawer-description').textContent = 'Submit a transaction to evaluate the model signal.';
    }
    $('#account-select').innerHTML = accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(account.id)}</option>`).join('');
    $('#device-input').value = accounts[0]?.knownDevices[0] || 'new-device';
    $('#new-transaction').disabled = !accounts.length;
    renderModel(model);
    await refresh();
    const stream = new EventSource('/api/events');
    stream.addEventListener('open', () => { $('#connection').innerHTML = '<i></i>Live monitoring'; $('#connection').classList.remove('offline'); scheduleRefresh(); });
    stream.addEventListener('error', () => { $('#connection').innerHTML = '<i></i>Reconnecting'; $('#connection').classList.add('offline'); });
    stream.addEventListener('transaction', scheduleRefresh);
    stream.addEventListener('review', scheduleRefresh);
    window.addEventListener('pagehide', () => { stopSimulation(); stream.close(); });
  } catch (error) { errorBanner(`${error.message} Refresh this page after checking the server.`); }
}
initialize();
