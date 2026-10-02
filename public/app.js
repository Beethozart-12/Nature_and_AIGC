'use strict';

// ===================== 选项卡切换 =====================
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    panels.forEach((p) => p.classList.toggle('active', p.id === target));
  });
});

// ===================== 学术搜索 =====================
const queryInput = document.getElementById('query');
const searchBtn = document.getElementById('searchBtn');
const resultsEl = document.getElementById('results');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResults(data) {
  resultsEl.innerHTML = '';
  if (data.error) {
    const box = document.createElement('div');
    box.className = 'blocked-box';
    box.style.color = 'var(--err)';
    box.style.borderColor = 'var(--err)';
    box.textContent = '搜索出错：' + data.error;
    resultsEl.appendChild(box);
    return;
  }
  const list = data.results || [];
  if (!list.length) {
    resultsEl.innerHTML = '<div class="empty">未找到结果，换个关键词试试。</div>';
    return;
  }
  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    const meta = [item.authors, item.year, item.source].filter(Boolean).join(' · ');
    card.innerHTML =
      '<h3><a href="' +
      encodeURI(item.url || '#') +
      '" target="_blank" rel="noopener">' +
      escapeHtml(item.title) +
      '</a></h3>' +
      (meta ? '<div class="meta">' + escapeHtml(meta) + '</div>' : '') +
      (item.snippet ? '<div class="snippet">' + escapeHtml(item.snippet) + '</div>' : '');
    resultsEl.appendChild(card);
  });
  if (data.note) {
    const n = document.createElement('div');
    n.className = 'hint';
    n.textContent = data.note;
    resultsEl.appendChild(n);
  }
}

async function doSearch() {
  const query = queryInput.value.trim();
  if (!query) {
    resultsEl.innerHTML = '<div class="empty">请输入搜索关键词。</div>';
    return;
  }
  searchBtn.disabled = true;
  searchBtn.textContent = '搜索中…';
  resultsEl.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'nature', query, page: 1 }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      resultsEl.innerHTML = '<div class="empty">错误：' + escapeHtml(data.error || '请求失败') + '</div>';
    } else {
      renderResults(data);
    }
  } catch (e) {
    resultsEl.innerHTML = '<div class="empty">请求异常：' + escapeHtml(e.message) + '</div>';
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = '搜索';
  }
}

searchBtn.addEventListener('click', doSearch);
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

// ===================== AIGC =====================
const providerModelInput = document.getElementById('providerModel');
const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const systemInput = document.getElementById('systemPrompt');
const promptInput = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const aigcOutput = document.getElementById('aigcOutput');
const parsedInfo = document.getElementById('parsedInfo');

// 模式切换：对话 / 降AI率
const modeButtons = document.querySelectorAll('.mode-btn');
const modeHintEl = document.getElementById('modeHint');
const promptLabelText = document.getElementById('promptLabelText');
const intensityWrap = document.getElementById('intensityWrap');
let currentMode = 'chat';

function getIntensity() {
  const el = document.querySelector('input[name="intensity"]:checked');
  return el ? el.value : 'standard';
}

function applyMode(mode) {
  currentMode = mode;
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'humanize') {
    promptLabelText.textContent = '待降AI率的文本';
    promptInput.placeholder = '粘贴被判定为 AI 生成的文本，发送后由模型改写为更自然的表达（保持原意）';
    modeHintEl.textContent =
      '降AI率：模型会在保持原意、专业性与准确性的前提下，把文本改写得更像人类写作，' +
      '降低被 AI 检测工具识别的概率，并直接输出改写结果（无需自定义 System Prompt；若填写则覆盖默认润色指令）。' +
      '请先在左侧填写“AI 模型（提供商-型号）”与“API Key”，并选择下方降AI强度。';
    modeHintEl.style.display = 'block';
    intensityWrap.style.display = 'flex';
  } else {
    promptLabelText.textContent = '提示词';
    promptInput.placeholder = '给 AI 的指令，例如：请总结量子计算的最新进展';
    modeHintEl.style.display = 'none';
    intensityWrap.style.display = 'none';
  }
}
modeButtons.forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));
applyMode('chat');

