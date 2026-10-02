'use strict';
/**
 * Academic Search + AIGC Hub
 * 零依赖 Node.js 服务器（仅使用内置模块 + 全局 fetch）。
 * 提供：Nature 学术搜索 + 自定义 LLM (AIGC) 调用（仅保留 Nature 来源）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// 已知 AI 模型提供商 -> OpenAI 兼容接口地址（可在前端用“自定义 Base URL”覆盖）
// ---------------------------------------------------------------------------
const PROVIDERS = {
  OpenAI: 'https://api.openai.com/v1/chat/completions',
  DeepSeek: 'https://api.deepseek.com/v1/chat/completions',
  Moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  Kimi: 'https://api.moonshot.cn/v1/chat/completions',
  Qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  Aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  Zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  GLM: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  Baichuan: 'https://api.baichuan-ai.com/v1/chat/completions',
  MiniMax: 'https://api.minimax.chat/v1/chatcompletions_v2',
  OpenRouter: 'https://openrouter.ai/api/v1/chat/completions',
  Groq: 'https://api.groq.com/openai/v1/chat/completions',
  Together: 'https://api.together.xyz/v1/chat/completions',
  Ollama: 'http://localhost:11434/v1/chat/completions',
  Gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  Anthropic: 'https://api.anthropic.com/v1/messages',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripHtml(s) {
  if (!s) return '';
  return decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchText(url, headers) {
  const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}), redirect: 'follow' });
  const text = await r.text();
  return { status: r.status, text };
}

// ---------------------------------------------------------------------------
// 学术搜索实现
// ---------------------------------------------------------------------------

// Nature：直接解析搜索结果页 HTML（真实可解析）
async function searchNature(query, page) {
  const url = `https://www.nature.com/search?q=${encodeURIComponent(query)}&page=${page || 1}`;
  const { status, text } = await fetchText(url);
  if (status !== 200) throw new Error(`Nature 返回状态 ${status}`);

  const results = [];
  const blocks = text.split('<article').slice(1);
  for (const b of blocks) {
    const hrefM = b.match(/href="(\/articles\/[^"]+)"/);
    if (!hrefM) continue;
    const url2 = 'https://www.nature.com' + hrefM[1];
    const h3 = b.match(/<h3[^>]*class="[^"]*c-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
    const title = h3 ? stripHtml(h3[1]) : stripHtml((b.match(/c-card__link[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    const sum = b.match(/c-card__summary[^>]*>([\s\S]*?)<\/div>/);
    const snippet = sum ? stripHtml(sum[1]).slice(0, 300) : '';
    const yearM = b.match(/\b(19|20)\d{2}\b/);
    results.push({
      title: title || '(无标题)',
      url: url2,
      authors: '',
      year: yearM ? yearM[0] : '',
      source: 'Nature',
      snippet,
    });
  }
  return results;
}

// 注：中国知网 (CNKI) 来源已移除，仅保留 Nature 来源。

// ---------------------------------------------------------------------------
// AIGC：调用用户指定的 LLM
// ---------------------------------------------------------------------------
function parseProviderModel(s) {
  if (!s || typeof s !== 'string' || !s.includes('-')) return null;
  const i = s.indexOf('-');
  return { provider: s.slice(0, i).trim(), model: s.slice(i + 1).trim() };
}

async function callLLM({ providerModel, apiKey, baseUrl, system, prompt, mode, intensity }) {
  const pm = parseProviderModel(providerModel);
  if (!pm) {
    const err = new Error('AI 模型格式应为 “提供商-型号”，例如 OpenAI-gpt-4o');
    err.code = 'BAD_FORMAT';
    throw err;
  }
  const isAnthropic = pm.provider.toLowerCase() === 'anthropic';
  const endpoint = (baseUrl && baseUrl.trim()) || PROVIDERS[pm.provider] || null;
  if (!endpoint) {
    const err = new Error('未知提供商 “' + pm.provider + '”，请在“自定义 Base URL”中填写完整接口地址');
    err.code = 'UNKNOWN_PROVIDER';
    throw err;
  }

  // 降AI率模式：依据强度使用专门的润色系统提示词（用户自定义 system 可覆盖）
  function buildHumanizeSystem(intensity) {
    const base =
      '你是一个专业的文本润色助手。请在保持原意、专业性与事实准确性的前提下，改写用户提供的文本，' +
      '降低其被 AI 检测工具判定为机器生成的概率（即“降AI率”）。硬性要求：' +
      '1）核心信息、数据、术语与原结论完全不变；' +
      '2）不要改变文本本来的立场与语气基调（学术文本仍保持学术感）；' +
      '3）直接输出改写后的完整文本，不要添加任何前言、解释、引号或“以下是改写结果”之类的多余说明。';
    const levels = {
      light:
        base +
        ' 请做轻度润色：仅剔除明显套路的连接词（如“首先/其次/最后”“综上所述”“值得注意的是”“毋庸置疑”等），' +
        '适当让句式更自然，整体结构基本不动。',
      standard:
        base +
        ' 请做标准润色：打破过度规整的模板化表达，减少套路连接词；增加句式长短变化与自然过渡，' +
        '适当加入更口语化、有人文气息的表达，使行文更像人类写作，同时保持可读性与逻辑。',
      heavy:
        base +
        ' 请做深度润色：大幅调整句式与节奏，打破清单式/总分总等机械结构；用更自然、带个人语感的表达替换生硬书面语；' +
        '引入合理的过渡与细节铺陈，使文本读起来像出自真人手笔，但绝不歪曲事实或数据。',
    };
    return levels['' + intensity] || levels.standard;
  }
  const defaultSystem = mode === 'humanize' ? buildHumanizeSystem(intensity) : 'You are a helpful assistant.';
  const sys = system && system.trim() ? system : defaultSystem;

  if (isAnthropic) {
    const body = {
      model: pm.model,
      max_tokens: 2048,
      system: sys,
      messages: [{ role: 'user', content: prompt }],
    };
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error('Anthropic 接口错误 ' + r.status + ': ' + text.slice(0, 300));
    const data = JSON.parse(text);
    const out = (data.content || []).map((c) => c.text || '').join('');
    return { text: out, provider: pm.provider, model: pm.model, endpoint };
  }

  // OpenAI 兼容路径
  const body = {
    model: pm.model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    stream: false,
  };
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error('LLM 接口错误 ' + r.status + ': ' + text.slice(0, 300));
  const data = JSON.parse(text);
  const out = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  return { text: out, provider: pm.provider, model: pm.model, endpoint };
}

// ---------------------------------------------------------------------------
// 静态文件服务
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET') {
      serveStatic(req, res, u.pathname);
      return;
    }
    if (req.method === 'POST') {
      if (u.pathname === '/api/search') {
        const body = await readBody(req);
        const query = (body.query || '').toString().trim();
        const source = (body.source || 'nature').toString().toLowerCase();
        const page = parseInt(body.page, 10) || 1;
        if (!query) return sendJSON(res, 400, { error: '查询词不能为空' });
        if (query.length > 200) return sendJSON(res, 400, { error: '查询词过长' });
        try {
          if (source !== 'nature') {
            return sendJSON(res, 400, { error: '仅支持 Nature 来源' });
          }
          const results = await searchNature(query, page);
          return sendJSON(res, 200, { source: 'nature', results, count: results.length });
        } catch (e) {
          // 单源失败不影响其他功能：返回清晰错误信息而非 500
          return sendJSON(res, 200, { source, results: [], error: e.message || '搜索失败' });
        }
      }
      if (u.pathname === '/api/aigc') {
        const body = await readBody(req);
        if (!body.providerModel || !body.prompt) {
          return sendJSON(res, 400, { error: '缺少 AI 模型或提示词' });
        }
        if (!body.apiKey) {
          return sendJSON(res, 400, { error: '请填写 API Key' });
        }
        try {
          const out = await callLLM({
            providerModel: body.providerModel,
            apiKey: body.apiKey,
            baseUrl: body.baseUrl,
            system: body.system,
            prompt: body.prompt,
            mode: body.mode,
            intensity: body.intensity,
          });
          return sendJSON(res, 200, out);
        } catch (e) {
          return sendJSON(res, 502, { error: e.message });
        }
      }
      return sendJSON(res, 404, { error: 'Not Found' });
    }
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
  } catch (e) {
    sendJSON(res, 500, { error: e.message || '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`学术搜索 + AIGC 网站已启动: http://localhost:${PORT}`);
  console.log('按 Ctrl+C 停止。');
});
