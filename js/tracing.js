const traces = [];
let traceIdCounter = 0;

const SPAN_TYPES = ['model_load', 'prompt_eval', 'inference', 'token_generation'];
const MODELS = ['qwen2.5:1.5b', 'llama3.2:1b', 'mistral', 'phi3.5:3.8b', 'gemma2:2b', 'tinyllama', 'deepseek-r1:1.5b', 'orca-mini:3b'];

function generateTrace() {
  const model = MODELS[Math.floor(Math.random() * MODELS.length)];
  const traceId = `trace-${++traceIdCounter}-${Date.now().toString(36)}`;
  const inputTokens = Math.floor(Math.random() * 300) + 20;
  const outputTokens = Math.floor(Math.random() * 400) + 20;
  const totalTime = (Math.random() * 8000 + 500) / 1000;

  const spans = [
    {
      id: `${traceId}-load`,
      name: 'model_load',
      duration: (Math.random() * 1500 + 200) / 1000,
      startOffset: 0,
      type: 'model_load',
      meta: { model, gpu: Math.random() > 0.3 ? 'CUDA' : 'CPU' },
    },
    {
      id: `${traceId}-prompt`,
      name: 'prompt_eval',
      duration: (Math.random() * 800 + 100) / 1000,
      startOffset: (Math.random() * 200 + 1500) / 1000,
      type: 'prompt_eval',
      meta: { tokens: inputTokens },
    },
    {
      id: `${traceId}-infer`,
      name: 'inference',
      duration: (Math.random() * 3000 + 300) / 1000,
      startOffset: (Math.random() * 300 + 2300) / 1000,
      type: 'inference',
      meta: {},
    },
    {
      id: `${traceId}-tokens`,
      name: 'token_generation',
      duration: (Math.random() * 2000 + 200) / 1000,
      startOffset: (Math.random() * 500 + 3000) / 1000,
      type: 'token_generation',
      meta: { tokens: outputTokens, tokensPerSec: (outputTokens / (Math.random() * 3 + 1)).toFixed(1) },
    },
  ];

  const trace = {
    id: traceId,
    model,
    timestamp: new Date().toISOString(),
    totalDuration: totalTime,
    inputTokens,
    outputTokens,
    spans,
    status: Math.random() > 0.08 ? 'success' : 'error',
  };

  traces.unshift(trace);
  storeTraceMetrics(trace);
  renderTraces();
  return trace;
}

function storeTraceMetrics(trace) {
  const store = getStore();
  store.requests.push({
    id: trace.id,
    model: trace.model,
    timestamp: trace.timestamp,
    latency: trace.totalDuration * 1000,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    status: trace.status,
    trace: trace,
  });
  saveStore(store);
}

function renderTraces() {
  const list = document.getElementById('traceList');
  const search = (document.getElementById('traceSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('traceFilter')?.value || 'all';

  let filtered = traces;
  if (search) {
    filtered = filtered.filter(t =>
      t.id.toLowerCase().includes(search) ||
      t.model.toLowerCase().includes(search) ||
      t.spans.some(s => s.name.toLowerCase().includes(search))
    );
  }
  if (filter !== 'all') {
    filtered = filtered.filter(t => t.spans.some(s => s.name === filter));
  }

  if (!filtered.length) {
    list.innerHTML = '<p class="text-muted" style="padding:40px;text-align:center">No traces match your criteria.</p>';
    return;
  }

  const maxDur = Math.max(...filtered.map(t => t.totalDuration), 0.001);

  list.innerHTML = filtered.slice(0, 50).map(t => {
    const maxSpanDur = Math.max(...t.spans.map(s => s.duration), 0.001);
    return `
      <div class="trace-item ${t.status === 'error' ? 'trace-error' : ''}">
        <div class="trace-header">
          <div>
            <span class="trace-model">${t.model}</span>
            <span class="trace-id">${t.id}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:11px;color:var(--text-muted)">${t.inputTokens} in / ${t.outputTokens} out</span>
            <span class="trace-duration">${(t.totalDuration * 1000).toFixed(0)}ms</span>
            <span class="tag ${t.status === 'success' ? 'low' : 'high'}">${t.status}</span>
          </div>
        </div>
        <div class="trace-spans">
          ${t.spans.map(s => {
            const pct = (s.duration / maxSpanDur) * 100;
            return `
              <div class="trace-span">
                <span class="span-name">${s.name}</span>
                <div style="flex:1;height:4px;background:var(--bg-primary);border-radius:2px;overflow:hidden">
                  <div class="span-bar ${s.type}" style="width:${Math.max(pct, 10)}%"></div>
                </div>
                <span class="span-dur">${(s.duration * 1000).toFixed(0)}ms</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function clearTraces() {
  traces.length = 0;
  renderTraces();
  showToast('Traces cleared', 'info');
}

function setupTraceSearch() {
  const search = document.getElementById('traceSearch');
  const filter = document.getElementById('traceFilter');
  if (search) search.addEventListener('input', renderTraces);
  if (filter) filter.addEventListener('change', renderTraces);
}
