# 学术搜索 + AIGC 工作台

一个**零依赖**（仅用 Node.js 内置模块）的本地网站，包含两大功能：

1. **学术搜索**：Nature 期刊实时检索（标题、作者、年份、来源、摘要、链接直接返回）。
2. **AIGC 对话**：自行填写 `AI模型提供商-AI模型型号` 与 API Key，调用任意兼容 OpenAI 接口的 LLM（Anthropic 单独适配）。

---

## 一、用 VSCode 启动并运行

### 方式 A：一键调试（推荐）
1. 用 **VSCode** 打开本文件夹（`文件 → 打开文件夹`，选择 `academic-aigc-hub`）。
2. 切到「运行和调试」面板（Ctrl+Shift+D），选择 **Launch Academic+AIGC Server**，按 **F5**。
3. 集成终端会出现 `学术搜索 + AIGC 网站已启动: http://localhost:3000`。
4. 浏览器打开 <http://localhost:3000> 即可使用。

### 方式 B：终端运行
1. 在 VSCode 中打开本文件夹，按 `` Ctrl+` `` 打开集成终端。
2. 执行：
   ```bash
   node server.js
   ```
   （如需改端口：`PORT=8080 node server.js`）
3. 浏览器打开 <http://localhost:3000>。

> 本项目**无需 `npm install`**：没有第三方依赖，Node 18+ 直接可跑。

---

## 二、学术搜索用法
- 在「学术搜索」标签输入关键词，点「搜索」即可。
- **Nature**：服务端直接抓取并解析 Nature 官网搜索结果页，**实时返回**论文标题、作者、年份、来源、摘要与原文链接，结果直链到 nature.com 原文。
- 学术搜索**仅保留 Nature 来源**（中国知网来源已移除），以保证检索稳定、无需登录或验证码。

---

## 三、AIGC 用法
- 切到「AIGC 对话」标签。
- **AI 模型**：按 `提供商-型号` 填写，例如：
  - `OpenAI-gpt-4o`
  - `DeepSeek-deepseek-chat`
  - `Anthropic-claude-3-5-sonnet`
  - `Qwen-qwen-plus`
  - `Zhipu-glm-4`
- **API Key**：填写对应平台申请的密钥（仅用于本次请求，服务端不存储）。
- **自定义 Base URL**（可选）：用于自建/代理/未内置的提供商，填写完整接口地址，
  例如 `https://api.openai.com/v1/chat/completions`。
- **System Prompt / 提示词**：按需填写后点「发送」。
- **降AI率模式**：AIGC 面板顶部可在「对话模式」与「降AI率」之间切换。选择「降AI率」后，把被判定为 AI 生成的文本粘贴到输入框并发送，模型会在**保持原意、专业性与准确性**的前提下将其改写为更像人类写作的表达，并直接输出改写结果（无需自定义 System Prompt；若填写则覆盖默认润色指令）。

### 已内置的提供商 → 默认接口
OpenAI、DeepSeek、Moonshot(Kimi)、Qwen、Zhipu、Baichuan、MiniMax、
OpenRouter、Groq、Together、Ollama、Gemini、Anthropic。
未知提供商请填写完整 Base URL。

---

## 四、安全说明
- 所有请求都在你本机 `localhost` 完成，API Key 仅随本次请求发给对应大模型厂商，
  **不会写入磁盘或日志**。
- 不要把这个服务暴露到公网（默认只监听本机 `localhost`）。

---

## 五、常见问题
- **端口被占用**：用 `PORT=8080 node server.js` 换端口。
- **搜索无结果/报错**：Nature 为实时网络抓取，请确认本机能访问 `nature.com`；若网络受限，可换关键词重试。
