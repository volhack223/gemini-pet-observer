# 🐾 Gemini 桌宠观察窗 (Gemini Pet Observer)

在 `gemini.google.com` 网页端右下角常驻一只 Q 版二次元桌宠，头顶带有一个经典思考气泡，实时显示 **5 小时剩余额度、每周剩余额度、重置倒计时与当前上下文 Token 占用**，并内置 **AI 实时上下文吐槽大脑**、**多 API Key 轮询**与物理果冻 Q 弹互动。

> 💡 **预览截图**：
><img width="291" height="288" alt="image" src="https://github.com/user-attachments/assets/8ee20c6d-7fdb-4422-a799-c87a4c702cd8" />
><img width="301" height="300" alt="image" src="https://github.com/user-attachments/assets/38f4e21d-e212-42a1-ba35-d1d5db0de44e" />
><img width="344" height="291" alt="image" src="https://github.com/user-attachments/assets/1e983844-7ace-446a-a49d-6306ef6d8941" />
><img width="400" height="293" alt="1994b895aac4d383ecce3249700aa683" src="https://github.com/user-attachments/assets/bdb67bab-73b0-4efb-9b82-745d0d0a701b" />
 



*
*

## ✨ 核心特性

* **无感自动校准官方额度**：每轮对话生成完毕后，通过同源隐形 `iframe` 静默读取 `/usage` 页面真实消耗并反算剩余百分比，**不弹窗、不抢焦点、不闪烁顶部标签栏**；支持点击思考气泡随时手动立即校准。
* **🧠 AI 实时互动大脑（v1.5.0 新增）**：
  * **上下文实时吐槽**：每轮对话结束或鼠标戳一戳小人时，结合当前聊天内容生成灵动可爱的猫娘互动台词，并自动匹配对应表情。
  * **可视化右键配置面板**：右键点击小人即可直接在网页端配置接口，内置 **Google 免费版（`gemini-3.1-flash-lite`）** 与 **DeepSeek** 一键预设，兼容所有 OpenAI 格式接口及本地 Ollama。
  * **多 API Key 自动轮询与故障转移**：支持粘贴多个 API Key（每行一个），请求时自动按序轮询负载均衡；遇到限流（`429`）或单个 Key 异常时自动无缝切换下一个 Key 重试。
  * **剧本库与防复读机制**：内置 14 种随机互动剧本与最近 6 句防复读记忆，连续点击也能保持回复花样百出。
* **多表情智能状态机**：
  * `idle.webp`：日常待机呼吸起伏状态
  * `eat.webp`：Gemini 正在流式输出回复时，自动切换为“啃食 Token”咀嚼摇晃状态
  * `xd.webp` / `grin.webp`：回复完成、点击互动或 AI 情绪触发时切换对应开心/调皮表情
* **果冻 Q 弹互动与零样式污染**：点击触发果冻弹性形变物理动画；基于 Manifest V3 与 `Shadow DOM` 构建，完全隔离 Gemini 网页原有样式。

## 📁 项目文件结构

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

## 📦 安装方法（Chrome / Edge）

1. 前往本仓库右侧的 **[Releases](../../releases)** 页面，下载最新版本的 `Source code (zip)` 并解压到一个固定文件夹（安装后请勿删除该文件夹）。
2. 打开浏览器地址栏，输入 `chrome://extensions/`（Edge 浏览器输入 `edge://extensions/`）。
3. 开启右上角的 **开发者模式（Developer mode）**。
4. 点击左上角的 **加载已解压的扩展程序（Load unpacked）**，选择刚刚解压出来的文件夹。
5. 打开或刷新 [Gemini 网页端](https://gemini.google.com/)，右下角即可看到常驻桌宠。

## 🎮 交互操作指南

| 操作方式 | 触发动作 | 效果说明 |
| :--- | :--- | :--- |
| **单击小人** | 戳一戳互动 | 触发果冻 Q 弹动画 + 切换表情 + 左侧弹出卖萌或 AI 动态台词 |
| **双击小人** | 面板切换 | 收起或重新展开头顶的额度思考气泡 |
| **右键小人** | 设置面板 | 打开/关闭 **AI 实时互动大脑配置卡片**（支持一键测试连接） |
| **单击思考气泡** | 手动校准 | 立即在后台无感同步 `/usage` 最新剩余百分比与重置倒计时 |

## ⚙️ 配置 AI 实时吐槽大脑（可选）

不配置 API Key 时，插件默认使用内置的本地卖萌词库，开箱即用；如需开启 AI 实时上下文吐槽：

1. **鼠标右键点击**右下角的小人，打开配置面板。
2. 点击面板顶部的 **`填入 Google 免费版`**（推荐前往 Google AI Studio 申请免费 API Key，默认使用低延迟的 `gemini-3.1-flash-lite`）或 **`填入 DeepSeek`**。
3. 在 `API Keys` 输入框中粘贴你的密钥（**支持同时填入多个 Key，每行一个**，插件会自动轮询调用）。
4. 勾选 **`启用对话与点击实时吐槽`**，点击左下角 **`测试连接`** 确认返回绿色成功提示后，点击 **`保存生效`** 即可。

## 🎨 自定义皮肤与默认台词

* **更换角色立绘**：直接用你喜欢的透明背景 `.webp` 或 `.png` 图片替换文件夹中的 `idle.webp`、`eat.webp`、`xd.webp`、`grin.webp`（保持文件名一致），然后在 `chrome://extensions/` 点击插件的刷新图标即可生效。
* **修改本地台词**：打开 `content.js`，搜索 `CUTE_LINES` 数组，自由增删本地兜底卖萌台词。

## 🔒 隐私与免责声明

* **本地密钥安全**：所有填入的 API Key 均仅保存在当前浏览器的本地隔离存储（`chrome.storage.local`）中，仅在触发桌宠对话时直连你配置的 API 接口，绝不上传至任何第三方服务器。
* **版权说明**：本项目仅供学习与个人效率辅助使用。默认示例立绘版权归属原作者，如需二次分发或上架商店请替换为原创或已获授权的素材。
