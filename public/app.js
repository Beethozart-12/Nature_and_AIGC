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
      body: JSON.stringify({ providerModel, apiKey, baseUrl, system, prompt }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      aigcOutput.style.color = 'var(--err)';
      aigcOutput.textContent = '调用失败：' + (data.error || '未知错误') + '\n(请确认 提供商-型号、API Key、Base URL 是否正确)';
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

sendBtn.addEventListener('click', doSend);
