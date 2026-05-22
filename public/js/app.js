/**
 * NexSearch — Frontend App Logic
 */

// ─── State ───────────────────────────────────────────────────────────
const state = {
  apiKey: localStorage.getItem('nexsearch_api_key') || 'searchengine-dev-key-2024',
  currentQuery: '',
  currentPage: 1,
  currentType: 'web',
  researchData: null,
};

// ─── DOM Helpers ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = 'block'; };
const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };
const html = (id, content) => { const el = $(id); if (el) el.innerHTML = content; };

// ─── Toast ────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = $('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ─── API Fetch ────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'X-Api-Key': state.apiKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Tab Navigation (header + sidebar tabs) ───────────────────────
function switchTab(tab) {
  // Update header nav tabs
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  // Update sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  // Switch content
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tabEl = $(`tab-${tab}`);
  if (tabEl) tabEl.classList.add('active');
}

document.querySelectorAll('.nav-tab').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
);

// ─── Mobile Sidebar ───────────────────────────────────────────────
const sidebar        = $('sidebar');
const sidebarOverlay = $('sidebarOverlay');
const hamburgerBtn   = $('hamburgerBtn');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  hamburgerBtn.classList.add('open');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
  sidebar.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden'; // prevent scroll behind
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  hamburgerBtn.classList.remove('open');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  sidebar.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

hamburgerBtn.addEventListener('click', () =>
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar()
);
sidebarOverlay.addEventListener('click', closeSidebar);
$('sidebarClose').addEventListener('click', closeSidebar);

// Sidebar nav tabs — switch content AND close sidebar
document.querySelectorAll('.sidebar-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    closeSidebar();
  });
});

// Swipe left to close sidebar
let _touchStartX = 0;
sidebar.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
sidebar.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - _touchStartX;
  if (dx < -60) closeSidebar(); // swipe left 60px to close
}, { passive: true });

// Close sidebar on Escape key
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

// ─── API Key Modal ────────────────────────────────────────────────
function openApiKeyModal() { $('apiKeyInput').value = state.apiKey; show('apiKeyModal'); }
$('apiKeyBtn').addEventListener('click', openApiKeyModal);
$('sidebarApiKeyBtn').addEventListener('click', () => { closeSidebar(); openApiKeyModal(); });
$('closeModal').addEventListener('click', () => hide('apiKeyModal'));
$('cancelModal').addEventListener('click', () => hide('apiKeyModal'));
$('saveApiKey').addEventListener('click', () => {
  const key = $('apiKeyInput').value.trim();
  if (!key) return showToast('API key cannot be empty', 'error');
  state.apiKey = key;
  localStorage.setItem('nexsearch_api_key', key);
  hide('apiKeyModal');
  showToast('API key saved!', 'success');
  updateApiKeyDisplay();
});
$('apiKeyModal').addEventListener('click', (e) => { if (e.target === $('apiKeyModal')) hide('apiKeyModal'); });


function updateApiKeyDisplay() {
  const display = $('apiKeyValue');
  if (display) display.textContent = state.apiKey ? `${state.apiKey.slice(0, 8)}${'•'.repeat(Math.max(0, state.apiKey.length - 8))}` : 'Not set';
}
updateApiKeyDisplay();

// Set base URL
const baseUrlEl = $('baseUrlDisplay');
if (baseUrlEl) baseUrlEl.textContent = window.location.origin;

// ─── SEARCH ───────────────────────────────────────────────────────────
function buildResultCard(r, index) {
  const favicon = `https://www.google.com/s2/favicons?domain=${r.domain}&sz=16`;
  return `
    <div class="result-card" style="animation-delay:${index * 0.05}s">
      <div class="result-domain">
        <img class="domain-favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'"/>
        <span class="domain-text">${escHtml(r.domain || '')}</span>
      </div>
      <div class="result-title"><a href="${escHtml(r.url)}" target="_blank" rel="noopener">${escHtml(r.title || 'Untitled')}</a></div>
      <div class="result-snippet">${escHtml(r.snippet || '')}</div>
      <div class="result-meta">
        <button class="scrape-inline-btn" onclick="quickScrape('${escHtml(r.url)}')">🕷 Read full page</button>
      </div>
    </div>`;
}

