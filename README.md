<div align="center">

# 🐾 Gemini 桌宠观察窗 · Gemini Pet Observer

**常驻 `gemini.google.com` 右下角的 Q 版二次元桌宠与无感额度监控插件**  
*A cute Chibi desktop pet & silent quota monitor Chrome extension for `gemini.google.com`*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](#en)
[![Browser](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge-green.svg)](#en)
[![Version](https://img.shields.io/badge/Version-v2.0.0-orange.svg)](../../releases)

**[简体中文](#zh) &nbsp;|&nbsp; [English](#en)**

</div>

## 📸 预览截图 · Screenshots

| 日常待机与实时额度<br><sub>Idle & Real-time Quota</sub> | 戳一戳果冻 Q 弹互动<br><sub>Jelly Bounce Interaction</sub> |
| :---: | :---: |
| <img src="https://github.com/user-attachments/assets/8ee20c6d-7fdb-4422-a799-c87a4c702cd8" height="260" alt="日常待机与实时额度监控" /> | <img src="https://github.com/user-attachments/assets/38f4e21d-e212-42a1-ba35-d1d5db0de44e" height="260" alt="戳一戳果冻Q弹互动" /> |
| **AI 上下文实时吐槽气泡**<br><sub>AI Context-Aware Reaction</sub> | **右键可视化配置 & 多 Key 轮询**<br><sub>Right-Click Settings & Key Rotation</sub> |
| <img src="https://github.com/user-attachments/assets/1e983844-7ace-446a-a49d-6306ef6d8941" height="260" alt="AI上下文实时吐槽气泡" /> | <img src="https://github.com/user-attachments/assets/bdb67bab-73b0-4efb-9b82-745d0d0a701b" height="260" alt="右键可视化配置面板" /> |

---

<a id="zh"></a>
## 🇨🇳 简体中文

### ✨ 核心特性

* **无感自动校准官方额度**：每轮对话生成完毕后，通过同源隐形 `iframe` 静默读取 `/usage` 页面真实消耗并反算剩余百分比，**不弹窗、不抢焦点、不闪烁顶部标签栏**；支持点击思考气泡随时手动立即校准。
* **🌐 全网页冲浪 AI 陪伴（v2.0.0 重磅升级）**：
  * 突破 `gemini.google.com` 限制，可在任意网页陪伴冲浪（非 Gemini 页面自动隐藏额度气泡，不遮挡视野）；支持一键开关全网页模式或屏蔽指定网站。
  * **10 秒全局跨标签页节流**：打开新网页自动围观吐槽 1 次，10 秒内连续打开其他网页不重复触发，节省额度；随时单击桌宠即可主动点评当前网页内容。
* **❤️ 正负双向好感度 & 趣味投喂道具（v2.0.0 新增）**：
  * 支持 `-100`（憎恨 / 仇视 / 戒备 / 远离）到 `+100`（陌生 / 熟络 / 亲近 / 偏爱 / 满级羁绊）共 **9 档好感度**，可手动拖动滑块测试不同阶段反差台词。
  * 内置投喂道具：🐟 **小鱼干（+6）**、🍮 **焦糖布丁（+10）**、🍋 **超酸柠檬（-5）**、🥦 **苦瓜汁（-8）** 以及特殊道具 🥛 **主人的酸奶（好感 < 50 时 -10，好感 ≥ 50 时 +12）**。
* **🎭 性格 × 行为双维人设 & 🎲 随机心情（v2.0.0 新增）**：
  * 自由组合性格（可爱 / 傲娇 / 腹黑 / 毒舌 / 冷漠 / 雌小鬼）与行为倾向（好奇 / 关心 / 冷漠 / 鼓励 / 摸鱼 / 认真辅导），支持新增自定义人设与口癖。
  * 开启 **「随机心情」** 后，可按每 15 分钟 / 30 分钟 / 1 小时或每次新网页自动随机切换性格与行为组合。
* **💬 独立大模型聊天窗 & 📜 历史吐槽记录 & 自由拖动缩放**：
  * 随时点击 **「💬 对话」**（或 `Alt + P`）单独和大模型多轮聊天，支持 Google / DeepSeek / 本地 Ollama（免 Key）；左侧气泡默认停留 9 秒（可调 `3s–30s`、悬停暂停消失），全部台词存入 **「📜 记录」**（最近 40 条）。
* **🧠 AI 实时互动大脑**：
  * **上下文实时吐槽**：每轮对话结束或鼠标戳一戳小人时，结合当前聊天内容生成灵动可爱的猫娘互动台词，并自动匹配对应表情。
  * **可视化右键配置面板**：右键点击小人即可直接在网页端配置接口，内置 **Google 免费版（`gemini-3.1-flash-lite`）** 与 **DeepSeek** 一键预设，兼容所有 OpenAI 格式接口及本地 Ollama。
  * **多 API Key 自动轮询与故障转移**：支持粘贴多个 API Key（每行一个），请求时自动按序轮询负载均衡；遇到限流（`429`）或单个 Key 异常时自动无缝切换下一个 Key 重试。
  * **剧本库与防复读机制**：内置 14 种随机互动剧本与最近 6 句防复读记忆，连续点击也能保持回复花样百出。
* **多表情智能状态机**：
  * `idle.webp`：日常待机呼吸起伏状态
  * `eat.webp`：Gemini 正在流式输出回复时，自动切换为“啃食 Token”咀嚼摇晃状态
  * `xd.webp` / `grin.webp`：回复完成、点击互动或 AI 情绪触发时切换对应开心/调皮表情
* **果冻 Q 弹互动与零样式污染**：点击触发果冻弹性形变物理动画；基于 Manifest V3 与 `Shadow DOM` 构建，完全隔离 Gemini 网页原有样式。

### 📁 项目文件结构

```text
gemini-pet-observer/
├── manifest.json      # Chrome 扩展清单文件 (Manifest V3)
├── background.js      # 后台服务脚本 (处理大模型 API 请求与多 Key 轮询)
├── content.js         # 页面注入脚本 (无感额度校准、Shadow DOM UI 与物理动画)
├── rules.json         # declarativeNetRequest 规则 (放行同源 iframe 读取用量)
├── icon.png           # 扩展管理页图标
├── idle.webp          # 待机表情
├── eat.webp           # 生成回复时的啃食表情
├── xd.webp            # 开心/完成表情 (> <)
└── grin.webp          # 调皮咧嘴笑表情
```

### 📦 安装方法（Chrome / Edge）

1. 前往本仓库右侧的 **[Releases](../../releases)** 页面，下载最新版本的 `Source code (zip)` 并解压到一个固定文件夹（安装后请勿删除该文件夹）。
2. 打开浏览器地址栏，输入 `chrome://extensions/`（Edge 浏览器输入 `edge://extensions/`）。
3. 开启右上角的 **开发者模式（Developer mode）**。
4. 点击左上角的 **加载已解压的扩展程序（Load unpacked）**，选择刚刚解压出来的文件夹。
5. 打开或刷新 [Gemini 网页端](https://gemini.google.com/)，右下角即可看到常驻桌宠。

### 🎮 交互操作指南

| 操作方式 | 触发动作 | 效果说明 |
| :--- | :--- | :--- |
| **单击小人** | 戳一戳互动 | 触发果冻 Q 弹动画 + 切换表情 + 左侧弹出卖萌或 AI 动态台词 |
| **双击小人** | 面板切换 | 收起或重新展开头顶的额度思考气泡 |
| **右键小人** | 设置面板 | 打开/关闭 **AI 实时互动大脑配置卡片**（支持一键测试连接） |
| **单击思考气泡** | 手动校准 | 立即在后台无感同步 `/usage` 最新剩余百分比与重置倒计时 |

### ⚙️ 配置 AI 实时吐槽大脑（可选）

不配置 API Key 时，插件默认使用内置的本地卖萌词库，开箱即用；如需开启 AI 实时上下文吐槽：

1. **鼠标右键点击**右下角的小人，打开配置面板。
2. 点击面板顶部的 **`填入 Google 免费版`**（推荐前往 Google AI Studio 申请免费 API Key，默认使用低延迟的 `gemini-3.1-flash-lite`）或 **`填入 DeepSeek`**。
3. 在 `API Keys` 输入框中粘贴你的密钥（**支持同时填入多个 Key，每行一个**，插件会自动轮询调用）。
4. 勾选 **`启用对话与点击实时吐槽`**，点击左下角 **`测试连接`** 确认返回绿色成功提示后，点击 **`保存生效`** 即可。

### 🎨 自定义皮肤与默认台词

* **更换角色立绘**：直接用你喜欢的透明背景 `.webp` 或 `.png` 图片替换文件夹中的 `idle.webp`、`eat.webp`、`xd.webp`、`grin.webp`（保持文件名一致），然后在 `chrome://extensions/` 点击插件的刷新图标即可生效。
* **修改本地台词**：打开 `content.js`，搜索 `CUTE_LINES` 数组，自由增删本地兜底卖萌台词。

### 🔒 隐私与免责声明

* **本地密钥安全**：所有填入的 API Key 均仅保存在当前浏览器的本地隔离存储（`chrome.storage.local`）中，仅在触发桌宠对话时直连你配置的 API 接口，绝不上传至任何第三方服务器。
* **版权说明**：本项目仅供学习与个人效率辅助使用。默认示例立绘版权归属原作者，如需二次分发或上架商店请替换为原创或已获授权的素材。

---

<a id="en"></a>
## 🇺🇸 English

### ✨ Key Features

* **Silent Official Quota Calibration**: Automatically reads real usage data from `/usage` via a same-origin invisible `iframe` after each chat turn and calculates remaining percentages—**no pop-up tabs, no focus stealing, and no tab bar flickering**. Click the thought bubble anytime to trigger an instant manual sync.
* **🧠 AI Real-Time Interaction Brain (New in v2.0.0)**:
  * **Context-Aware Reactions**: Generates lively, context-aware chibi catgirl comments after AI responses finish or when you poke the pet, automatically matching expressions to the mood.
  * **Right-Click Visual Settings Panel**: Right-click the pet directly on the webpage to configure your API—includes one-click presets for **Google Free API (`gemini-3.1-flash-lite`)** and **DeepSeek**, compatible with any OpenAI-format endpoint or local Ollama.
  * **Multi-API Key Rotation & Failover**: Paste multiple API keys (one per line) for round-robin load balancing. Automatically fails over to the next key if a rate limit (`429`) or key error occurs.
  * **Playbooks & Anti-Repeat Memory**: Built-in 14 random interaction playbooks plus a 6-message anti-repeat history keep repeated pokes fresh and varied.
* **4-State Expressive Sprite Engine**:
  * `idle.webp`: Subtle breathing idle animation
  * `eat.webp`: Switches to a chewing/munching animation while Gemini is streaming a response
  * `xd.webp` / `grin.webp`: Triggered upon reply completion, click interactions, or AI emotion tags
* **Jelly Bounce Physics & Style Isolation**: Satisfying squishy jelly bounce animation on click; built with Manifest V3 and `Shadow DOM` so it never interferes with Gemini's native styles.

### 📁 Project Structure

```text
gemini-pet-observer/
├── manifest.json      # Chrome Extension Manifest (Manifest V3)
├── background.js      # Background Service Worker (LLM requests & multi-key rotation)
├── content.js         # Content Script (silent quota sync, Shadow DOM UI & animations)
├── rules.json         # declarativeNetRequest rules (allows same-origin /usage iframe)
├── icon.png           # Extension icon
├── idle.webp          # Idle sprite
├── eat.webp           # Streaming/eating sprite
├── xd.webp            # Happy/excited sprite (> <)
└── grin.webp          # Playful grin sprite
```

### 📦 Installation (Chrome / Edge)

1. Go to the **[Releases](../../releases)** page on the right, download the latest `Source code (zip)`, and extract it to a permanent folder (do not delete this folder after installing).
2. Open `chrome://extensions/` in Chrome (or `edge://extensions/` in Edge).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the extracted folder.
5. Open or refresh [Gemini Web](https://gemini.google.com/)—your desktop pet will appear in the bottom-right corner.

### 🎮 Controls & Interactions

| Action | Trigger | Behavior |
| :--- | :--- | :--- |
| **Single-Click Pet** | Poke interaction | Plays jelly bounce animation + switches expression + shows cute or AI-generated speech bubble |
| **Double-Click Pet** | Toggle panel | Collapses or expands the overhead quota thought bubble |
| **Right-Click Pet** | Settings card | Opens/closes the **AI Interaction Brain** config panel (with built-in connection test) |
| **Click Thought Bubble** | Manual sync | Immediately calibrates remaining 5h/weekly quota & reset countdown in the background |

### ⚙️ Configuring the AI Interaction Brain (Optional)

Out of the box, the pet works immediately using built-in local cute lines without needing an API key. To enable live AI reactions:

1. **Right-click** the pet in the bottom-right corner to open the settings panel.
2. Click **`填入 Google 免费版`** (recommended: get a free key from Google AI Studio, pre-configured with fast `gemini-3.1-flash-lite`) or **`填入 DeepSeek`**.
3. Paste your API key(s) into the `API Keys` box (**supports multiple keys, one per line**, for automatic round-robin rotation).
4. Check **`启用对话与点击实时吐槽`**, click **`测试连接`** (Test Connection) to verify a green success response, and click **`保存生效`** (Save).

### 🎨 Customizing Sprites & Lines

* **Custom Sprites**: Replace `idle.webp`, `eat.webp`, `xd.webp`, and `grin.webp` in the extension folder with your own transparent `.webp` or `.png` images (keeping the exact filenames), then click the refresh icon on `chrome://extensions/`.
* **Custom Fallback Lines**: Open `content.js` and edit the `CUTE_LINES` array to customize offline/fallback phrases.

### 🔒 Privacy & Disclaimer

* **Local Key Storage**: All entered API keys are stored strictly inside your browser's isolated local storage (`chrome.storage.local`) and are sent only to your configured API endpoint when triggered—never to any third-party server.
* **Disclaimer**: Provided for educational and personal productivity purposes. Default sample character sprites belong to their respective copyright holders; please replace them with original or licensed artwork before public redistribution or store submission.