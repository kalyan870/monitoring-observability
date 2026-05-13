const STORE_KEY = 'monitor_observability_store';

function getStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { requests: [], qualityScores: [], createdAt: new Date().toISOString() };
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupTraceSearch();
  renderAll();

  // Generate initial sample data
  if (!getStore().requests.length) {
    for (let i = 0; i < 5; i++) generateTrace();
    renderAll();
  }
});

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`section-${section}`)?.classList.add('active');

      if (section === 'traces') renderTraces();
      if (section === 'latency') renderLatency();
      if (section === 'costs') renderCosts();
      if (section === 'quality') renderQuality();
      if (section === 'ci') renderCIHistory();
    });
  });
}

function renderAll() {
  renderOverview();
  renderTraces();
  renderLatency();
  renderCosts();
  renderQuality();
  renderCIHistory();
}

function renderOverview() {
  const store = getStore();
  const reqs = store.requests;
  const scores = store.qualityScores;
  const ciRuns = ciHistory;

  document.getElementById('ovTotalRequests').textContent = reqs.length;

  const lats = reqs.map(r => r.latency).filter(l => l > 0);
  if (lats.length) {
    const sorted = [...lats].sort((a, b) => a - b);
    document.getElementById('ovAvgLatency').textContent = `${(lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(0)}`;
    document.getElementById('ovP95Latency').textContent = `${percentile(sorted, 95).toFixed(0)}`;
  }

  // Total cost
  let totalCost = 0;
  reqs.forEach(r => { totalCost += calculateCost(r.inputTokens || 0, r.outputTokens || 0, r.latency); });
  document.getElementById('ovTotalCost').textContent = `$${totalCost.toFixed(4)}`;

  // Avg quality
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b.overall, 0) / scores.length;
    document.getElementById('ovAvgScore').textContent = avg.toFixed(1);
  }

  // Regressions
  const regCount = ciRuns.filter(r => !r.verdict.pass).length;
  document.getElementById('ovRegressions').textContent = regCount;

  // Sparklines
  renderSparkline('latencySparkline', reqs.map(r => r.latency), 'lat');
  renderSparkline('costSparkline', reqs.map(r => calculateCost(r.inputTokens || 0, r.outputTokens || 0, r.latency)), 'cost');
  renderSparkline('qualitySparkline', scores.slice(-20).map(s => s.overall), 'qual');

  // Top models
  const byModel = {};
  reqs.forEach(r => {
    if (!byModel[r.model]) byModel[r.model] = 0;
    byModel[r.model]++;
  });
  const sorted = Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = sorted.reduce((a, b) => a + b[1], 0);
  document.getElementById('topModelsList').innerHTML = sorted.length
    ? sorted.map(([model, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        return `
          <div class="info-row">
            <span class="info-label" style="font-size:12px">${model}</span>
            <span class="info-value" style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:4px;background:var(--bg-primary);border-radius:2px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:2px"></div>
              </div>
              <span style="font-size:11px">${count} (${pct}%)</span>
            </span>
          </div>
        `;
      }).join('')
    : '<p class="text-muted">No data</p>';
}

function renderSparkline(id, values, cls) {
  const el = document.getElementById(id);
  if (!el || !values.length) {
    if (el) el.innerHTML = '<p class="text-muted" style="font-size:10px">No data</p>';
    return;
  }
  const vals = values.slice(-20);
  const max = Math.max(...vals, 0.001);
  el.innerHTML = vals.map(v => `<div class="bar ${cls}" style="height:${(v / max) * 100}%;flex:1" title="${v.toFixed(2)}"></div>`).join('');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}
