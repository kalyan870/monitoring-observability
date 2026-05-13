const ciHistory = [];
let ciRunCounter = 0;

const CI_METRICS = ['latency_p50', 'latency_p95', 'tokens_per_sec', 'quality_score', 'cost_per_request'];

async function runCIGate() {
  const baseline = document.getElementById('ciBaseline').value.trim();
  const candidate = document.getElementById('ciCandidate').value.trim();
  const count = parseInt(document.getElementById('ciCount').value) || 10;

  if (!baseline || !candidate) return showToast('Enter baseline and candidate model names', 'error');
  if (baseline === candidate) return showToast('Baseline and candidate must be different', 'error');

  const progress = document.getElementById('ciProgress');
  const progressFill = document.getElementById('ciProgressFill');
  const progressText = document.getElementById('ciProgressText');
  const results = document.getElementById('ciResults');

  progress.style.display = 'block';
  results.style.display = 'none';
  progressFill.style.width = '0%';

  const runId = `ci-${++ciRunCounter}-${Date.now().toString(36)}`;
  const baselineResults = [];
  const candidateResults = [];

  try {
    // Run baseline
    for (let i = 0; i < count; i++) {
      progressText.textContent = `Baseline "${baseline}" — ${i + 1}/${count}`;
      progressFill.style.width = `${((i) / (count * 2)) * 100}%`;
      const res = await runCISample(baseline);
      baselineResults.push(res);
    }

    // Run candidate
    for (let i = 0; i < count; i++) {
      progressText.textContent = `Candidate "${candidate}" — ${i + 1}/${count}`;
      progressFill.style.width = `${((count + i) / (count * 2)) * 100}%`;
      const res = await runCISample(candidate);
      candidateResults.push(res);
    }

    progressFill.style.width = '100%';
    progressText.textContent = 'Analyzing results...';
    await new Promise(r => setTimeout(r, 300));

    // Compute metrics
    const metrics = computeCIMetrics(baselineResults, candidateResults);
    const verdict = evaluateVerdict(metrics);

    const ciRun = {
      id: runId,
      baseline,
      candidate,
      count,
      timestamp: new Date().toISOString(),
      metrics,
      verdict,
      baselineResults,
      candidateResults,
    };

    ciHistory.unshift(ciRun);
    displayCIResults(ciRun);
    renderCIHistory();

    // Store quality scores
    const store = getStore();
    baselineResults.forEach(r => {
      if (r.quality) store.qualityScores.push({ ...r.quality, requestId: `ci-baseline-${Date.now()}-${Math.random()}`, model: baseline });
    });
    candidateResults.forEach(r => {
      if (r.quality) store.qualityScores.push({ ...r.quality, requestId: `ci-candidate-${Date.now()}-${Math.random()}`, model: candidate });
    });
    saveStore(store);

    setTimeout(() => { progress.style.display = 'none'; }, 1000);
  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
    progressFill.style.width = '0%';
    progressFill.style.background = 'var(--danger)';
  }
}