function updateParsed() {
  const v = providerModelInput.value.trim();
  const i = v.indexOf('-');
  if (!v) {
    parsedInfo.textContent = '';
    return;
  }
  if (i < 0) {
    parsedInfo.style.color = 'var(--err)';
    parsedInfo.textContent = '格式应为 “提供商-型号”，例如 OpenAI-gpt-4o';
    return;
  }
  parsedInfo.style.color = 'var(--ok)';
  parsedInfo.textContent = '已识别 → 提供商: ' + v.slice(0, i).trim() + ' ｜ 型号: ' + v.slice(i + 1).trim();
}
providerModelInput.addEventListener('input', updateParsed);

async function doSend() {
  const providerModel = providerModelInput.value.trim();
  const apiKey = apiKeyInput.value;
  const baseUrl = baseUrlInput.value.trim();
  const system = systemInput.value;
  const prompt = promptInput.value.trim();
  const intensity = getIntensity();

  if (!providerModel || providerModel.indexOf('-') < 0) {
    aigcOutput.style.color = 'var(--err)';
    aigcOutput.textContent = '请按 “提供商-型号” 格式填写 AI 模型，例如 OpenAI-gpt-4o';
    return;
  }
  if (!apiKey) {
    aigcOutput.style.color = 'var(--err)';
    aigcOutput.textContent = '请填写 API Key。';
    return;
  }
  if (!prompt) {
    aigcOutput.style.color = 'var(--err)';
    aigcOutput.textContent = '请填写提示词。';
    return;
  }

  sendBtn.disabled = true;
  aigcOutput.style.color = 'var(--muted)';
  aigcOutput.textContent = 'AI 思考中…';
  try {
    const resp = await fetch('/api/aigc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerModel, apiKey, baseUrl, system, prompt, mode: currentMode, intensity }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      aigcOutput.style.color = 'var(--err)';
      aigcOutput.textContent = '调用失败：' + (data.error || '未知错误') + '\n(请确认 提供商-型号、API Key、Base URL 是否正确)';
    } else if (currentMode === 'humanize') {
      renderHumanizeResult(prompt, data.text || '(空回复)', data.provider + ' / ' + data.model);
    } else {
      aigcOutput.style.color = '#dfe5ee';
      aigcOutput.textContent = '【' + data.provider + ' / ' + data.model + '】\n\n' + (data.text || '(空回复)');
    }
  } catch (e) {
    aigcOutput.style.color = 'var(--err)';
    aigcOutput.textContent = '请求异常：' + e.message;
  } finally {
    sendBtn.disabled = false;
  }
}

// 降AI率结果：原文 vs 改写后（使用 textContent，避免 XSS）
function renderHumanizeResult(original, rewritten, meta) {
  aigcOutput.style.color = '#dfe5ee';
  aigcOutput.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'hz-head';
  head.textContent = '降AI率完成（' + (meta || '') + '）';
  aigcOutput.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'hz-grid';

  const colO = document.createElement('div');
  colO.className = 'hz-col';
  const oTitle = document.createElement('div');
  oTitle.className = 'hz-col-title';
  oTitle.textContent = '原文';
  const oBody = document.createElement('div');
  oBody.className = 'hz-col-body';
  oBody.textContent = original;
  colO.appendChild(oTitle);
  colO.appendChild(oBody);

  const colR = document.createElement('div');
  colR.className = 'hz-col';
  const rTitle = document.createElement('div');
  rTitle.className = 'hz-col-title';
  rTitle.textContent = '改写后';
  const rBody = document.createElement('div');
  rBody.className = 'hz-col-body';
  rBody.textContent = rewritten;
  colR.appendChild(rTitle);
  colR.appendChild(rBody);

  grid.appendChild(colO);
  grid.appendChild(colR);
  aigcOutput.appendChild(grid);
}

sendBtn.addEventListener('click', doSend);
