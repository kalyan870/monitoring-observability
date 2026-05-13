function getLatencyMetrics() {
  const store = getStore();
  const latencies = store.requests.map(r => r.latency).filter(l => l > 0).sort((a, b) => a - b);
  if (!latencies.length) return null;

  const len = latencies.length;
  const sum = latencies.reduce((a, b) => a + b, 0);

  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    avg: sum / len,
    min: latencies[0],
    max: latencies[len - 1],
    count: len,
    all: latencies,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function renderLatency() {
  const metrics = getLatencyMetrics();
  const tbody = document.getElementById('latencyByModel');
  const chart = document.getElementById('percentileChart');
  const heatmap = document.getElementById('latencyHeatmap');

  if (!metrics) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No data. Generate traces first.</td></tr>';
    chart.innerHTML = '<p class="text-muted" style="text-align:center;padding:40px">No data</p>';
    heatmap.innerHTML = '<p class="text-muted" style="text-align:center;padding:40px">No data</p>';
    return;
  }

  const p50 = metrics.p50;
  const p95 = metrics.p95;
  const p99 = metrics.p99;
  const maxP = Math.max(p50, p95, p99, 1);

  chart.innerHTML = `
    <div class="percentile-bar pbar-p50" style="height:${(p50 / maxP) * 100}%">
      <span class="pval">${p50.toFixed(0)}ms</span>
      <span class="plabel">p50</span>
    </div>
    <div class="percentile-bar pbar-p95" style="height:${(p95 / maxP) * 100}%">
      <span class="pval">${p95.toFixed(0)}ms</span>
      <span class="plabel">p95</span>
    </div>
    <div class="percentile-bar pbar-p99" style="height:${(p99 / maxP) * 100}%">
      <span class="pval">${p99.toFixed(0)}ms</span>
      <span class="plabel">p99</span>
    </div>
  `;

  // Heatmap (last 100 requests as grid)
  const store = getStore();
  const recent = store.requests.slice(-100);
  const maxLat = Math.max(...recent.map(r => r.latency), 1);
  heatmap.innerHTML = recent.map(r => {
    const intensity = Math.min(r.latency / maxLat, 1);
    const rVal = Math.floor(108 + (231 - 108) * intensity);
    const gVal = Math.floor(92 - 92 * intensity);
    const bVal = Math.floor(231 - 200 * intensity);
    return `<div class="heatmap-cell" style="background:rgb(${rVal},${gVal},${bVal})" title="${r.model}: ${r.latency.toFixed(0)}ms"></div>`;
  }).join('');

  // By model
  const byModel = {};
  store.requests.forEach(r => {
    if (!byModel[r.model]) byModel[r.model] = [];
    byModel[r.model].push(r.latency);
  });

  tbody.innerHTML = Object.entries(byModel).map(([model, lats]) => {
    const sorted = lats.sort((a, b) => a - b);
    return `
      <tr>
        <td><strong>${model}</strong></td>
        <td class="mono">${percentile(sorted, 50).toFixed(0)}</td>
        <td class="mono">${percentile(sorted, 95).toFixed(0)}</td>
        <td class="mono">${percentile(sorted, 99).toFixed(0)}</td>
        <td class="mono">${(lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(0)}</td>
        <td>${lats.length}</td>
      </tr>
    `;
  }).join('');
}