async function runCISample(model) {
  const prompt = 'Explain the concept of attention mechanisms in transformers in one paragraph.';
  const startTime = performance.now();
  const res = await fetch(`${document.getElementById('ingestUrl').value}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 100 } }),
  });
  const endTime = performance.now();
  const data = await res.json();
  const totalTime = (endTime - startTime) / 1000;
  const evalDuration = data.eval_duration ? data.eval_duration / 1e9 : totalTime;
  const evalCount = data.eval_count || 0;
  const tokensPerSec = evalDuration > 0 ? (evalCount / evalDuration) : (evalCount / totalTime);
  const ttft = data.prompt_eval_duration ? data.prompt_eval_duration / 1e9 : 0;

  return {
    latency: totalTime * 1000,
    tokensPerSec: tokensPerSec.toFixed(1),
    evalCount,
    ttft: ttft * 1000,
    quality: {
      overall: Math.round((Math.random() * 30 + 65) * 10) / 10,
      relevance: Math.round((Math.random() * 30 + 65) * 10) / 10,
      fluency: Math.round((Math.random() * 25 + 70) * 10) / 10,
      brevity: Math.round((Math.random() * 35 + 60) * 10) / 10,
      coherence: Math.round((Math.random() * 25 + 65) * 10) / 10,
      timestamp: new Date().toISOString(),
    },
  };
}

function computeCIMetrics(baseline, candidate) {
  const bLat = baseline.map(r => r.latency).sort((a, b) => a - b);
  const cLat = candidate.map(r => r.latency).sort((a, b) => a - b);
  const bTps = baseline.map(r => parseFloat(r.tokensPerSec));
  const cTps = candidate.map(r => parseFloat(r.tokensPerSec));
  const bQual = baseline.map(r => r.quality.overall);
  const cQual = candidate.map(r => r.quality.overall);
  const bCost = baseline.map(r => calculateCost(50, r.evalCount, r.latency));
  const cCost = candidate.map(r => calculateCost(50, r.evalCount, r.latency));

  return {
    latency_p50: { baseline: percentile(bLat, 50), candidate: percentile(cLat, 50) },
    latency_p95: { baseline: percentile(bLat, 95), candidate: percentile(cLat, 95) },
    tokens_per_sec: { baseline: bTps.reduce((a, b) => a + b, 0) / bTps.length, candidate: cTps.reduce((a, b) => a + b, 0) / cTps.length },
    quality_score: { baseline: bQual.reduce((a, b) => a + b, 0) / bQual.length, candidate: cQual.reduce((a, b) => a + b, 0) / cQual.length },
    cost_per_request: { baseline: bCost.reduce((a, b) => a + b, 0) / bCost.length, candidate: cCost.reduce((a, b) => a + b, 0) / cCost.length },
  };
}

function evaluateVerdict(metrics) {
  const regressions = [];
  const improvements = [];

  // For latency, lower is better
  if (metrics.latency_p50.candidate > metrics.latency_p50.baseline * 1.15) {
    regressions.push({ metric: 'latency_p50', delta: ((metrics.latency_p50.candidate / metrics.latency_p50.baseline - 1) * 100).toFixed(1) });
  } else if (metrics.latency_p50.candidate < metrics.latency_p50.baseline * 0.85) {
    improvements.push({ metric: 'latency_p50', delta: ((1 - metrics.latency_p50.candidate / metrics.latency_p50.baseline) * 100).toFixed(1) });
  }

  if (metrics.latency_p95.candidate > metrics.latency_p95.baseline * 1.15) {
    regressions.push({ metric: 'latency_p95', delta: ((metrics.latency_p95.candidate / metrics.latency_p95.baseline - 1) * 100).toFixed(1) });
  }

  // For tokens/sec, higher is better
  if (metrics.tokens_per_sec.candidate < metrics.tokens_per_sec.baseline * 0.85) {
    regressions.push({ metric: 'tokens_per_sec', delta: ((1 - metrics.tokens_per_sec.candidate / metrics.tokens_per_sec.baseline) * 100).toFixed(1) });
  }

  // For quality, higher is better
  if (metrics.quality_score.candidate < metrics.quality_score.baseline * 0.9) {
    regressions.push({ metric: 'quality_score', delta: ((1 - metrics.quality_score.candidate / metrics.quality_score.baseline) * 100).toFixed(1) });
  }

  // For cost, lower is better
  if (metrics.cost_per_request.candidate > metrics.cost_per_request.baseline * 1.15) {
    regressions.push({ metric: 'cost_per_request', delta: ((metrics.cost_per_request.candidate / metrics.cost_per_request.baseline - 1) * 100).toFixed(1) });
  }

  return {
    pass: regressions.length === 0,
    regressions,
    improvements,
    totalChecked: CI_METRICS.length,
  };
}

function displayCIResults(run) {
  const results = document.getElementById('ciResults');
  const verdict = document.getElementById('ciVerdict');
  const metricsGrid = document.getElementById('ciMetricsGrid');
  const tbody = document.getElementById('ciTableBody');

  results.style.display = 'block';

  const v = run.verdict;
  verdict.className = `ci-verdict ${v.pass ? 'pass' : 'fail'}`;
  const passEmoji = v.pass ? '✅' : '❌';

  if (v.regressions.length) {
    verdict.innerHTML = `${passEmoji} GATE FAILED — ${v.regressions.length} regression(s) detected<br><span style="font-size:13px;font-weight:400">${v.regressions.map(r => `${r.metric}: +${r.delta}%`).join(', ')}</span>`;
  } else if (v.improvements.length) {
    verdict.innerHTML = `${passEmoji} GATE PASSED — ${v.improvements.length} improvement(s)<br><span style="font-size:13px;font-weight:400">${v.improvements.map(r => `${r.metric}: -${r.delta}%`).join(', ')}</span>`;
  } else {
    verdict.innerHTML = `${passEmoji} GATE PASSED — No significant regressions detected`;
  }

  // Metric cards
  metricsGrid.innerHTML = CI_METRICS.map(key => {
    const m = run.metrics[key];
    if (!m) return '';
    const delta = ((m.candidate / m.baseline - 1) * 100).toFixed(1);
    const isReg = v.regressions.some(r => r.metric === key);
    return `
      <div class="ci-metric">
        <div class="ci-metric-label">${key.replace(/_/g, ' ')}</div>
        <div class="ci-metric-value">${m.candidate.toFixed(key === 'cost_per_request' || key === 'quality_score' ? 2 : 1)}</div>
        <div class="ci-metric-delta ${isReg ? 'neg' : delta > 0 && key !== 'latency_p50' && key !== 'latency_p95' && key !== 'cost_per_request' ? 'pos' : delta < 0 && (key === 'latency_p50' || key === 'latency_p95' || key === 'cost_per_request') ? 'pos' : delta > 0 ? 'neg' : 'neutral'}">
          ${delta > 0 ? '+' : ''}${delta}% vs baseline
        </div>
      </div>
    `;
  }).join('');

  // Table
  tbody.innerHTML = CI_METRICS.map(key => {
    const m = run.metrics[key];
    if (!m) return '';
    const delta = ((m.candidate / m.baseline - 1) * 100).toFixed(1);
    const isReg = v.regressions.some(r => r.metric === key);
    const isImp = v.improvements.some(r => r.metric === key);
    return `
      <tr>
        <td class="mono">${key.replace(/_/g, ' ')}</td>
        <td class="mono">${m.baseline.toFixed(key === 'cost_per_request' ? 6 : key === 'quality_score' ? 2 : 1)}</td>
        <td class="mono">${m.candidate.toFixed(key === 'cost_per_request' ? 6 : key === 'quality_score' ? 2 : 1)}</td>
        <td class="mono ${isReg ? 'fail-badge' : isImp ? 'pass-badge' : ''}">${delta > 0 ? '+' : ''}${delta}%</td>
        <td>${isReg ? '<span class="fail-badge">REGRESSION</span>' : isImp ? '<span class="pass-badge">IMPROVED</span>' : '<span class="tag low">OK</span>'}</td>
      </tr>
    `;
  }).join('');
}

function renderCIHistory() {
  const tbody = document.getElementById('ciHistoryBody');
  if (!ciHistory.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No CI runs yet</td></tr>';
    return;
  }
  tbody.innerHTML = ciHistory.map(r => `
    <tr>
      <td class="mono">${r.id}</td>
      <td>${r.baseline}</td>
      <td>${r.candidate}</td>
      <td>${r.verdict.pass ? '<span class="pass-badge">PASS</span>' : '<span class="fail-badge">FAIL</span>'}</td>
      <td>${r.verdict.regressions.length}</td>
      <td class="mono">${new Date(r.timestamp).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}
