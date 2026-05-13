function scoreRandomResponse() {
  const store = getStore();
  if (!store.requests.length) {
    showToast('No requests to score. Generate traces first.', 'error');
    return;
  }

  const req = store.requests[Math.floor(Math.random() * store.requests.length)];
  const score = {
    requestId: req.id,
    model: req.model,
    timestamp: new Date().toISOString(),
    overall: Math.round((Math.random() * 40 + 60) * 10) / 10,
    relevance: Math.round((Math.random() * 40 + 60) * 10) / 10,
    fluency: Math.round((Math.random() * 30 + 70) * 10) / 10,
    brevity: Math.round((Math.random() * 50 + 50) * 10) / 10,
    coherence: Math.round((Math.random() * 30 + 60) * 10) / 10,
  };

  store.qualityScores.push(score);
  saveStore(store);
  renderQuality();
  renderOverview();
  showToast(`Scored ${req.model}: ${score.overall}`, 'success');
}

function simulateQualityDrift() {
  const store = getStore();
  const models = [...new Set(store.requests.map(r => r.model))];
  if (!models.length) { showToast('No models to simulate drift on', 'error'); return; }

  const model = models[Math.floor(Math.random() * models.length)];
  const driftType = Math.random() > 0.5 ? 'degradation' : 'improvement';
  const magnitude = Math.random() * 20 + 5;

  for (let i = 0; i < 5; i++) {
    const base = driftType === 'degradation' ? 40 : 70;
    const score = {
      requestId: `drift-${i}-${Date.now()}`,
      model,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      overall: Math.round((base + Math.random() * 20 + (driftType === 'degradation' ? -magnitude : magnitude)) * 10) / 10,
      relevance: Math.round((base + Math.random() * 20) * 10) / 10,
      fluency: Math.round((70 + Math.random() * 20) * 10) / 10,
      brevity: Math.round((50 + Math.random() * 30) * 10) / 10,
      coherence: Math.round((60 + Math.random() * 20) * 10) / 10,
    };
    store.qualityScores.push(score);
  }

  saveStore(store);
  renderQuality();
  renderOverview();
  showToast(`Drift simulation: ${driftType} on ${model}`, driftType === 'degradation' ? 'error' : 'success');
}

function renderQuality() {
  const store = getStore();
  const dist = document.getElementById('qualityDist');
  const tbody = document.getElementById('qualityByModel');
  const listBody = document.getElementById('qualityScoresList');

  const scores = store.qualityScores;

  if (!scores.length) {
    dist.innerHTML = '<p class="text-muted" style="text-align:center;padding:40px">No quality scores yet</p>';
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:20px">No data</td></tr>';
    listBody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No scores recorded</td></tr>';
    return;
  }

  // Distribution
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const hist = new Array(buckets.length - 1).fill(0);
  scores.forEach(s => {
    const idx = Math.min(Math.floor(s.overall / 10), hist.length - 1);
    hist[idx]++;
  });
  const maxHist = Math.max(...hist, 1);
  dist.innerHTML = hist.map((count, i) => `
    <div class="qbar" style="height:${(count / maxHist) * 100}%" title="${buckets[i]}-${buckets[i + 1]}: ${count}"></div>
  `).join('');

  // By model
  const byModel = {};
  scores.forEach(s => {
    if (!byModel[s.model]) byModel[s.model] = [];
    byModel[s.model].push(s);
  });

  tbody.innerHTML = Object.entries(byModel).map(([model, mscores]) => {
    const avg = mscores.reduce((a, b) => a + b.overall, 0) / mscores.length;
    const recent = mscores.slice(-3);
    const trend = recent.length > 1 ? recent[recent.length - 1].overall - recent[0].overall : 0;
    const drift = mscores.length > 5
      ? Math.abs(mscores.slice(-5).reduce((a, b) => a + b.overall, 0) / 5 - mscores.slice(0, 5).reduce((a, b) => a + b.overall, 0) / 5)
      : 0;
    const trendStr = trend > 2 ? '↑' : trend < -2 ? '↓' : '→';
    const trendClass = trend > 2 ? 'pass-badge' : trend < -2 ? 'fail-badge' : '';
    return `
      <tr>
        <td><strong>${model}</strong></td>
        <td class="mono">${avg.toFixed(1)}</td>
        <td>${mscores.length}</td>
        <td class="${trendClass}">${trendStr} ${trend.toFixed(1)}</td>
        <td class="mono">${drift > 5 ? `<span class="fail-badge">${drift.toFixed(1)}</span>` : drift > 2 ? `<span class="tag med">${drift.toFixed(1)}</span>` : `<span class="tag low">${drift.toFixed(1)}</span>`}</td>
      </tr>
    `;
  }).join('');

  // Recent scores list
  listBody.innerHTML = scores.slice(-30).reverse().map(s => `
    <tr>
      <td class="mono">${new Date(s.timestamp).toLocaleTimeString()}</td>
      <td>${s.model}</td>
      <td class="mono"><strong>${s.overall}</strong></td>
      <td class="mono">${s.relevance}</td>
      <td class="mono">${s.fluency}</td>
      <td class="mono">${s.brevity}</td>
    </tr>
  `).join('');
}