function buildInstantAnswer(ia) {
  const text = ia.abstract || ia.answer || ia.definition || '';
  const source = ia.abstractUrl || ia.definitionSource || '';
  const title = ia.abstractSource || 'Quick Answer';
  if (!text) return;
  $('instantTitle').textContent = title;
  $('instantText').textContent = text;
  const srcEl = $('instantSource');
  if (source) { srcEl.href = source; srcEl.textContent = `→ Read more on ${source}`; }
  show('instantAnswer');
}

async function doSearch(page = 1) {
  const q = $('searchInput').value.trim();
  const type = $('searchType').value;
  if (!q) return;

  state.currentQuery = q; state.currentPage = page; state.currentType = type;
  hide('emptyState'); hide('resultsContainer'); hide('instantAnswer');
  show('loadingState');
  if (page === 1) html('resultsList', '');

  try {
    let endpoint = `/api/search?q=${encodeURIComponent(q)}&page=${page}`;
    if (type === 'news') endpoint = `/api/search/news?q=${encodeURIComponent(q)}`;
    if (type === 'instant') endpoint = `/api/search/instant?q=${encodeURIComponent(q)}`;

    const data = await apiFetch(endpoint);
    hide('loadingState'); show('resultsContainer');

    if (type === 'instant') {
      html('resultsMeta', '⚡ Instant Answer');
      buildInstantAnswer(data.data || {});
      html('resultsList', '');
      hide('loadMoreContainer');
      return;
    }

    const results = data.data?.results || [];
    const ia = data.data?.instantAnswer;
    if (ia && page === 1) buildInstantAnswer(ia);

    html('resultsMeta', `About <strong>${results.length}</strong> results${data.cached ? ' (cached)' : ''}`);
    const cards = results.map((r, i) => buildResultCard(r, i)).join('');
    if (page === 1) html('resultsList', cards);
    else $('resultsList').insertAdjacentHTML('beforeend', cards);

    if (results.length >= 8 && type === 'web') show('loadMoreContainer');
    else hide('loadMoreContainer');
  } catch (err) {
    hide('loadingState'); show('resultsContainer');
    html('resultsMeta', '');
    html('resultsList', `<div class="scraped-fail">❌ Search failed: ${escHtml(err.message)}</div>`);
  }
}

$('searchBtn').addEventListener('click', () => doSearch(1));
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(1); });
$('loadMoreBtn').addEventListener('click', () => doSearch(state.currentPage + 1));

// ─── DEEP RESEARCH ────────────────────────────────────────────────────
async function animateResearchSteps() {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  const delays = [0, 2000, 4500, 8000];
  steps.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) { const prev = $(steps[i - 1]); if (prev) { prev.classList.remove('active'); prev.classList.add('done'); } }
      const el = $(id); if (el) el.classList.add('active');
    }, delays[i]);
  });
}

$('runResearchBtn').addEventListener('click', async () => {
  const topic = $('researchTopic').value.trim();
  if (!topic) return showToast('Please enter a research topic', 'error');

  hide('researchResults');
  show('researchLoading');
  ['step1','step2','step3','step4'].forEach(id => { const el = $(id); if(el){el.classList.remove('active','done');} });
  animateResearchSteps();

  try {
    const data = await apiFetch('/api/research', {
      method: 'POST',
      body: JSON.stringify({
        topic,
        maxResults: parseInt($('maxResults').value) || 10,
        maxScrape: parseInt($('maxScrape').value) || 5,
        scrapeContent: $('scrapeContent').checked,
        region: $('researchRegion').value,
      }),
    });

    hide('researchLoading');
    state.researchData = data.data;
    renderResearchResults(data.data);
    show('researchResults');
  } catch (err) {
    hide('researchLoading');
    showToast(`Research failed: ${err.message}`, 'error');
  }
});

