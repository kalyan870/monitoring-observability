const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.60;
const COST_PER_HOUR_COMPUTE = 0.50;

function getCostSettings() {
  const input = parseFloat(document.getElementById('costPerInput')?.value) || COST_PER_1M_INPUT;
  const output = parseFloat(document.getElementById('costPerOutput')?.value) || COST_PER_1M_OUTPUT;
  const compute = parseFloat(document.getElementById('costPerCompute')?.value) || COST_PER_HOUR_COMPUTE;
  return { input, output, compute };
}

function calculateCost(inputTokens, outputTokens, durationMs) {
  const { input: inRate, output: outRate, compute: compRate } = getCostSettings();
  const tokenCost = (inputTokens / 1e6) * inRate + (outputTokens / 1e6) * outRate;
  const computeCost = (durationMs / 3600000) * compRate;
  return tokenCost + computeCost;
}

function renderCosts() {
  const store = getStore();
  const summary = document.getElementById('costSummary');
  const tbody = document.getElementById('costByModel');

  if (!store.requests.length) {
    summary.innerHTML = '<p class="text-muted" style="text-align:center;padding:30px">No data. Generate traces to see costs.</p>';
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:20px">No data</td></tr>';
    return;
  }

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const byModel = {};

  store.requests.forEach(r => {
    const cost = calculateCost(r.inputTokens || 0, r.outputTokens || 0, r.latency);
    totalCost += cost;
    totalInput += r.inputTokens || 0;
    totalOutput += r.outputTokens || 0;
    if (!byModel[r.model]) byModel[r.model] = { requests: 0, cost: 0, tokens: 0 };
    byModel[r.model].requests++;
    byModel[r.model].cost += cost;
    byModel[r.model].tokens += (r.inputTokens || 0) + (r.outputTokens || 0);
  });

  summary.innerHTML = `
    <div class="cost-summary-item"><div class="cost-summary-value">$${totalCost.toFixed(4)}</div><div class="cost-summary-label">Total Cost</div></div>
    <div class="cost-summary-item"><div class="cost-summary-value">$${(totalCost / store.requests.length).toFixed(6)}</div><div class="cost-summary-label">Avg Cost / Req</div></div>
    <div class="cost-summary-item"><div class="cost-summary-value">${totalInput.toLocaleString()}</div><div class="cost-summary-label">Total Input Tokens</div></div>
    <div class="cost-summary-item"><div class="cost-summary-value">${totalOutput.toLocaleString()}</div><div class="cost-summary-label">Total Output Tokens</div></div>
  `;

  tbody.innerHTML = Object.entries(byModel).map(([model, data]) => `
    <tr>
      <td><strong>${model}</strong></td>
      <td>${data.requests}</td>
      <td class="mono">$${data.cost.toFixed(4)}</td>
      <td class="mono">$${(data.cost / data.requests).toFixed(6)}</td>
      <td class="mono">${(data.tokens / data.requests).toFixed(0)}</td>
    </tr>
  `).join('');
}

function recalcCosts() {
  renderCosts();
  renderOverview();
  showToast('Costs recalculated', 'success');
}
