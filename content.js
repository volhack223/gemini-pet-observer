(() => {
  const isIframe = window.self !== window.top;

  function parseAndSyncUsageText(rawText) {
    if (!rawText) return false;
    if (rawText.length < 20) return false;

    const cnMatches = [...rawText.matchAll(/已使用\s*(\d{1,3}(?:\.\d+)?)\s*%/g)].map(m => parseFloat(m[1]));
    const enMatches = [...rawText.matchAll(/Used\s*(\d{1,3}(?:\.\d+)?)\s*%/gi)].map(m => parseFloat(m[1]));
    const usedMatches = cnMatches.length > 0 ? cnMatches : enMatches;

    if (usedMatches.length === 0) return false;

    const curRemain = Math.max(0, Math.min(100, 100 - usedMatches[0]));
    const weeklyRemain = usedMatches.length > 1
      ? Math.max(0, Math.min(100, 100 - usedMatches[1]))
      : 100;

    let resetCountdownStr = '';
    const resetTimeMatch = rawText.match(/重置时间[：:]\s*(\d{1,2}):(\d{2})/);
    if (resetTimeMatch) {
      const targetH = parseInt(resetTimeMatch[1], 10);
      const targetM = parseInt(resetTimeMatch[2], 10);
      const now = new Date();
      const target = new Date(now);
      target.setHours(targetH, targetM, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      const diffMin = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
      const h = Math.floor(diffMin / 60);
      const m = String(diffMin % 60).padStart(2, '0');
      resetCountdownStr = `${h}h${m}m`;
    }

    chrome.storage.local.get(['geminiPetState'], (res) => {
      const cur = res.geminiPetState ? res.geminiPetState : {};
      const nextReset = resetCountdownStr
        ? resetCountdownStr
        : (cur.resetCountdownStr ? cur.resetCountdownStr : '');
      const updated = {
        ...cur,
        exactFiveHourPct: curRemain,
        weeklyRemainPct: weeklyRemain,
        resetCountdownStr: nextReset,
        lastSyncAt: Date.now()
      };
      chrome.storage.local.set({ geminiPetState: updated }, () => {
        if (isIframe) {
          window.parent.postMessage({ type: 'GEMINI_USAGE_IFRAME_DONE' }, 'https://gemini.google.com');
        }
      });
    });

    return true;
  }

  if (location.pathname.startsWith('/usage')) {
    let tries = 0;
    const usageTimer = setInterval(() => {
      tries++;
      const ok = parseAndSyncUsageText(document.body.innerText);
      if (ok) {
        clearInterval(usageTimer);
      } else if (tries > 25) {
        clearInterval(usageTimer);
      }
    }, 400);
    if (isIframe) return;
  } else if (isIframe) {
    return;
  }

  if (document.getElementById('gemini-pet-observer-host')) return;

  const PRESETS = {
    google: {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.5-flash-lite'
    },
    deepseek: {
      apiUrl: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat'
    },
    ollama: {
      apiUrl: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen2.5:7b'
    }
  };

  const DEFAULT_STATE = {
    modelTitle: 'Gemini 4 Pro 5h 额度',
    exactFiveHourPct: 100,
    weeklyRemainPct: 100.0,
    resetCountdownStr: '',
    contextMaxTokens: 1000000,
    totalSessionTokens: 0,
    lastSyncAt: 0,
    bubbleVisible: true,
    petSize: 138,
    bubbleScale: 100,
    voiceScale: 100,
    voiceDurationSec: 9,
    posRight: 16,
    posBottom: 0
  };

  const DEFAULT_AI_CONFIG = {
    enabled: false,
    apiUrl: PRESETS.google.apiUrl,
    apiKeys: '',
    model: PRESETS.google.model,
    attachContext: false
  };

  let state = { ...DEFAULT_STATE };
  let aiConfig = { ...DEFAULT_AI_CONFIG };
  let voiceLogs = [];
  let chatHistory = [];
  let isSyncing = false;
  let isChatSending = false;
  let lastTriggerTime = 0;
  let lastClickAiTime = 0;
  let syncTimeoutGuard = null;
  let saveLayoutTimer = null;
  let voiceHovered = false;
  let activeDrawerTab = 'chat'; // 'chat' | 'history'

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function isLocalUrl(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(String(url || '').trim());
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatChatText(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function formatClock(ts) {
    const d = new Date(ts || Date.now());
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  const SPRITES = {
    idle: chrome.runtime.getURL('idle.webp'),
    xd: chrome.runtime.getURL('xd.webp'),
    eat: chrome.runtime.getURL('eat.webp'),
    grin: chrome.runtime.getURL('grin.webp')
  };
  Object.values(SPRITES).forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  const CUTE_LINES = [
    '喵呜~ 别戳啦，要被戳成布丁了！',
    '嘿嘿，按住我可以随便拖到页面任何位置哦 (＞◡＜)',
    '点我旁边的「对话」按钮，就能单独开一个大模型小窗聊天喵~',
    '当前额度还很充足哦，放心大胆聊吧~',
    '啊呜啊呜… 刚才的回答味道还不错！',
    '再戳的话… 本喵就要把你的额度全吃掉咯！',
    '错过刚才我说的话？点「对话」里的「吐槽记录」随时回看哦~'
  ];

  let tempSprite = null;
  let tempSpriteTimer = null;
  let voiceHideTimer = null;

  function countKeys(raw) {
    if (!raw) return 0;
    return String(raw).split(/[\r\n,，;；]+/).map(s => s.trim()).filter(Boolean).length;
  }

  function removeSyncIframe() {
    const oldFrame = document.getElementById('gemini-usage-sync-frame');
    if (oldFrame) oldFrame.remove();
    isSyncing = false;
    clearTimeout(syncTimeoutGuard);
    renderUI();
  }

  window.addEventListener('message', (event) => {
    if (event.origin === 'https://gemini.google.com' && event.data?.type === 'GEMINI_USAGE_IFRAME_DONE') {
      removeSyncIframe();
    }
  });

  chrome.storage.local.get(['geminiPetState', 'petAiConfig', 'petVoiceLogs', 'petChatHistory'], (res) => {
    if (res.geminiPetState) {
      state = { ...DEFAULT_STATE, ...res.geminiPetState };
    }
    if (res.petAiConfig) {
      const savedKeys = res.petAiConfig.apiKeys
        ? res.petAiConfig.apiKeys
        : (res.petAiConfig.apiKey ? res.petAiConfig.apiKey : '');
      aiConfig = {
        ...DEFAULT_AI_CONFIG,
        ...res.petAiConfig,
        apiKeys: savedKeys
      };
    }
    if (Array.isArray(res.petVoiceLogs)) {
      voiceLogs = res.petVoiceLogs.slice(0, 40);
    }
    if (Array.isArray(res.petChatHistory)) {
      chatHistory = res.petChatHistory.slice(-40);
    }
    fillConfigForm();
    renderChatHistory();
    renderVoiceLogs();
    renderUI();
    if (!location.pathname.startsWith('/usage')) {
      setTimeout(() => triggerSilentSync(true), 2000);
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiPetState && changes.geminiPetState.newValue) {
      state = { ...state, ...changes.geminiPetState.newValue };
      renderUI();
    }
    if (changes.petAiConfig && changes.petAiConfig.newValue) {
      const nv = changes.petAiConfig.newValue;
      const savedKeys = nv.apiKeys ? nv.apiKeys : (nv.apiKey ? nv.apiKey : '');
      aiConfig = {
        ...DEFAULT_AI_CONFIG,
        ...nv,
        apiKeys: savedKeys
      };
      fillConfigForm();
    }
    if (changes.petVoiceLogs && Array.isArray(changes.petVoiceLogs.newValue)) {
      voiceLogs = changes.petVoiceLogs.newValue.slice(0, 40);
      renderVoiceLogs();
    }
    if (changes.petChatHistory && Array.isArray(changes.petChatHistory.newValue)) {
      chatHistory = changes.petChatHistory.newValue.slice(-40);
      renderChatHistory();
    }
  });

  function saveState() {
    chrome.storage.local.set({ geminiPetState: state });
  }

  function scheduleSaveLayout() {
    clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(() => {
      saveState();
    }, 200);
  }

  function recordVoiceLog(text, source = '互动') {
    const clean = String(text || '').trim();
    if (!clean || clean === '喵呜？让我想想…') return;
    voiceLogs = [{ text: clean, source, ts: Date.now() }, ...voiceLogs].slice(0, 40);
    chrome.storage.local.set({ petVoiceLogs: voiceLogs });
    renderVoiceLogs();
  }

  function triggerSilentSync(force = false) {
    const now = Date.now();
    if (isSyncing) return;
    if (!force && now - lastTriggerTime < 15000) return;

    lastTriggerTime = now;
    isSyncing = true;
    renderUI();

    if (location.pathname.startsWith('/usage')) {
      parseAndSyncUsageText(document.body.innerText);
      setTimeout(() => { isSyncing = false; renderUI(); }, 500);
      return;
    }

    const oldFrame = document.getElementById('gemini-usage-sync-frame');
    if (oldFrame) oldFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'gemini-usage-sync-frame';
    iframe.src = 'https://gemini.google.com/usage';
    iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:360px;height:480px;opacity:0.001;pointer-events:none;border:none;z-index:-1;';
    document.body.appendChild(iframe);

    clearTimeout(syncTimeoutGuard);
    syncTimeoutGuard = setTimeout(removeSyncIframe, 10000);
  }

  const host = document.createElement('div');
  host.id = 'gemini-pet-observer-host';
  host.style.cssText = 'position:fixed;bottom:0;right:16px;z-index:2147483647;pointer-events:none;font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .wrapper { position: relative; display: flex; flex-direction: column; align-items: flex-end; user-select: none; }
      .bubble-container {
        display: flex; flex-direction: column; align-items: center;
        margin-right: 28px; margin-bottom: -6px; pointer-events: auto;
        transform-origin: bottom right;
        transition: opacity 0.25s ease, transform 0.2s ease;
      }
      .bubble-container.hidden { opacity: 0; pointer-events: none; }
      .main-oval {
        background: #ffffff; border: 4.5px solid #202a5c; border-radius: 50%;
        padding: 18px 34px; text-align: center;
        box-shadow: 0 6px 20px rgba(32, 42, 92, 0.14);
        min-width: 245px; cursor: pointer; transition: transform 0.12s ease;
      }
      .main-oval:active { transform: scale(0.96); }
      .title { font-size: 13px; font-weight: 700; color: #202a5c; margin-bottom: 2px; }
      .big-pct { font-size: 32px; font-weight: 900; color: #10b981; line-height: 1.15; margin: 2px 0; }
      .big-pct.warn { color: #f59e0b; }
      .big-pct.danger { color: #ef4444; }
      .sub-line { font-size: 12.5px; color: #4b5563; font-weight: 600; line-height: 1.45; }
      .underline { text-decoration: underline; text-underline-offset: 2px; }
      .sync-tag { font-size: 11px; color: #3b82f6; margin-top: 3px; font-weight: 600; }
      .dot-1 { width: 22px; height: 14px; background: #fff; border: 4px solid #202a5c; border-radius: 50%; margin-top: 4px; margin-left: 55px; }
      .dot-2 { width: 14px; height: 9px; background: #fff; border: 3.5px solid #202a5c; border-radius: 50%; margin-top: 3px; margin-left: 88px; }

      .pet-stage { position: relative; display: flex; align-items: flex-end; justify-content: flex-end; gap: 6px; }
      .quick-bar {
        display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;
        pointer-events: auto; opacity: 0.78; transition: opacity 0.2s ease;
      }
      .quick-bar:hover { opacity: 1; }
      .quick-btn {
        background: #ffffff; color: #202a5c; border: 2px solid #202a5c;
        border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 800;
        cursor: pointer; box-shadow: 0 3px 10px rgba(32, 42, 92, 0.16);
        white-space: nowrap; transition: transform 0.12s ease, background 0.15s;
      }
      .quick-btn:hover { background: #eef2ff; transform: translateY(-1px); }
      .quick-btn.active { background: #202a5c; color: #ffffff; }

      .voice-bubble {
        position: absolute;
        right: calc(100% + 10px);
        bottom: 28px;
        width: max-content;
        max-width: 245px;
        min-width: 72px;
        writing-mode: horizontal-tb;
        text-align: left;
        background: #ffffff;
        color: #202a5c;
        border: 2.5px solid #202a5c;
        border-radius: 14px;
        padding: 8px 13px;
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1.45;
        white-space: normal;
        word-break: break-word;
        box-shadow: 0 4px 14px rgba(32, 42, 92, 0.2);
        opacity: 0;
        transform-origin: right center;
        transform: translateX(8px) scale(calc(var(--voice-scale, 1) * 0.92));
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 8;
        cursor: pointer;
      }
      .voice-bubble::after {
        content: '';
        position: absolute;
        right: -7px;
        bottom: 14px;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border-right: 2.5px solid #202a5c;
        border-top: 2.5px solid #202a5c;
        transform: rotate(45deg);
      }
      .voice-bubble.show {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(0) scale(var(--voice-scale, 1));
      }
      .wrapper.flip-x .voice-bubble { right: auto; left: calc(100% + 10px); transform-origin: left center; }
      .wrapper.flip-x .voice-bubble::after {
        right: auto;
        left: -7px;
        border-right: none;
        border-top: none;
        border-left: 2.5px solid #202a5c;
        border-bottom: 2.5px solid #202a5c;
      }

      /* 独立大模型对话 & 历史吐槽记录悬浮窗 */
      .chat-drawer {
        position: absolute; right: calc(100% + 10px); bottom: 10px;
        width: 360px; height: 440px;
        background: #ffffff; color: #1f2937;
        border: 3px solid #202a5c; border-radius: 16px;
        box-shadow: 0 14px 36px rgba(15, 23, 42, 0.28);
        pointer-events: auto; display: none; flex-direction: column;
        overflow: hidden; z-index: 25; user-select: text;
      }
      .chat-drawer.open { display: flex; }
      .wrapper.flip-x .chat-drawer { right: auto; left: calc(100% + 10px); }
      .wrapper.flip-y .chat-drawer { bottom: auto; top: 8px; }

      .chat-head {
        background: #202a5c; color: #ffffff; padding: 9px 12px;
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
      }
      .tab-group { display: flex; gap: 4px; }
      .tab-btn {
        background: rgba(255,255,255,0.14); color: #e0e7ff; border: none;
        border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 800; cursor: pointer;
      }
      .tab-btn.active { background: #ffffff; color: #202a5c; }
      .chat-head-actions { display: flex; gap: 5px; }
      .icon-btn {
        background: rgba(255,255,255,0.16); color: #fff; border: none;
        border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
      }
      .icon-btn:hover { background: rgba(255,255,255,0.28); }

      .pane { flex: 1; display: none; flex-direction: column; min-height: 0; }
      .pane.active { display: flex; }

      .chat-toolbar {
        background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 6px 12px;
        display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #475569;
      }
      .chat-toolbar label { display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: 600; }
      .chat-model-tag {
        font-size: 10.5px; font-weight: 700; color: #202a5c; background: #eef2ff;
        padding: 1px 7px; border-radius: 99px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .chat-messages, .history-list {
        flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px;
        background: #f8fafc;
      }
      .msg-row { display: flex; flex-direction: column; max-width: 88%; }
      .msg-row.user { align-self: flex-end; align-items: flex-end; }
      .msg-row.assistant { align-self: flex-start; align-items: flex-start; }
      .msg-bubble {
        padding: 8px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; word-break: break-word;
      }
      .msg-row.user .msg-bubble { background: #202a5c; color: #ffffff; border-bottom-right-radius: 3px; }
      .msg-row.assistant .msg-bubble { background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1; border-bottom-left-radius: 3px; }
      .msg-bubble code {
        background: rgba(15, 23, 42, 0.08); padding: 1px 4px; border-radius: 4px;
        font-family: ui-monospace, Consolas, monospace; font-size: 11.5px;
      }
      .msg-meta { font-size: 10px; color: #94a3b8; margin-top: 2px; }
      .empty-hint {
        margin: auto; text-align: center; color: #64748b; font-size: 12px; line-height: 1.65; padding: 16px;
      }
      .chat-input-area {
        display: flex; gap: 6px; padding: 8px 10px; background: #ffffff; border-top: 1px solid #e2e8f0;
      }
      .chat-input {
        flex: 1; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 7px 9px;
        font-size: 12.5px; resize: none; height: 42px; max-height: 90px; outline: none;
        font-family: inherit; color: #0f172a; background: #f8fafc;
      }
      .chat-input:focus { border-color: #202a5c; background: #ffffff; }
      .chat-send-btn {
        background: #202a5c; color: #ffffff; border: none; border-radius: 8px;
        padding: 0 14px; font-size: 12.5px; font-weight: 800; cursor: pointer;
      }
      .chat-send-btn:disabled { opacity: 0.55; cursor: not-allowed; }

      .log-item {
        background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px;
        padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
      }
      .log-meta {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 10.5px; color: #64748b; font-weight: 600;
      }
      .log-badge {
        background: #eef2ff; color: #202a5c; padding: 1px 6px; border-radius: 99px; font-size: 10px; font-weight: 700;
      }
      .log-text { font-size: 12.5px; color: #1e293b; line-height: 1.45; word-break: break-word; }

      .settings-card {
        position: absolute; right: calc(100% + 10px); bottom: 12px; width: 320px;
        max-height: 82vh; overflow-y: auto;
        background: #ffffff; color: #1f2937;
        border: 3px solid #202a5c; border-radius: 14px;
        padding: 12px 14px; box-shadow: 0 10px 28px rgba(32, 42, 92, 0.28);
        pointer-events: auto; display: none; flex-direction: column; gap: 8px;
        font-size: 12px; z-index: 30; user-select: text;
      }
      .settings-card.open { display: flex; }
      .wrapper.flip-x .settings-card { right: auto; left: calc(100% + 10px); }
      .wrapper.flip-y .settings-card { bottom: auto; top: 8px; }

      .settings-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #202a5c; font-size: 13px; }
      .layout-box {
        background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px;
        padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
      }
      .layout-head {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 11.5px; font-weight: 800; color: #202a5c;
      }
      .btn-mini {
        background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1; border-radius: 6px;
        padding: 2px 7px; font-size: 10.5px; font-weight: 700; cursor: pointer;
      }
      .btn-mini:hover { background: #e2e8f0; }
      .slider-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #475569; }
      .slider-row input[type="range"] { flex: 1; accent-color: #202a5c; cursor: pointer; }
      .slider-row span.val { min-width: 44px; text-align: right; font-weight: 800; color: #202a5c; font-family: ui-monospace, Consolas, monospace; }

      .preset-row { display: flex; gap: 5px; }
      .preset-btn {
        flex: 1; background: #eef2ff; color: #202a5c; border: 1.5px solid #c7d2fe;
        border-radius: 6px; padding: 4px 5px; font-size: 10.5px; font-weight: 700;
        cursor: pointer; transition: background 0.15s;
      }
      .preset-btn:hover { background: #e0e7ff; }
      .preset-btn.local { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
      .preset-btn.local:hover { background: #d1fae5; }
      .settings-row { display: flex; flex-direction: column; gap: 3px; }
      .label-line { display: flex; justify-content: space-between; align-items: center; }
      .settings-row label { font-weight: 600; color: #4b5563; font-size: 11.5px; }
      .key-badge { font-size: 10.5px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 99px; }
      .settings-row input[type="text"], .settings-row textarea {
        border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 5px 8px;
        font-size: 11.5px; outline: none; color: #111827; background: #f8fafc;
        font-family: ui-monospace, Consolas, monospace;
      }
      .settings-row textarea { resize: vertical; min-height: 48px; line-height: 1.35; }
      .settings-row input:focus, .settings-row textarea:focus { border-color: #202a5c; background: #ffffff; }
      .switch-line { display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: #202a5c; }
      .test-result {
        font-size: 11px; line-height: 1.35; padding: 6px 8px; border-radius: 6px;
        background: #f1f5f9; color: #334155; display: none; word-break: break-all;
      }
      .test-result.show { display: block; }
      .test-result.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
      .test-result.err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

      .btn-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 2px; }
      .btn-test { background: #eff6ff; color: #1d4ed8; border: 1.5px solid #93c5fd; border-radius: 6px; padding: 4px 10px; font-weight: 700; cursor: pointer; font-size: 11.5px; }
      .btn-test:hover { background: #dbeafe; }
      .btn-save { background: #202a5c; color: #fff; border: none; border-radius: 6px; padding: 5px 12px; font-weight: 700; cursor: pointer; font-size: 12px; }
      .btn-cancel { background: #e2e8f0; color: #334155; border: none; border-radius: 6px; padding: 5px 10px; font-weight: 600; cursor: pointer; font-size: 12px; }

      .pet-box {
        width: 138px; height: 138px; pointer-events: auto; cursor: grab;
        display: flex; align-items: flex-end; justify-content: center; transform-origin: bottom center;
        touch-action: none;
      }
      .pet-box.dragging { cursor: grabbing; }
      .pet-box img {
        width: 100%; height: 100%; object-fit: contain; pointer-events: none;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.16));
        transform-origin: bottom center;
        animation: idleBreath 3.2s ease-in-out infinite;
      }
      .pet-box.eating img { animation: eatingMunch 0.55s ease-in-out infinite; }
      .pet-box.jelly img { animation: jellyBounce 0.65s cubic-bezier(0.28, 0.84, 0.42, 1) forwards !important; }

      @keyframes idleBreath {
        0%, 100% { transform: scale(1, 1); }
        50%      { transform: scale(1.02, 0.985); }
      }
      @keyframes eatingMunch {
        0%, 100% { transform: scale(1, 1) rotate(0deg); }
        25%      { transform: scale(1.04, 0.96) rotate(-2deg); }
        75%      { transform: scale(0.97, 1.03) rotate(2deg); }
      }
      @keyframes jellyBounce {
        0%   { transform: scale(1, 1); }
        22%  { transform: scale(1.24, 0.76); }
        44%  { transform: scale(0.85, 1.17); }
        64%  { transform: scale(1.11, 0.91); }
        82%  { transform: scale(0.96, 1.04); }
        100% { transform: scale(1, 1); }
      }
    </style>

    <div class="wrapper" id="wrapper">
      <div class="bubble-container" id="bubble">
        <div class="main-oval" id="oval-card" title="点击立即静默校准真实额度">
          <div class="title" id="model-title">Gemini 4 Pro 5h 额度</div>
          <div class="big-pct" id="remain-pct">剩 100%</div>
          <div class="sub-line" id="reset-line">周剩 100.0% · 同步中...</div>
          <div class="sub-line" id="ctx-line">上下文 0.0% (0.0K/1000K) · 已用<br>0.00M tok</div>
          <div class="sync-tag" id="sync-status">点击气泡立即校准</div>
        </div>
        <div class="dot-1"></div>
        <div class="dot-2"></div>
      </div>

      <div class="pet-stage">
        <div class="voice-bubble" id="voice-bubble" title="悬停暂停消失 · 点击查看历史记录">喵呜~</div>

        <div class="chat-drawer" id="chat-drawer">
          <div class="chat-head">
            <div class="tab-group">
              <button class="tab-btn active" id="tab-chat-btn" type="button">💬 独立对话</button>
              <button class="tab-btn" id="tab-history-btn" type="button">📜 吐槽记录</button>
            </div>
            <div class="chat-head-actions">
              <button class="icon-btn" id="drawer-cfg-btn" type="button">设置</button>
              <button class="icon-btn" id="drawer-clear-btn" type="button">清空</button>
              <button class="icon-btn" id="drawer-close-btn" type="button">✕</button>
            </div>
          </div>

          <div class="pane active" id="pane-chat">
            <div class="chat-toolbar">
              <label>
                <input type="checkbox" id="chat-attach-ctx" />
                <span>附带当前 Gemini 页面上下文</span>
              </label>
              <span class="chat-model-tag" id="chat-model-tag">gemini-2.5-flash-lite</span>
            </div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input-area">
              <textarea class="chat-input" id="chat-input" placeholder="在这里单独和大模型聊天 (Enter 发送，Shift+Enter 换行)..."></textarea>
              <button class="chat-send-btn" id="chat-send-btn" type="button">发送</button>
            </div>
          </div>

          <div class="pane" id="pane-history">
            <div class="chat-toolbar">
              <span>保存最近 40 条桌宠互动与吐槽记录</span>
              <span id="log-count-tag">0 条</span>
            </div>
            <div class="history-list" id="history-list"></div>
          </div>
        </div>

        <div class="settings-card" id="settings-card">
          <div class="settings-head">
            <span>🐾 桌宠外观与 AI 互动配置</span>
          </div>

          <div class="layout-box">
            <div class="layout-head">
              <span>📐 大小、位置与气泡时长（按住桌宠拖动）</span>
              <button class="btn-mini" id="cfg-reset-layout" type="button">重置默认</button>
            </div>
            <div class="slider-row">
              <span>宠物大小</span>
              <input type="range" id="cfg-pet-size" min="64" max="240" step="2" value="138" />
              <span class="val" id="cfg-pet-size-val">138px</span>
            </div>
            <div class="slider-row">
              <span>额度气泡</span>
              <input type="range" id="cfg-bubble-scale" min="65" max="140" step="5" value="100" />
              <span class="val" id="cfg-bubble-scale-val">100%</span>
            </div>
            <div class="slider-row">
              <span>对话气泡</span>
              <input type="range" id="cfg-voice-scale" min="65" max="160" step="5" value="100" />
              <span class="val" id="cfg-voice-scale-val">100%</span>
            </div>
            <div class="slider-row">
              <span>气泡停留</span>
              <input type="range" id="cfg-voice-sec" min="3" max="30" step="1" value="9" />
              <span class="val" id="cfg-voice-sec-val">9s</span>
            </div>
          </div>

          <div class="preset-row">
            <button class="preset-btn" id="preset-google" type="button">Google 免费版</button>
            <button class="preset-btn" id="preset-deepseek" type="button">DeepSeek</button>
            <button class="preset-btn local" id="preset-ollama" type="button">本地 Ollama</button>
          </div>
          <div class="switch-line">
            <span>启用对话与点击实时吐槽</span>
            <input type="checkbox" id="cfg-enabled" />
          </div>
          <div class="settings-row">
            <label>API 接口地址 (OpenAI 兼容 / 本地 Ollama)</label>
            <input type="text" id="cfg-url" placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" />
          </div>
          <div class="settings-row">
            <div class="label-line">
              <label>API Keys (每行一个自动轮询，本地可留空)</label>
              <span class="key-badge" id="key-count-badge">0 个 Key</span>
            </div>
            <textarea id="cfg-keys" placeholder="AIzaSy... (支持粘贴多个 Key，每行一个或逗号分隔)"></textarea>
          </div>
          <div class="settings-row">
            <label>模型名称</label>
            <input type="text" id="cfg-model" placeholder="gemini-2.5-flash-lite" />
          </div>
          <div class="test-result" id="test-result"></div>
          <div class="btn-row">
            <button class="btn-test" id="cfg-test" type="button">测试连接</button>
            <div style="display:flex;gap:6px;">
              <button class="btn-cancel" id="cfg-cancel" type="button">取消</button>
              <button class="btn-save" id="cfg-save" type="button">保存生效</button>
            </div>
          </div>
        </div>

        <div class="quick-bar">
          <button class="quick-btn" id="open-chat-btn" type="button" title="打开独立 AI 对话窗 (Alt+P)">💬 对话</button>
          <button class="quick-btn" id="open-history-btn" type="button" title="查看桌宠历史吐槽记录">📜 记录</button>
        </div>

        <div class="pet-box" id="pet-btn" title="按住拖动位置 · Ctrl+滚轮调大小 · 单击戳一戳 · 双击隐藏气泡 · 右键设置">
          <img id="pet-img" src="${SPRITES.idle}" alt="Pet" />
        </div>
      </div>
    </div>
  `;

  const wrapperEl = shadow.getElementById('wrapper');
  const bubbleEl = shadow.getElementById('bubble');
  const pctEl = shadow.getElementById('remain-pct');
  const titleEl = shadow.getElementById('model-title');
  const resetLineEl = shadow.getElementById('reset-line');
  const ctxLineEl = shadow.getElementById('ctx-line');
  const syncStatusEl = shadow.getElementById('sync-status');
  const petBtnEl = shadow.getElementById('pet-btn');
  const petImgEl = shadow.getElementById('pet-img');
  const voiceBubbleEl = shadow.getElementById('voice-bubble');
  const settingsCardEl = shadow.getElementById('settings-card');
  const chatDrawerEl = shadow.getElementById('chat-drawer');
  const openChatBtnEl = shadow.getElementById('open-chat-btn');
  const openHistoryBtnEl = shadow.getElementById('open-history-btn');

  const tabChatBtnEl = shadow.getElementById('tab-chat-btn');
  const tabHistoryBtnEl = shadow.getElementById('tab-history-btn');
  const paneChatEl = shadow.getElementById('pane-chat');
  const paneHistoryEl = shadow.getElementById('pane-history');
  const chatMessagesEl = shadow.getElementById('chat-messages');
  const chatInputEl = shadow.getElementById('chat-input');
  const chatSendBtnEl = shadow.getElementById('chat-send-btn');
  const chatAttachCtxEl = shadow.getElementById('chat-attach-ctx');
  const chatModelTagEl = shadow.getElementById('chat-model-tag');
  const historyListEl = shadow.getElementById('history-list');
  const logCountTagEl = shadow.getElementById('log-count-tag');

  const cfgPetSizeEl = shadow.getElementById('cfg-pet-size');
  const cfgPetSizeValEl = shadow.getElementById('cfg-pet-size-val');
  const cfgBubbleScaleEl = shadow.getElementById('cfg-bubble-scale');
  const cfgBubbleScaleValEl = shadow.getElementById('cfg-bubble-scale-val');
  const cfgVoiceScaleEl = shadow.getElementById('cfg-voice-scale');
  const cfgVoiceScaleValEl = shadow.getElementById('cfg-voice-scale-val');
  const cfgVoiceSecEl = shadow.getElementById('cfg-voice-sec');
  const cfgVoiceSecValEl = shadow.getElementById('cfg-voice-sec-val');

  const cfgEnabledEl = shadow.getElementById('cfg-enabled');
  const cfgUrlEl = shadow.getElementById('cfg-url');
  const cfgKeysEl = shadow.getElementById('cfg-keys');
  const cfgModelEl = shadow.getElementById('cfg-model');
  const keyCountBadgeEl = shadow.getElementById('key-count-badge');
  const testResultEl = shadow.getElementById('test-result');

  function applyLayout() {
    const petSize = clamp(Number(state.petSize) || 138, 64, 240);
    const bubbleScale = clamp(Number(state.bubbleScale) || 100, 65, 140);
    const voiceScale = clamp(Number(state.voiceScale) || 100, 65, 160);
    const voiceDurationSec = clamp(Number(state.voiceDurationSec) || 9, 3, 30);
    const maxRight = Math.max(8, window.innerWidth - petSize - 16);
    const maxBottom = Math.max(0, window.innerHeight - petSize - 16);
    const posRight = clamp(Number(state.posRight ?? 16), 0, maxRight);
    const posBottom = clamp(Number(state.posBottom ?? 0), 0, maxBottom);

    state.petSize = petSize;
    state.bubbleScale = bubbleScale;
    state.voiceScale = voiceScale;
    state.voiceDurationSec = voiceDurationSec;
    state.posRight = Math.round(posRight);
    state.posBottom = Math.round(posBottom);

    petBtnEl.style.width = `${petSize}px`;
    petBtnEl.style.height = `${petSize}px`;
    host.style.right = `${state.posRight}px`;
    host.style.bottom = `${state.posBottom}px`;

    const scaleFactor = bubbleScale / 100;
    bubbleEl.style.transform = state.bubbleVisible
      ? `scale(${scaleFactor})`
      : `translateY(10px) scale(${(scaleFactor * 0.95).toFixed(3)})`;

    const petCenterX = window.innerWidth - state.posRight - petSize / 2;
    const petCenterY = window.innerHeight - state.posBottom - petSize / 2;
    wrapperEl.classList.toggle('flip-x', petCenterX < 400);
    wrapperEl.classList.toggle('flip-y', petCenterY < 450);

    cfgPetSizeEl.value = String(petSize);
    cfgPetSizeValEl.textContent = `${petSize}px`;
    cfgBubbleScaleEl.value = String(bubbleScale);
    cfgBubbleScaleValEl.textContent = `${bubbleScale}%`;
    wrapperEl.style.setProperty('--voice-scale', String(voiceScale / 100));
    cfgVoiceScaleEl.value = String(voiceScale);
    cfgVoiceScaleValEl.textContent = `${voiceScale}%`;
    cfgVoiceSecEl.value = String(voiceDurationSec);
    cfgVoiceSecValEl.textContent = `${voiceDurationSec}s`;
  }

  window.addEventListener('resize', applyLayout);

  cfgPetSizeEl.addEventListener('input', () => {
    state.petSize = Number(cfgPetSizeEl.value);
    applyLayout();
    scheduleSaveLayout();
  });

  cfgBubbleScaleEl.addEventListener('input', () => {
    state.bubbleScale = Number(cfgBubbleScaleEl.value);
    applyLayout();
    scheduleSaveLayout();
  });

  cfgVoiceScaleEl.addEventListener('input', () => {
    state.voiceScale = Number(cfgVoiceScaleEl.value);
    applyLayout();
    scheduleSaveLayout();
    showVoiceLine('对话气泡大小预览喵~', { durationMs: 2800, saveLog: false });
  });

  cfgVoiceSecEl.addEventListener('input', () => {
    state.voiceDurationSec = Number(cfgVoiceSecEl.value);
    applyLayout();
    scheduleSaveLayout();
  });

  shadow.getElementById('cfg-reset-layout').addEventListener('click', () => {
    state.petSize = 138;
    state.bubbleScale = 100;
    state.voiceScale = 100;
    state.voiceDurationSec = 9;
    state.posRight = 16;
    state.posBottom = 0;
    applyLayout();
    saveState();
    showVoiceLine('位置、大小和气泡时长已恢复默认啦喵~', { saveLog: false });
  });

  petBtnEl.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 8 : -8;
      state.petSize = clamp((Number(state.petSize) || 138) + delta, 64, 240);
      applyLayout();
      scheduleSaveLayout();
    },
    { passive: false }
  );

  let dragActive = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOrigRight = 16;
  let dragOrigBottom = 0;

  petBtnEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragActive = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigRight = state.posRight;
    dragOrigBottom = state.posBottom;
    petBtnEl.setPointerCapture(e.pointerId);
  });

  petBtnEl.addEventListener('pointermove', (e) => {
    if (!dragActive) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!dragMoved && Math.hypot(dx, dy) > 5) {
      dragMoved = true;
      petBtnEl.classList.add('dragging');
    }
    if (dragMoved) {
      state.posRight = dragOrigRight - dx;
      state.posBottom = dragOrigBottom - dy;
      applyLayout();
    }
  });

  function finishDrag(e) {
    if (!dragActive) return;
    dragActive = false;
    petBtnEl.classList.remove('dragging');
    try {
      petBtnEl.releasePointerCapture(e.pointerId);
    } catch {}
    if (dragMoved) {
      scheduleSaveLayout();
      setTimeout(() => {
        dragMoved = false;
      }, 60);
    }
  }

  petBtnEl.addEventListener('pointerup', finishDrag);
  petBtnEl.addEventListener('pointercancel', finishDrag);

  function setDrawerTab(tab) {
    activeDrawerTab = tab === 'history' ? 'history' : 'chat';
    tabChatBtnEl.classList.toggle('active', activeDrawerTab === 'chat');
    tabHistoryBtnEl.classList.toggle('active', activeDrawerTab === 'history');
    paneChatEl.classList.toggle('active', activeDrawerTab === 'chat');
    paneHistoryEl.classList.toggle('active', activeDrawerTab === 'history');
    openChatBtnEl.classList.toggle('active', chatDrawerEl.classList.contains('open') && activeDrawerTab === 'chat');
    openHistoryBtnEl.classList.toggle('active', chatDrawerEl.classList.contains('open') && activeDrawerTab === 'history');
    if (activeDrawerTab === 'chat') {
      renderChatHistory();
      setTimeout(() => chatInputEl.focus(), 50);
    } else {
      renderVoiceLogs();
    }
  }

  function openDrawer(tab) {
    const isAlreadyOpen = chatDrawerEl.classList.contains('open');
    if (isAlreadyOpen && activeDrawerTab === tab) {
      chatDrawerEl.classList.remove('open');
      openChatBtnEl.classList.remove('active');
      openHistoryBtnEl.classList.remove('active');
      return;
    }
    settingsCardEl.classList.remove('open');
    fillConfigForm();
    applyLayout();
    chatDrawerEl.classList.add('open');
    setDrawerTab(tab);
  }

  openChatBtnEl.addEventListener('click', () => openDrawer('chat'));
  openHistoryBtnEl.addEventListener('click', () => openDrawer('history'));
  tabChatBtnEl.addEventListener('click', () => setDrawerTab('chat'));
  tabHistoryBtnEl.addEventListener('click', () => setDrawerTab('history'));
  voiceBubbleEl.addEventListener('click', () => openDrawer('history'));

  shadow.getElementById('drawer-close-btn').addEventListener('click', () => {
    chatDrawerEl.classList.remove('open');
    openChatBtnEl.classList.remove('active');
    openHistoryBtnEl.classList.remove('active');
  });

  shadow.getElementById('drawer-cfg-btn').addEventListener('click', () => {
    chatDrawerEl.classList.remove('open');
    openChatBtnEl.classList.remove('active');
    openHistoryBtnEl.classList.remove('active');
    testResultEl.className = 'test-result';
    fillConfigForm();
    applyLayout();
    settingsCardEl.classList.add('open');
  });

  shadow.getElementById('drawer-clear-btn').addEventListener('click', () => {
    if (activeDrawerTab === 'chat') {
      chatHistory = [];
      chrome.storage.local.set({ petChatHistory: [] });
      renderChatHistory();
    } else {
      voiceLogs = [];
      chrome.storage.local.set({ petVoiceLogs: [] });
      renderVoiceLogs();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      openDrawer('chat');
    }
  });

  function renderVoiceLogs() {
    logCountTagEl.textContent = `${voiceLogs.length} 条`;
    if (!voiceLogs.length) {
      historyListEl.innerHTML = `<div class="empty-hint">还没有历史吐槽记录哦~<br>戳一戳桌宠或完成一轮对话后，所有台词都会自动保存在这里。</div>`;
      return;
    }
    historyListEl.innerHTML = voiceLogs
      .map((item) => `
        <div class="log-item">
          <div class="log-meta">
            <span class="log-badge">${escapeHtml(item.source || '互动')}</span>
            <span>${formatClock(item.ts)}</span>
          </div>
          <div class="log-text">${escapeHtml(item.text)}</div>
        </div>
      `)
      .join('');
  }

  function renderChatHistory() {
    if (!chatHistory.length) {
      chatMessagesEl.innerHTML = `<div class="empty-hint">喵呜~ 这里是独立的大模型小聊天窗！<br>直接输入问题即可单独聊天，不影响主页面对话；<br>勾选上方开关也可以附带当前 Gemini 页面内容一起讨论。</div>`;
      return;
    }
    chatMessagesEl.innerHTML = chatHistory
      .map((m) => {
        const cls = m.role === 'user' ? 'user' : 'assistant';
        const meta = m.role === 'assistant' && m.latencyMs ? `<div class="msg-meta">${escapeHtml(m.model || '')} · ${m.latencyMs}ms</div>` : '';
        return `<div class="msg-row ${cls}"><div class="msg-bubble">${formatChatText(m.content)}</div>${meta}</div>`;
      })
      .join('');
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function sendPetChat() {
    if (isChatSending) return;
    const text = chatInputEl.value.trim();
    if (!text) return;

    isChatSending = true;
    chatSendBtnEl.disabled = true;
    chatInputEl.value = '';

    const prevHistory = [...chatHistory];
    chatHistory = [...chatHistory, { role: 'user', content: text, ts: Date.now() }].slice(-40);
    renderChatHistory();

    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'msg-row assistant';
    thinkingEl.innerHTML = `<div class="msg-bubble">⏳ ${escapeHtml(aiConfig.model || '大模型')} 正在思考喵...</div>`;
    chatMessagesEl.appendChild(thinkingEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    updatePetAppearance();

    const ctx = extractLatestTurnContext();
    chrome.runtime.sendMessage(
      {
        type: 'CHAT_WITH_PET',
        payload: {
          message: text,
          history: prevHistory,
          context: ctx,
          attachContext: chatAttachCtxEl.checked
        }
      },
      (res) => {
        isChatSending = false;
        chatSendBtnEl.disabled = false;
        if (chrome.runtime.lastError) {
          chatHistory = [...chatHistory, { role: 'assistant', content: `⚠️ 后台异常: ${chrome.runtime.lastError.message}`, ts: Date.now() }].slice(-40);
        } else if (res && res.ok) {
          chatHistory = [
            ...chatHistory,
            { role: 'assistant', content: res.reply, model: res.model, latencyMs: res.latencyMs, ts: Date.now() }
          ].slice(-40);
          playJellyBounce();
          triggerTempExpression('xd', 2200);
        } else {
          chatHistory = [
            ...chatHistory,
            { role: 'assistant', content: `⚠️ ${res && res.error ? res.error : '请求失败，请检查右键模型设置'}`, ts: Date.now() }
          ].slice(-40);
        }
        chrome.storage.local.set({ petChatHistory: chatHistory });
        renderChatHistory();
        updatePetAppearance();
      }
    );
  }

  chatSendBtnEl.addEventListener('click', sendPetChat);
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPetChat();
    }
  });

  chatAttachCtxEl.addEventListener('change', () => {
    aiConfig.attachContext = chatAttachCtxEl.checked;
    chrome.storage.local.set({ petAiConfig: aiConfig });
  });

  function updateKeyBadge() {
    const n = countKeys(cfgKeysEl.value);
    if (isLocalUrl(cfgUrlEl.value) && n === 0) {
      keyCountBadgeEl.textContent = '本地免 Key';
    } else {
      keyCountBadgeEl.textContent = n > 1 ? `${n} 个 Key (轮询)` : `${n} 个 Key`;
    }
  }

  cfgKeysEl.addEventListener('input', updateKeyBadge);
  cfgUrlEl.addEventListener('input', updateKeyBadge);

  function fillConfigForm() {
    cfgEnabledEl.checked = Boolean(aiConfig.enabled);
    cfgUrlEl.value = aiConfig.apiUrl ? aiConfig.apiUrl : DEFAULT_AI_CONFIG.apiUrl;
    cfgKeysEl.value = aiConfig.apiKeys ? aiConfig.apiKeys : '';
    cfgModelEl.value = aiConfig.model ? aiConfig.model : DEFAULT_AI_CONFIG.model;
    chatAttachCtxEl.checked = Boolean(aiConfig.attachContext);
    chatModelTagEl.textContent = aiConfig.model || DEFAULT_AI_CONFIG.model;
    updateKeyBadge();
  }

  shadow.getElementById('preset-google').addEventListener('click', () => {
    cfgUrlEl.value = PRESETS.google.apiUrl;
    cfgModelEl.value = PRESETS.google.model;
    cfgEnabledEl.checked = true;
    updateKeyBadge();
  });

  shadow.getElementById('preset-deepseek').addEventListener('click', () => {
    cfgUrlEl.value = PRESETS.deepseek.apiUrl;
    cfgModelEl.value = PRESETS.deepseek.model;
    cfgEnabledEl.checked = true;
    updateKeyBadge();
  });

  shadow.getElementById('preset-ollama').addEventListener('click', () => {
    cfgUrlEl.value = PRESETS.ollama.apiUrl;
    cfgModelEl.value = PRESETS.ollama.model;
    cfgEnabledEl.checked = true;
    updateKeyBadge();
  });

  petBtnEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    chatDrawerEl.classList.remove('open');
    openChatBtnEl.classList.remove('active');
    openHistoryBtnEl.classList.remove('active');
    testResultEl.className = 'test-result';
    fillConfigForm();
    applyLayout();
    settingsCardEl.classList.toggle('open');
  });

  shadow.getElementById('cfg-cancel').addEventListener('click', () => {
    settingsCardEl.classList.remove('open');
  });

  shadow.getElementById('cfg-test').addEventListener('click', () => {
    testResultEl.className = 'test-result show';
    testResultEl.textContent = '⏳ 正在向接口发送测试请求...';

    const testUrl = cfgUrlEl.value.trim() ? cfgUrlEl.value.trim() : DEFAULT_AI_CONFIG.apiUrl;
    const testModel = cfgModelEl.value.trim() ? cfgModelEl.value.trim() : DEFAULT_AI_CONFIG.model;

    chrome.runtime.sendMessage(
      {
        type: 'TEST_PET_API',
        payload: {
          apiUrl: testUrl,
          apiKeys: cfgKeysEl.value,
          model: testModel
        }
      },
      (res) => {
        if (chrome.runtime.lastError) {
          testResultEl.className = 'test-result show err';
          testResultEl.textContent = `❌ 扩展后台异常: ${chrome.runtime.lastError.message}`;
          return;
        }
        if (res && res.ok) {
          const tag = res.isLocal ? '本地模型' : `命中 Key #${res.keyIndex}/${res.totalKeys}`;
          testResultEl.className = 'test-result show ok';
          testResultEl.textContent = `✅ 连接成功 (${tag} · ${res.latencyMs}ms) 回复: "${res.reply}"`;
        } else {
          const errMsg = res && res.error ? res.error : '未知错误';
          testResultEl.className = 'test-result show err';
          testResultEl.textContent = `❌ 连接失败: ${errMsg}`;
        }
      }
    );
  });

  shadow.getElementById('cfg-save').addEventListener('click', () => {
    const savedUrl = cfgUrlEl.value.trim() ? cfgUrlEl.value.trim() : DEFAULT_AI_CONFIG.apiUrl;
    const savedModel = cfgModelEl.value.trim() ? cfgModelEl.value.trim() : DEFAULT_AI_CONFIG.model;
    aiConfig = {
      ...aiConfig,
      enabled: cfgEnabledEl.checked,
      apiUrl: savedUrl,
      apiKeys: cfgKeysEl.value.trim(),
      model: savedModel
    };
    chrome.storage.local.set({ petAiConfig: aiConfig }, () => {
      fillConfigForm();
      settingsCardEl.classList.remove('open');
      playJellyBounce();
      triggerTempExpression('xd', 2200);
      const n = countKeys(aiConfig.apiKeys);
      const label = isLocalUrl(aiConfig.apiUrl) ? `本地模型 ${aiConfig.model}` : `${n}个Key轮询中`;
      showVoiceLine(
        aiConfig.enabled ? `AI 大脑已就绪 (${label})喵！` : '已切换回本地卖萌词库~',
        { saveLog: false }
      );
    });
  });

  function scheduleVoiceHide(ms) {
    clearTimeout(voiceHideTimer);
    voiceHideTimer = setTimeout(() => {
      if (!voiceHovered) {
        voiceBubbleEl.classList.remove('show');
      }
    }, ms);
  }

  voiceBubbleEl.addEventListener('mouseenter', () => {
    voiceHovered = true;
    clearTimeout(voiceHideTimer);
  });

  voiceBubbleEl.addEventListener('mouseleave', () => {
    voiceHovered = false;
    scheduleVoiceHide(2500);
  });

  function showVoiceLine(customText, opts = {}) {
    const defaultMs = clamp(Number(state.voiceDurationSec) || 9, 3, 30) * 1000;
    const durationMs = typeof opts === 'number' ? opts : (opts.durationMs || defaultMs);
    const saveLog = typeof opts === 'object' ? opts.saveLog !== false : true;
    const source = typeof opts === 'object' && opts.source ? opts.source : '互动';

    const remainPct = Math.round(state.exactFiveHourPct);
    const dynamicLines = [
      ...CUTE_LINES,
      `现在还剩 ${remainPct}% 额度呢，能量满满喵！`
    ];
    const line = customText ? customText : dynamicLines[Math.floor(Math.random() * dynamicLines.length)];
    voiceBubbleEl.textContent = line;
    voiceBubbleEl.classList.add('show');
    if (saveLog) {
      recordVoiceLog(line, source);
    }
    scheduleVoiceHide(durationMs);
  }

  function triggerTempExpression(spriteKey, durationMs = 2600) {
    tempSprite = spriteKey;
    updatePetAppearance();
    clearTimeout(tempSpriteTimer);
    tempSpriteTimer = setTimeout(() => {
      tempSprite = null;
      updatePetAppearance();
    }, durationMs);
  }

  function playJellyBounce() {
    petBtnEl.classList.remove('jelly');
    void petBtnEl.offsetWidth;
    petBtnEl.classList.add('jelly');
  }

  let clickDelayTimer = null;
  petBtnEl.addEventListener('click', () => {
    if (dragMoved) return;
    clearTimeout(clickDelayTimer);
    clickDelayTimer = setTimeout(() => {
      playJellyBounce();
      const nextExpr = Math.random() < 0.65 ? 'xd' : 'grin';
      triggerTempExpression(nextExpr, 2400);

      const now = Date.now();
      const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
      const canTriggerClickAi = aiConfig.enabled && hasKeysOrLocal && (now - lastClickAiTime > 5000);

      if (canTriggerClickAi) {
        lastClickAiTime = now;
        showVoiceLine('喵呜？让我想想…', { durationMs: 4000, saveLog: false });
        triggerAiPetReaction('click');
      } else {
        showVoiceLine(null, { source: '戳一戳' });
      }
    }, 180);
  });

  petBtnEl.addEventListener('dblclick', () => {
    if (dragMoved) return;
    clearTimeout(clickDelayTimer);
    state.bubbleVisible = !state.bubbleVisible;
    bubbleEl.classList.toggle('hidden', !state.bubbleVisible);
    applyLayout();
    saveState();
    playJellyBounce();
    showVoiceLine(state.bubbleVisible ? '额度面板展开啦~' : '额度面板先藏起来咯！', { saveLog: false });
  });

  shadow.getElementById('oval-card').addEventListener('click', () => {
    triggerSilentSync(true);
    triggerTempExpression('grin', 1600);
    showVoiceLine('正在帮主人核对最新额度喵…', { saveLog: false });
  });

  function isAiStreaming() {
    return Boolean(isChatSending || document.querySelector('[aria-label*="Stop"], [aria-label*="停止"], .stop-icon'));
  }

  function updatePetAppearance() {
    const streaming = isAiStreaming();
    petBtnEl.classList.toggle('eating', streaming && !tempSprite);

    let targetKey = 'idle';
    if (tempSprite && SPRITES[tempSprite]) {
      targetKey = tempSprite;
    } else if (streaming) {
      targetKey = 'eat';
    }

    const targetUrl = SPRITES[targetKey];
    if (petImgEl.src !== targetUrl) {
      petImgEl.src = targetUrl;
    }
  }

  function extractLatestTurnContext() {
    const userNodes = document.querySelectorAll('user-query, .user-query-container, [data-test-id="user-query"]');
    const aiNodes = document.querySelectorAll('model-response, .model-response-container, message-content');
    const lastUser = userNodes.length > 0 ? userNodes[userNodes.length - 1].innerText.trim() : '';
    const lastAi = aiNodes.length > 0 ? aiNodes[aiNodes.length - 1].innerText.trim() : '';
    return { userText: lastUser, aiText: lastAi };
  }

  function triggerAiPetReaction(triggerType = 'reply_done') {
    const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
    const isReady = Boolean(aiConfig.enabled && aiConfig.apiUrl && hasKeysOrLocal);

    if (!isReady) {
      if (triggerType === 'reply_done') {
        triggerTempExpression('xd', 2000);
        showVoiceLine('回答生成完毕喵~', { source: '回复围观' });
      }
      return;
    }

    const { userText, aiText } = extractLatestTurnContext();
    if (triggerType !== 'click' && !userText && !aiText) return;

    chrome.runtime.sendMessage(
      {
        type: 'GENERATE_PET_COMMENT',
        payload: {
          userText,
          aiText,
          remainPct: Math.round(state.exactFiveHourPct),
          triggerType
        }
      },
      (res) => {
        const srcLabel = triggerType === 'click' ? 'AI 戳一戳' : 'AI 围观吐槽';
        if (res && res.ok && res.text) {
          playJellyBounce();
          const nextMood = res.mood ? res.mood : 'xd';
          triggerTempExpression(nextMood, 4200);
          showVoiceLine(res.text, { source: srcLabel });
        } else if (res && res.error) {
          showVoiceLine(`⚠️ ${res.error}`, { durationMs: 5000, saveLog: false });
        } else if (triggerType === 'reply_done') {
          triggerTempExpression('xd', 2000);
          showVoiceLine('回答生成完毕喵~', { source: '回复围观' });
        }
      }
    );
  }

  function estimateContextTokens() {
    if (location.pathname.startsWith('/usage')) return 0;
    const mainEl = document.querySelector('main') ? document.querySelector('main') : document.body;
    const raw = mainEl.innerText ? mainEl.innerText : '';
    return Math.round(raw.length / 1.8);
  }

  function renderUI() {
    bubbleEl.classList.toggle('hidden', !state.bubbleVisible);
    applyLayout();

    const remainPct = Math.round(state.exactFiveHourPct);
    pctEl.textContent = `剩 ${remainPct}%`;
    pctEl.className = 'big-pct' + (remainPct <= 20 ? ' danger' : remainPct <= 50 ? ' warn' : '');

    const modelBtn = document.querySelector('[data-test-id="bard-mode-menu-button"]');
    if (modelBtn && modelBtn.innerText.trim()) {
      titleEl.textContent = `${modelBtn.innerText.trim()} 5h 额度`;
    }

    const countdown = state.resetCountdownStr ? state.resetCountdownStr : '待同步';
    resetLineEl.innerHTML = `周剩 ${Number(state.weeklyRemainPct).toFixed(1)}% · ${countdown}<span class="underline">重置</span>`;

    const ctxTokens = estimateContextTokens();
    const ctxPct = ((ctxTokens / state.contextMaxTokens) * 100).toFixed(1);
    const ctxK = (ctxTokens / 1000).toFixed(1);
    const maxK = Math.round(state.contextMaxTokens / 1000);
    const totalM = (state.totalSessionTokens / 1000000).toFixed(2);
    ctxLineEl.innerHTML = `上下文 ${ctxPct}% (${ctxK}K/${maxK}K) · 已用<br>${totalM}M tok`;

    if (isSyncing) {
      syncStatusEl.textContent = '无感校准中...';
    } else if (state.lastSyncAt) {
      const t = new Date(state.lastSyncAt);
      const sec = String(t.getSeconds()).padStart(2, '0');
      syncStatusEl.textContent = `已校准 (${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${sec}) · 点击刷新`;
    }

    updatePetAppearance();
  }

  function getResponseCount() {
    return document.querySelectorAll('model-response, .model-response-container, message-content').length;
  }

  let syncedResponseCount = -1;
  let lastTurnTokens = 0;

  setInterval(() => {
    updatePetAppearance();
  }, 500);

  setInterval(() => {
    const currentCtx = estimateContextTokens();
    if (currentCtx > lastTurnTokens + 50) {
      state.totalSessionTokens += (currentCtx - lastTurnTokens);
      lastTurnTokens = currentCtx;
      saveState();
    } else if (currentCtx < lastTurnTokens) {
      lastTurnTokens = currentCtx;
    }

    const curResponses = getResponseCount();
    if (syncedResponseCount === -1) {
      syncedResponseCount = curResponses;
    } else if (curResponses > syncedResponseCount && !isAiStreaming()) {
      syncedResponseCount = curResponses;
      triggerAiPetReaction('reply_done');
      setTimeout(() => triggerSilentSync(false), 1500);
    } else if (curResponses < syncedResponseCount) {
      syncedResponseCount = curResponses;
    }

    renderUI();
  }, 2000);
})();