function renderResearchResults(d) {
  // Stats
  const s = d.stats || {};
  html('researchStats', `
    <div class="stat-chip">🔍 ${s.totalResultsFound || 0} results found</div>
    <div class="stat-chip">📄 ${s.rankedCount || 0} ranked</div>
    <div class="stat-chip">🕷 ${s.pagesScraped || 0} pages scraped</div>
    <div class="stat-chip">⏱ ${((s.elapsedMs || 0)/1000).toFixed(1)}s</div>
  `);

  // AI Context
  $('aiContextBox').textContent = d.aiContext || 'No context generated.';

  // Search Results
  html('researchResultList', (d.searchResults || []).map((r, i) => buildResultCard(r, i)).join('') || '<p style="color:var(--text-muted)">No results.</p>');

  // Scraped Pages
  html('scrapedPagesList', (d.scrapedPages || []).map((p, i) => {
    if (!p.success) return `<div class="scraped-page-card"><div class="scraped-fail">❌ Failed: ${escHtml(p.url)} — ${escHtml(p.error)}</div></div>`;
    return `
      <div class="scraped-page-card">
        <div class="scraped-page-header" onclick="toggleScrapedPage('sp-${i}')">
          <div>
            <div class="scraped-page-title">${escHtml(p.title || p.url)}</div>
            <div class="scraped-page-url">${escHtml(p.url)}</div>
          </div>
          <span>▾</span>
        </div>
        <div class="scraped-page-body" id="sp-${i}">
          ${p.metaDescription ? `<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">${escHtml(p.metaDescription)}</p>` : ''}
          <pre class="scraped-content-text">${escHtml(p.content || '')}</pre>
        </div>
      </div>`;
  }).join('') || '<p style="color:var(--text-muted)">No pages scraped.</p>');

  // Raw JSON
  $('rawJsonBox').textContent = JSON.stringify(d, null, 2);
}

function toggleScrapedPage(id) {
  const el = $(id); if (!el) return;
  el.classList.toggle('open');
}

// Research tab switching
document.querySelectorAll('.res-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.restab;
    document.querySelectorAll('.res-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const el = $(`restab-${tab}`); if (el) el.classList.add('active');
  });
});

$('copyContextBtn').addEventListener('click', () => {
  const text = $('aiContextBox').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Context copied!', 'success'));
});
$('copyJsonBtn').addEventListener('click', () => {
  const text = $('rawJsonBox').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('JSON copied!', 'success'));
});

// ─── SCRAPER ─────────────────────────────────────────────────────────
async function quickScrape(url) {
  // Switch to scrape tab and pre-fill URL
  document.querySelector('[data-tab="scrape"]').click();
  $('scrapeUrl').value = url;
  await runScrape(url);
}

async function runScrape(url) {
  if (!url) return;
  hide('scrapeResults'); show('scrapeLoading');
  try {
    const data = await apiFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ url, maxLength: parseInt($('scrapeMaxLength').value) || 5000 }),
    });
    hide('scrapeLoading');
    renderScrapeResult(data.data);
  } catch (err) {
    hide('scrapeLoading');
    $('scrapeResults').innerHTML = `<div class="scraped-fail">❌ ${escHtml(err.message)}</div>`;
    show('scrapeResults');
  }
}

function renderScrapeResult(d) {
  $('scrapeResults').innerHTML = `
    <div class="scraped-page-card">
      <div class="scraped-page-header" style="cursor:default">
        <div>
          <div class="scraped-page-title">${escHtml(d.title || d.url)}</div>
          <div class="scraped-page-url"><a href="${escHtml(d.url)}" target="_blank" rel="noopener">${escHtml(d.url)}</a></div>
        </div>
        <span style="color:var(--text-muted);font-size:.8rem">${d.wordCount || 0} words</span>
      </div>
      <div class="scraped-page-body open" style="padding:20px">
        ${d.metaDescription ? `<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px;border-left:3px solid var(--accent);padding-left:12px">${escHtml(d.metaDescription)}</p>` : ''}
        ${d.headings && d.headings.length ? `<div style="margin-bottom:12px"><strong style="font-size:.82rem;color:var(--text-muted)">HEADINGS</strong><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${d.headings.slice(0,10).map(h=>`<span style="padding:3px 10px;border-radius:6px;background:rgba(99,102,241,.1);font-size:.78rem;color:var(--accent)">${escHtml(h.text)}</span>`).join('')}</div></div>` : ''}
        <pre class="scraped-content-text">${escHtml(d.content || '')}</pre>
      </div>
    </div>`;
  show('scrapeResults');
}

$('scrapeBtn').addEventListener('click', () => runScrape($('scrapeUrl').value.trim()));
$('scrapeUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') runScrape($('scrapeUrl').value.trim()); });

$('batchScrapeBtn').addEventListener('click', async () => {
  const raw = $('batchUrls').value.trim();
  const urls = raw.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
  if (!urls.length) return showToast('Enter at least one valid URL', 'error');
  hide('scrapeResults'); show('scrapeLoading');
  try {
    const data = await apiFetch('/api/scrape/batch', {
      method: 'POST',
      body: JSON.stringify({ urls, maxLength: 3000 }),
    });
    hide('scrapeLoading');
    $('scrapeResults').innerHTML = (data.data || []).map((p) => {
      if (!p.success) return `<div class="scraped-page-card"><div class="scraped-fail">❌ ${escHtml(p.url)} — ${escHtml(p.error)}</div></div>`;
      return `<div class="scraped-page-card">
        <div class="scraped-page-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <div><div class="scraped-page-title">${escHtml(p.title||p.url)}</div><div class="scraped-page-url">${escHtml(p.url)}</div></div>
          <span>▾</span>
        </div>
        <div class="scraped-page-body"><pre class="scraped-content-text">${escHtml(p.content||'')}</pre></div>
      </div>`;
    }).join('');
    show('scrapeResults');
    showToast(`Scraped ${data.meta?.successful || 0}/${data.meta?.total || 0} pages`, 'success');
  } catch (err) {
    hide('scrapeLoading');
    showToast(`Batch failed: ${err.message}`, 'error');
  }
});

// ─── Escape HTML ──────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────
$('searchInput').focus();

// ─── LOGS TAB ─────────────────────────────────────────────────────────
const logsState = { total:0, ok:0, warn:0, err:0, times:[] };
let logEventSource = null;

function statusClass(s) {
  if (s >= 500) return 's5';
  if (s >= 400) return 's4';
  if (s >= 200) return 's2';
  return 's0';
}

function buildLogRow(log, isNew = false) {
  const sc = statusClass(log.status);
  const authClass = (log.authType || '-').replace(/[^a-zA-Z0-9-_]/g, '');
  const hasDetail = !!(log.body || log.query);

  // Main row
  const tr = document.createElement('tr');
  tr.classList.add('log-row');
  if (hasDetail) tr.classList.add('log-row-expandable');
  if (isNew) { tr.classList.add('log-new'); setTimeout(() => tr.classList.remove('log-new'), 1200); }

  const chevron = hasDetail ? `<span class="log-chevron">▶</span>` : `<span class="log-chevron-placeholder"></span>`;
  tr.innerHTML = `
    <td>${chevron}${escHtml(log.time || '')}</td>
    <td><span class="log-badge ${sc}">${escHtml(String(log.status || '?'))}</span></td>
    <td><span class="log-method ${escHtml(log.method || '')}">${escHtml(log.method || '')}</span></td>
    <td class="log-url">${escHtml(log.url || '')}</td>
    <td class="log-col-auth"><span class="log-auth ${authClass}">${escHtml(log.authType || '-')}</span></td>
    <td class="log-col-ip">${escHtml((log.ip || '').replace('::ffff:','').replace('::1','localhost'))}</td>
    <td class="log-col-ms">${escHtml(String(log.time_ms ?? log.time ?? '?'))}ms</td>`;

  // Detail row (hidden by default)
  const detailTr = document.createElement('tr');
  detailTr.classList.add('log-detail-row');
  detailTr.style.display = 'none';

  const sections = [];
  if (log.query && Object.keys(log.query).length > 0) {
    // Filter out api_key from display
    const q = { ...log.query };
    delete q.api_key;
    if (Object.keys(q).length > 0)
      sections.push(`<div class="log-detail-section"><span class="log-detail-label">🔍 Query Params</span><pre class="log-detail-json">${escHtml(JSON.stringify(q, null, 2))}</pre></div>`);
  }
  if (log.body) {
    sections.push(`<div class="log-detail-section"><span class="log-detail-label">📦 Request Body</span><pre class="log-detail-json">${escHtml(JSON.stringify(log.body, null, 2))}</pre></div>`);
  }

  detailTr.innerHTML = `<td colspan="7"><div class="log-detail-panel">${sections.join('') || '<span style="color:var(--text-muted)">No detail available</span>'}</div></td>`;

  // Toggle on row click
  if (hasDetail) {
    tr.addEventListener('click', () => {
      const isOpen = detailTr.style.display !== 'none';
      detailTr.style.display = isOpen ? 'none' : 'table-row';
      const chev = tr.querySelector('.log-chevron');
      if (chev) chev.textContent = isOpen ? '▶' : '▼';
      tr.classList.toggle('log-row-open', !isOpen);
    });
  }

  // Return both rows as a fragment
  const frag = document.createDocumentFragment();
  frag.appendChild(tr);
  frag.appendChild(detailTr);
  return frag;
}

function updateLogStats() {
  $('logTotal').textContent = logsState.total;
  $('logOk').textContent    = logsState.ok;
  $('logWarn').textContent  = logsState.warn;
  $('logErr').textContent   = logsState.err;
  if (logsState.times.length > 0) {
    const avg = Math.round(logsState.times.reduce((a,b) => a+b, 0) / logsState.times.length);
    $('logAvgTime').textContent = avg + 'ms';
  }
}

function addLogEntry(log, isNew = false) {
  const tbody = $('logTableBody');
  const empty = tbody.querySelector('.log-empty-row');
  if (empty) empty.remove();

  // Update counters
  logsState.total++;
  if (log.status >= 500) logsState.err++;
  else if (log.status >= 400) logsState.warn++;
  else logsState.ok++;
  if (log.time) logsState.times.push(parseInt(log.time));
  if (logsState.times.length > 200) logsState.times.shift();
  updateLogStats();

  // Insert fragment (main row + detail row) at top
  const frag = buildLogRow({ ...log, time_ms: log.time }, isNew);
  tbody.insertBefore(frag, tbody.firstChild);

  if ($('logAutoScroll').checked) $('logTableWrap').scrollTop = 0;
}


function setLogStatus(status) {
  const dot  = $('logStatusDot');
  const text = $('logStatusText');
  dot.className = 'log-status-dot ' + status;
  const labels = { connected:'🟢 Connected — live', connecting:'⏳ Connecting...', error:'🔴 Disconnected' };
  text.textContent = labels[status] || status;
}

function connectLogStream() {
  if (logEventSource) { logEventSource.close(); logEventSource = null; }
  setLogStatus('connecting');

  const url = `/api/logs/stream?api_key=${encodeURIComponent(state.apiKey)}`;
  const es = new EventSource(url);
  logEventSource = es;

  es.onopen = () => setLogStatus('connected');

  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type === 'init') {
        // Bulk load existing logs (newest first, already sorted)
        payload.logs.forEach(log => addLogEntry(log, false));
      } else {
        // Single new log entry
        addLogEntry(payload, true);
      }
    } catch {}
  };

  es.onerror = () => {
    setLogStatus('error');
    es.close();
    logEventSource = null;
    // Retry after 5 seconds
    setTimeout(() => {
      if ($('tab-logs').classList.contains('active')) connectLogStream();
    }, 5000);
  };
}

// Connect when Logs tab is opened
document.querySelectorAll('.nav-tab').forEach(btn => {
  const orig = btn.onclick;
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'logs' && !logEventSource) {
      connectLogStream();
    }
  });
});

// Clear logs button
$('clearLogsBtn').addEventListener('click', async () => {
  try {
    await apiFetch('/api/logs', { method: 'DELETE' });
    $('logTableBody').innerHTML = '<tr class="log-empty-row"><td colspan="7">Logs cleared.</td></tr>';
    Object.assign(logsState, { total:0, ok:0, warn:0, err:0, times:[] });
    updateLogStats();
    showToast('Logs cleared', 'success');
  } catch (e) {
    showToast('Failed to clear logs: ' + e.message, 'error');
  }
});
