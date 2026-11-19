(() => {
  const isIframe = window.self !== window.top;
  const isGeminiSite = location.hostname === 'gemini.google.com';

  function parseAndSyncUsageText(rawText) {
    if (!rawText || rawText.length < 20) return false;

    const cnMatches = [...rawText.matchAll(/已使用\s*(\d{1,3}(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1]));
    const enMatches = [...rawText.matchAll(/Used\s*(\d{1,3}(?:\.\d+)?)\s*%/gi)].map((m) => parseFloat(m[1]));
    const usedMatches = cnMatches.length > 0 ? cnMatches : enMatches;
    if (usedMatches.length === 0) return false;

    const curRemain = Math.max(0, Math.min(100, 100 - usedMatches[0]));
    const weeklyRemain = usedMatches.length > 1 ? Math.max(0, Math.min(100, 100 - usedMatches[1])) : 100;

    let resetCountdownStr = '';
    const resetTimeMatch = rawText.match(/重置时间[：:]\s*(\d{1,2}):(\d{2})/);
    if (resetTimeMatch) {
      const targetH = parseInt(resetTimeMatch[1], 10);
      const targetM = parseInt(resetTimeMatch[2], 10);
      const now = new Date();
      const target = new Date(now);
      target.setHours(targetH, targetM, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      const diffMin = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
      resetCountdownStr = `${Math.floor(diffMin / 60)}h${String(diffMin % 60).padStart(2, '0')}m`;
    }

    chrome.storage.local.get(['geminiPetState'], (res) => {
      const cur = res.geminiPetState || {};
      const updated = {
        ...cur,
        exactFiveHourPct: curRemain,
        weeklyRemainPct: weeklyRemain,
        resetCountdownStr: resetCountdownStr || cur.resetCountdownStr || '',
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

  if (isGeminiSite && location.pathname.startsWith('/usage')) {
    let tries = 0;
    const usageTimer = setInterval(() => {
      tries++;
      if (parseAndSyncUsageText(document.body.innerText) || tries > 25) {
        clearInterval(usageTimer);
      }
    }, 400);
    if (isIframe) return;
  } else if (isIframe) {
    return;
  }

  if (!/^https?:$/i.test(location.protocol)) return;
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

  const DEFAULT_TRAITS = [
    { id: 'cute', name: '可爱', desc: '软萌元气、活泼粘人，喜欢用“喵~”“嘿嘿”等可爱语气词。' },
    { id: 'tsundere', name: '傲娇', desc: '嘴硬心软、口是心非，常说“才不是为了你呢”“哼”，但内心其实很在意主人。' },
    { id: 'yandere_smart', name: '腹黑', desc: '表面温柔礼貌、笑眯眯的，实则话里带刺、喜欢不动声色地调侃捉弄人。' },
    { id: 'sharp', name: '毒舌', desc: '嘴上毫不留情、吐槽犀利直接、一针见血，绝不客套。' },
    { id: 'aloof', name: '冷漠', desc: '高冷寡言、惜字如金、语气平淡疏离，不带多余情绪。' },
    { id: 'mesugaki', name: '雌小鬼', desc: '嚣张得意、古灵精怪爱挑衅，高频使用“杂鱼~”“杂鱼杂鱼~”“哈？”等二次元嘲讽梗。' }
  ];

  const DEFAULT_BEHAVIORS = [
    { id: 'curious', name: '好奇', desc: '对屏幕内容和主人的想法充满好奇，爱追问细节或开脑洞。' },
    { id: 'caring', name: '关心', desc: '嘴上严格按性格来，但落脚点始终惦记着主人的休息与情绪（反差感拉满）。' },
    { id: 'indifferent', name: '冷漠', desc: '态度敷衍摆烂、爱搭不理，常让主人自己想办法解决。' },
    { id: 'encourage', name: '鼓励', desc: '顺着性格基调给主人打气、夸奖或用激将法推着主人往前走。' },
    { id: 'slacking', name: '摸鱼', desc: '懒洋洋爱偷懒，老想劝主人一起摸鱼、吃零食或看热闹。' },
    { id: 'mentor', name: '认真辅导', desc: '保持人设口吻的同时，给出的解释和建议都很靠谱、直击重点。' }
  ];

  const FEED_ITEMS = [
    { id: 'fish', icon: '🐟', name: '小鱼干', delta: 6, note: '香喷喷的酥脆小鱼干', desc: '好感 +6' },
    { id: 'pudding', icon: '🍮', name: '焦糖布丁', delta: 10, note: '入口即化的甜美布丁', desc: '好感 +10' },
    { id: 'lemon', icon: '🍋', name: '超酸柠檬', delta: -5, note: '酸到让人五官皱成一团的生柠檬', desc: '好感 -5' },
    { id: 'bitter', icon: '🥦', name: '苦瓜汁', delta: -8, note: '暗黑料理浓缩小苦瓜汁', desc: '好感 -8' },
    { id: 'yogurt', icon: '🥛', name: '主人的酸奶', special: 'yogurt', threshold: 50, lowDelta: -10, highDelta: 12, note: '主人亲手递来的特制浓稠酸奶', desc: '好感<50减10 / ≥50加12' }
  ];

  const DEFAULT_STATE = {
    modelTitle: 'Gemini 4 Pro 5h 额度',
    exactFiveHourPct: 100,
    weeklyRemainPct: 100.0,
    resetCountdownStr: '',
    contextMaxTokens: 1000000,
    totalSessionTokens: 0,
    lastSyncAt: 0,
    bubbleVisible: true,
    petSize: 132,
    bubbleScale: 100,
    voiceScale: 100,
    voiceDurationSec: 9,
    posRight: 16,
    posBottom: 0,
    globalMode: true,
    autoPageComment: true,
    hiddenHosts: []
  };

  const DEFAULT_AI_CONFIG = {
    enabled: false,
    apiUrl: PRESETS.google.apiUrl,
    apiKeys: '',
    model: PRESETS.google.model,
    attachContext: true
  };

  const DEFAULT_PERSONA_CONFIG = {
    activeTraitId: 'cute',
    activeBehaviorId: 'curious',
    customNote: '',
    randomMoodEnabled: false,
    randomMoodIntervalMin: 30,
    lastMoodSwitchAt: 0,
    traits: DEFAULT_TRAITS,
    behaviors: DEFAULT_BEHAVIORS
  };

  let state = { ...DEFAULT_STATE };
  let aiConfig = { ...DEFAULT_AI_CONFIG };
  let personaConfig = {
    ...DEFAULT_PERSONA_CONFIG,
    traits: DEFAULT_TRAITS.map((t) => ({ ...t })),
    behaviors: DEFAULT_BEHAVIORS.map((b) => ({ ...b }))
  };
  let affection = 15;
  let voiceLogs = [];
  let chatHistory = [];
  let isSyncing = false;
  let isChatSending = false;
  let lastTriggerTime = 0;
  let lastClickAiTime = 0;
  let lastAffectionTickAt = 0;
  let syncTimeoutGuard = null;
  let saveLayoutTimer = null;
  let voiceHovered = false;
  let activeDrawerTab = 'chat';
  let pageAutoReacted = false;

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

  function getAffectionInfo(val) {
    const s = clamp(Number(val) || 0, -100, 100);
    if (s <= -70) return { label: '憎恨', color: '#991b1b', emoji: '💢' };
    if (s <= -40) return { label: '仇视', color: '#dc2626', emoji: '😠' };
    if (s <= -15) return { label: '戒备', color: '#ea580c', emoji: '😒' };
    if (s < 0) return { label: '远离', color: '#d97706', emoji: '🙄' };
    if (s < 20) return { label: '陌生', color: '#64748b', emoji: '🐾' };
    if (s < 40) return { label: '熟络', color: '#0284c7', emoji: '✨' };
    if (s < 65) return { label: '亲近', color: '#10b981', emoji: '💛' };
    if (s < 85) return { label: '偏爱', color: '#ec4899', emoji: '💗' };
    return { label: '满级羁绊', color: '#db2777', emoji: '💖' };
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
    '喵呜~ 按住我可以随便拖到页面任何地方哦！',
    '点「🎭 性格」可以投喂小鱼干、主人的酸奶，还能开启随机心情~',
    '点「💬 对话」可以随时开一个独立小窗单独聊天喵！',
    '错过刚才我说的话？点「📜 记录」随时翻看历史吐槽~'
  ];

  let tempSprite = null;
  let tempSpriteTimer = null;
  let voiceHideTimer = null;

  function countKeys(raw) {
    if (!raw) return 0;
    return String(raw).split(/[\r\n,，;；]+/).map((s) => s.trim()).filter(Boolean).length;
  }

  function extractCurrentPageInfo() {
    const title = (document.title || '').trim();
    const container = document.querySelector('article, main, [role="main"]') || document.body;
    let raw = '';
    if (container) {
      // 跳过密码框和输入框内容，仅提取可见页面正文
      raw = (container.innerText || '').replace(/\s+/g, ' ').trim();
    }
    return {
      title: title.slice(0, 100),
      url: location.hostname,
      snippet: raw.slice(0, 320)
    };
  }

  function shouldRenderOnThisPage() {
    const hiddenHosts = Array.isArray(state.hiddenHosts) ? state.hiddenHosts : [];
    if (hiddenHosts.includes(location.hostname)) return false;
    if (!isGeminiSite && !state.globalMode) return false;
    return true;
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

  const host = document.createElement('div');
  host.id = 'gemini-pet-observer-host';
  host.style.cssText = 'position:fixed;bottom:0;right:16px;z-index:2147483647;pointer-events:none;font-family:"PingFang SC","Microsoft YaHei",sans-serif;display:none;';
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
      .bubble-container.hidden { opacity: 0; pointer-events: none; display: none; }
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
        position: absolute; right: calc(100% + 10px); bottom: 28px;
        width: max-content; max-width: 245px; min-width: 72px;
        background: #ffffff; color: #202a5c; border: 2.5px solid #202a5c;
        border-radius: 14px; padding: 8px 13px; font-size: 12.5px; font-weight: 700;
        line-height: 1.45; white-space: normal; word-break: break-word;
        box-shadow: 0 4px 14px rgba(32, 42, 92, 0.2);
        opacity: 0; transform-origin: right center;
        transform: translateX(8px) scale(calc(var(--voice-scale, 1) * 0.92));
        pointer-events: none; transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 8; cursor: pointer;
      }
      .voice-bubble::after {
        content: ''; position: absolute; right: -7px; bottom: 14px;
        width: 10px; height: 10px; background: #ffffff;
        border-right: 2.5px solid #202a5c; border-top: 2.5px solid #202a5c; transform: rotate(45deg);
      }
      .voice-bubble.show { opacity: 1; pointer-events: auto; transform: translateX(0) scale(var(--voice-scale, 1)); }
      .wrapper.flip-x .voice-bubble { right: auto; left: calc(100% + 10px); transform-origin: left center; }
      .wrapper.flip-x .voice-bubble::after {
        right: auto; left: -7px; border-right: none; border-top: none;
        border-left: 2.5px solid #202a5c; border-bottom: 2.5px solid #202a5c;
      }

      .chat-drawer {
        position: absolute; right: calc(100% + 10px); bottom: 10px;
        width: 360px; height: 440px; background: #ffffff; color: #1f2937;
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
        flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc;
      }
      .msg-row { display: flex; flex-direction: column; max-width: 88%; }
      .msg-row.user { align-self: flex-end; align-items: flex-end; }
      .msg-row.assistant { align-self: flex-start; align-items: flex-start; }
      .msg-bubble { padding: 8px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; word-break: break-word; }
      .msg-row.user .msg-bubble { background: #202a5c; color: #ffffff; border-bottom-right-radius: 3px; }
      .msg-row.assistant .msg-bubble { background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1; border-bottom-left-radius: 3px; }
      .msg-bubble code { background: rgba(15, 23, 42, 0.08); padding: 1px 4px; border-radius: 4px; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
      .msg-meta { font-size: 10px; color: #94a3b8; margin-top: 2px; }
      .empty-hint { margin: auto; text-align: center; color: #64748b; font-size: 12px; line-height: 1.65; padding: 16px; }
      .chat-input-area { display: flex; gap: 6px; padding: 8px 10px; background: #ffffff; border-top: 1px solid #e2e8f0; }
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
      .log-item { background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
      .log-meta { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #64748b; font-weight: 600; }
      .log-badge { background: #eef2ff; color: #202a5c; padding: 1px 6px; border-radius: 99px; font-size: 10px; font-weight: 700; }
      .log-text { font-size: 12.5px; color: #1e293b; line-height: 1.45; word-break: break-word; }

      /* 性格 × 行为 + 好感度 + 投喂 + 随机心情 面板 */
      .persona-card {
        position: absolute; right: calc(100% + 10px); bottom: 10px; width: 356px;
        max-height: 84vh; overflow-y: auto; background: #ffffff; color: #1f2937;
        border: 3px solid #202a5c; border-radius: 16px; padding: 12px 14px;
        box-shadow: 0 14px 36px rgba(15, 23, 42, 0.28);
        pointer-events: auto; display: none; flex-direction: column; gap: 9px;
        font-size: 12px; z-index: 28; user-select: text;
      }
      .persona-card.open { display: flex; }
      .wrapper.flip-x .persona-card { right: auto; left: calc(100% + 10px); }
      .wrapper.flip-y .persona-card { bottom: auto; top: 8px; }
      .persona-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #202a5c; font-size: 13px; }
      .persona-active-pill {
        background: #eef2ff; color: #202a5c; border: 1.5px solid #c7d2fe;
        border-radius: 99px; padding: 2px 9px; font-size: 11px; font-weight: 800;
      }
      .persona-group {
        background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px;
        padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
      }
      .persona-group-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 800; color: #202a5c; }
      .aff-bar-wrap { display: flex; align-items: center; gap: 8px; }
      .aff-stage-pill { font-size: 11px; font-weight: 800; color: #ffffff; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
      .feed-grid { display: flex; flex-wrap: wrap; gap: 5px; }
      .feed-btn {
        background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1; border-radius: 8px;
        padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.14s;
      }
      .feed-btn:hover { background: #fef3c7; border-color: #f59e0b; transform: translateY(-1px); }
      .feed-btn.special { border-color: #f472b6; background: #fdf2f8; color: #9d174d; }
      .feed-btn.special:hover { background: #fce7f3; }
      .mood-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; font-weight: 700; color: #202a5c; }
      .mood-row select {
        border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 2px 6px; font-size: 11px; background: #ffffff; color: #111827;
      }
      .chip-wrap { display: flex; flex-wrap: wrap; gap: 5px; }
      .persona-chip {
        display: inline-flex; align-items: center; gap: 4px;
        background: #ffffff; color: #334155; border: 1.5px solid #cbd5e1;
        border-radius: 999px; padding: 3px 9px; font-size: 11.5px; font-weight: 700;
        cursor: pointer; transition: all 0.14s ease;
      }
      .persona-chip:hover { border-color: #202a5c; background: #eef2ff; }
      .persona-chip.active { background: #202a5c; color: #ffffff; border-color: #202a5c; }
      .chip-del { font-size: 10px; opacity: 0.7; padding: 0 2px; border-radius: 50%; }
      .chip-del:hover { opacity: 1; background: rgba(239,68,68,0.22); }
      .persona-desc { font-size: 11px; color: #475569; line-height: 1.45; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 7px; padding: 5px 8px; }
      .add-form { display: none; flex-direction: column; gap: 5px; margin-top: 2px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
      .add-form.open { display: flex; }
      .add-form input, .persona-note {
        border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 5px 8px;
        font-size: 11.5px; outline: none; color: #111827; background: #ffffff; font-family: inherit;
      }
      .persona-note { resize: vertical; min-height: 42px; width: 100%; }
      .add-form-btns { display: flex; justify-content: flex-end; gap: 5px; }

      .settings-card {
        position: absolute; right: calc(100% + 10px); bottom: 12px; width: 328px;
        max-height: 84vh; overflow-y: auto; background: #ffffff; color: #1f2937;
        border: 3px solid #202a5c; border-radius: 14px; padding: 12px 14px;
        box-shadow: 0 10px 28px rgba(32, 42, 92, 0.28);
        pointer-events: auto; display: none; flex-direction: column; gap: 8px;
        font-size: 12px; z-index: 30; user-select: text;
      }
      .settings-card.open { display: flex; }
      .wrapper.flip-x .settings-card { right: auto; left: calc(100% + 10px); }
      .wrapper.flip-y .settings-card { bottom: auto; top: 8px; }
      .settings-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #202a5c; font-size: 13px; }
      .layout-box { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
      .layout-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 800; color: #202a5c; }
      .btn-mini {
        background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1; border-radius: 6px;
        padding: 2px 7px; font-size: 10.5px; font-weight: 700; cursor: pointer;
      }
      .btn-mini:hover { background: #e2e8f0; }
      .slider-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #475569; }
      .slider-row input[type="range"] { flex: 1; accent-color: #202a5c; cursor: pointer; }
      .slider-row span.val { min-width: 46px; text-align: right; font-weight: 800; color: #202a5c; font-family: ui-monospace, Consolas, monospace; }

      .preset-row { display: flex; gap: 5px; }
      .preset-btn {
        flex: 1; background: #eef2ff; color: #202a5c; border: 1.5px solid #c7d2fe;
        border-radius: 6px; padding: 4px 5px; font-size: 10.5px; font-weight: 700; cursor: pointer;
      }
      .preset-btn.local { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
      .settings-row { display: flex; flex-direction: column; gap: 3px; }
      .label-line { display: flex; justify-content: space-between; align-items: center; }
      .settings-row label { font-weight: 600; color: #4b5563; font-size: 11.5px; }
      .key-badge { font-size: 10.5px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 99px; }
      .settings-row input[type="text"], .settings-row textarea {
        border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 5px 8px;
        font-size: 11.5px; outline: none; color: #111827; background: #f8fafc;
        font-family: ui-monospace, Consolas, monospace;
      }
      .settings-row textarea { resize: vertical; min-height: 46px; line-height: 1.35; }
      .switch-line { display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: #202a5c; font-size: 11.5px; }
      .test-result { font-size: 11px; line-height: 1.35; padding: 6px 8px; border-radius: 6px; background: #f1f5f9; color: #334155; display: none; word-break: break-all; }
      .test-result.show { display: block; }
      .test-result.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
      .test-result.err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
      .btn-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 2px; }
      .btn-test { background: #eff6ff; color: #1d4ed8; border: 1.5px solid #93c5fd; border-radius: 6px; padding: 4px 10px; font-weight: 700; cursor: pointer; font-size: 11.5px; }
      .btn-save { background: #202a5c; color: #fff; border: none; border-radius: 6px; padding: 5px 12px; font-weight: 700; cursor: pointer; font-size: 12px; }
      .btn-cancel { background: #e2e8f0; color: #334155; border: none; border-radius: 6px; padding: 5px 10px; font-weight: 600; cursor: pointer; font-size: 12px; }


      /* 独立动态好感度圆形徽章按钮 */
      .aff-orb-btn {
        width: 44px; height: 44px; border-radius: 50%;
        border: 2.5px solid #202a5c; color: #ffffff;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer; pointer-events: auto;
        box-shadow: 0 4px 12px rgba(32, 42, 92, 0.24);
        transition: transform 0.16s ease, box-shadow 0.2s ease, border-radius 0.25s ease, background 0.25s ease;
        line-height: 1; padding: 0; align-self: center;
      }
      .aff-orb-btn:hover { transform: scale(1.08); }
      .aff-orb-btn .orb-emoji { font-size: 14px; line-height: 1.05; }
      .aff-orb-btn .orb-num { font-size: 10px; font-weight: 900; font-family: ui-monospace, Consolas, monospace; margin-top: 1px; }
      .aff-orb-btn.tier-hate { border-radius: 10px; border-color: #450a0a; box-shadow: 0 0 12px rgba(153, 27, 27, 0.55); }
      .aff-orb-btn.tier-love { box-shadow: 0 0 14px rgba(236, 72, 153, 0.65); animation: orbHeartbeat 1.8s ease-in-out infinite; }
      @keyframes orbHeartbeat {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.09); }
      }

      /* 独立迷你投喂栏（位于桌宠正上方，完全不遮挡左侧对话气泡） */
      .feed-dock {
        position: absolute; right: 0; bottom: calc(100% + 8px);
        background: #ffffff; color: #1f2937;
        border: 2.5px solid #202a5c; border-radius: 14px;
        padding: 8px 10px; width: 248px;
        box-shadow: 0 10px 26px rgba(32, 42, 92, 0.24);
        pointer-events: auto; display: none; flex-direction: column; gap: 6px;
        z-index: 29;
      }
      .feed-dock.open { display: flex; }
      .wrapper.flip-y .feed-dock { bottom: auto; top: calc(100% + 8px); }
      .dock-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 800; color: #202a5c; }

      /* 独立迷你好感度调节条（位于桌宠正上方，完全不遮挡左侧对话气泡） */
      .aff-popover {
        position: absolute; right: 0; bottom: calc(100% + 8px);
        background: #ffffff; color: #1f2937;
        border: 2.5px solid #202a5c; border-radius: 14px;
        padding: 9px 11px; width: 256px;
        box-shadow: 0 10px 26px rgba(32, 42, 92, 0.24);
        pointer-events: auto; display: none; flex-direction: column; gap: 6px;
        z-index: 29;
      }
      .aff-popover.open { display: flex; }
      .wrapper.flip-y .aff-popover { bottom: auto; top: calc(100% + 8px); }
      .aff-ticks { display: flex; justify-content: space-between; font-size: 9.5px; color: #64748b; font-weight: 700; }

      .pet-box {
        width: 132px; height: 132px; pointer-events: auto; cursor: grab;
        display: flex; align-items: flex-end; justify-content: center; transform-origin: bottom center; touch-action: none;
      }
      .pet-box.dragging { cursor: grabbing; }
      .pet-box img {
        width: 100%; height: 100%; object-fit: contain; pointer-events: none;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.16));
        transform-origin: bottom center; animation: idleBreath 3.2s ease-in-out infinite;
      }
      .pet-box.eating img { animation: eatingMunch 0.55s ease-in-out infinite; }
      .pet-box.jelly img { animation: jellyBounce 0.65s cubic-bezier(0.28, 0.84, 0.42, 1) forwards !important; }
      @keyframes idleBreath { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, 0.985); } }
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
                <input type="checkbox" id="chat-attach-ctx" checked />
                <span>附带当前网页/对话内容</span>
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
              <span>保存最近 40 条桌宠互动与冲浪吐槽</span>
              <span id="log-count-tag">0 条</span>
            </div>
            <div class="history-list" id="history-list"></div>
          </div>
        </div>

        <div class="persona-card" id="persona-card">
          <div class="persona-head">
            <span>🎭 人设工坊 & 养成</span>
            <span class="persona-active-pill" id="persona-active-pill">可爱 × 好奇</span>
          </div>

          <div class="persona-group">
            <div class="mood-row">
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;">
                <input type="checkbox" id="cfg-random-mood" />
                <span>🎲 随机心情（自动切换性格×行为）</span>
              </label>
              <select id="cfg-random-interval">
                <option value="15">每 15 分钟</option>
                <option value="30" selected>每 30 分钟</option>
                <option value="60">每 1 小时</option>
                <option value="0">每次新网页</option>
              </select>
            </div>
          </div>

          <div class="persona-group">
            <div class="persona-group-head">
              <span>① 性格底色</span>
              <button class="btn-mini" id="toggle-add-trait" type="button">+ 新增性格</button>
            </div>
            <div class="chip-wrap" id="trait-chips"></div>
            <div class="persona-desc" id="trait-desc"></div>
            <div class="add-form" id="add-trait-form">
              <input type="text" id="new-trait-name" placeholder="性格名称（如：病娇、中二、天然呆）" maxlength="12" />
              <input type="text" id="new-trait-desc" placeholder="简短描述这个性格的说话风格与口癖..." />
              <div class="add-form-btns">
                <button class="btn-cancel" id="cancel-add-trait" type="button">取消</button>
                <button class="btn-save" id="confirm-add-trait" type="button">添加性格</button>
              </div>
            </div>
          </div>

          <div class="persona-group">
            <div class="persona-group-head">
              <span>② 行为倾向</span>
              <button class="btn-mini" id="toggle-add-behavior" type="button">+ 新增行为</button>
            </div>
            <div class="chip-wrap" id="behavior-chips"></div>
            <div class="persona-desc" id="behavior-desc"></div>
            <div class="add-form" id="add-behavior-form">
              <input type="text" id="new-behavior-name" placeholder="行为名称（如：撒娇、严厉督促、吃醋）" maxlength="12" />
              <input type="text" id="new-behavior-desc" placeholder="简短描述这个行为倾向的表现方式..." />
              <div class="add-form-btns">
                <button class="btn-cancel" id="cancel-add-behavior" type="button">取消</button>
                <button class="btn-save" id="confirm-add-behavior" type="button">添加行为</button>
              </div>
            </div>
          </div>

          <div class="settings-row">
            <label>③ 补充口癖 / 自定义要求（可选）</label>
            <textarea class="persona-note" id="persona-custom-note" placeholder="例如：句尾偶尔加 ♥，或者称呼我为前辈~"></textarea>
          </div>

          <div class="btn-row">
            <button class="btn-mini" id="persona-reset-btn" type="button">恢复默认</button>
            <div style="display:flex;gap:6px;">
              <button class="btn-cancel" id="persona-close-btn" type="button">关闭</button>
              <button class="btn-save" id="persona-save-btn" type="button">应用人设</button>
            </div>
          </div>
        </div>

        <div class="settings-card" id="settings-card">
          <div class="settings-head">
            <span>🐾 全网陪伴与 AI 配置</span>
          </div>

          <div class="layout-box">
            <div class="layout-head">
              <span>🌐 冲浪陪伴设置</span>
              <button class="btn-mini" id="cfg-hide-host" type="button">屏蔽当前网站</button>
            </div>
            <div class="switch-line">
              <span>在所有网页显示桌宠</span>
              <input type="checkbox" id="cfg-global-mode" checked />
            </div>
            <div class="switch-line">
              <span>打开新网页自动吐槽（10s 全局节流）</span>
              <input type="checkbox" id="cfg-auto-page" checked />
            </div>
          </div>

          <div class="layout-box">
            <div class="layout-head">
              <span>📐 大小、位置与气泡时长</span>
              <button class="btn-mini" id="cfg-reset-layout" type="button">重置默认</button>
            </div>
            <div class="slider-row">
              <span>宠物大小</span>
              <input type="range" id="cfg-pet-size" min="64" max="240" step="2" value="132" />
              <span class="val" id="cfg-pet-size-val">132px</span>
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
            <span>启用 AI 实时吐槽互动</span>
            <input type="checkbox" id="cfg-enabled" />
          </div>
          <div class="settings-row">
            <label>API 接口地址 (OpenAI 兼容 / 本地 Ollama)</label>
            <input type="text" id="cfg-url" placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" />
          </div>
          <div class="settings-row">
            <div class="label-line">
              <label>API Keys (每行一个轮询，本地可留空)</label>
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

        <div class="feed-dock" id="feed-dock">
          <div class="dock-head">
            <span>🍽️ 投喂零食（不挡左边对话）</span>
            <button class="btn-mini" id="feed-close-btn" type="button">✕</button>
          </div>
          <div class="feed-grid" id="feed-grid"></div>
        </div>

        <div class="aff-popover" id="aff-popover">
          <div class="dock-head">
            <span>❤️ 好感度调节</span>
            <span class="aff-stage-pill" id="aff-stage-pill">🐾 陌生 15</span>
          </div>
          <div class="slider-row">
            <input type="range" id="cfg-affection" min="-100" max="100" step="1" value="15" />
            <span class="val" id="cfg-affection-val">15</span>
          </div>
          <div class="aff-ticks">
            <span>-100 憎恨</span>
            <span>0 陌生</span>
            <span>+100 结婚</span>
          </div>
        </div>

        <div class="quick-bar">
          <button class="aff-orb-btn" id="aff-orb-btn" type="button" title="点击调节好感度 (-100 ~ +100)">
            <span class="orb-emoji" id="aff-orb-emoji">🐾</span>
            <span class="orb-num" id="aff-orb-num">15</span>
          </button>
          <button class="quick-btn" id="open-feed-btn" type="button" title="投喂小鱼干 / 主人的酸奶等道具">🐟 投喂</button>
          <button class="quick-btn" id="open-chat-btn" type="button" title="打开独立 AI 对话窗 (Alt+P)">💬 对话</button>
          <button class="quick-btn" id="open-persona-btn" type="button" title="人设组合与随机心情">🎭 性格</button>
          <button class="quick-btn" id="open-history-btn" type="button" title="查看桌宠历史吐槽记录">📜 记录</button>
        </div>

        <div class="pet-box" id="pet-btn" title="按住拖动 · Ctrl+滚轮缩放 · 单击点评网页/戳一戳 · 双击切气泡 · 右键设置">
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
  const personaCardEl = shadow.getElementById('persona-card');
  const openChatBtnEl = shadow.getElementById('open-chat-btn');
  const openPersonaBtnEl = shadow.getElementById('open-persona-btn');
  const openHistoryBtnEl = shadow.getElementById('open-history-btn');
  const openFeedBtnEl = shadow.getElementById('open-feed-btn');
  const feedDockEl = shadow.getElementById('feed-dock');
  const affOrbBtnEl = shadow.getElementById('aff-orb-btn');
  const affOrbEmojiEl = shadow.getElementById('aff-orb-emoji');
  const affOrbNumEl = shadow.getElementById('aff-orb-num');
  const affPopoverEl = shadow.getElementById('aff-popover');

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

  const personaActivePillEl = shadow.getElementById('persona-active-pill');
  const affStagePillEl = shadow.getElementById('aff-stage-pill');
  const cfgAffectionEl = shadow.getElementById('cfg-affection');
  const cfgAffectionValEl = shadow.getElementById('cfg-affection-val');
  const feedGridEl = shadow.getElementById('feed-grid');
  const cfgRandomMoodEl = shadow.getElementById('cfg-random-mood');
  const cfgRandomIntervalEl = shadow.getElementById('cfg-random-interval');
  const traitChipsEl = shadow.getElementById('trait-chips');
  const behaviorChipsEl = shadow.getElementById('behavior-chips');
  const traitDescEl = shadow.getElementById('trait-desc');
  const behaviorDescEl = shadow.getElementById('behavior-desc');
  const personaCustomNoteEl = shadow.getElementById('persona-custom-note');
  const addTraitFormEl = shadow.getElementById('add-trait-form');
  const addBehaviorFormEl = shadow.getElementById('add-behavior-form');
  const newTraitNameEl = shadow.getElementById('new-trait-name');
  const newTraitDescEl = shadow.getElementById('new-trait-desc');
  const newBehaviorNameEl = shadow.getElementById('new-behavior-name');
  const newBehaviorDescEl = shadow.getElementById('new-behavior-desc');

  const cfgGlobalModeEl = shadow.getElementById('cfg-global-mode');
  const cfgAutoPageEl = shadow.getElementById('cfg-auto-page');
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

  function saveState() {
    chrome.storage.local.set({ geminiPetState: state });
  }

  function scheduleSaveLayout() {
    clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(() => saveState(), 200);
  }

  function savePersonaConfig(clearRecent = true) {
    const payload = { petPersonaConfig: personaConfig };
    if (clearRecent) payload.petRecentReplies = [];
    chrome.storage.local.set(payload);
  }

  function setAffection(nextVal) {
    affection = clamp(Math.round(Number(nextVal) || 0), -100, 100);
    chrome.storage.local.set({ petAffection: affection });
    renderAffectionUI();
  }

  function bumpAffectionSlowly(delta) {
    const now = Date.now();
    if (now - lastAffectionTickAt < 30000) return;
    lastAffectionTickAt = now;
    setAffection(affection + delta);
  }

  function recordVoiceLog(text, source = '互动') {
    const clean = String(text || '').trim();
    if (!clean || clean === '喵呜？让我想想…') return;
    voiceLogs = [{ text: clean, source, ts: Date.now() }, ...voiceLogs].slice(0, 40);
    chrome.storage.local.set({ petVoiceLogs: voiceLogs });
    renderVoiceLogs();
  }

  function closeAllPopups() {
    chatDrawerEl.classList.remove('open');
    settingsCardEl.classList.remove('open');
    personaCardEl.classList.remove('open');
    feedDockEl.classList.remove('open');
    affPopoverEl.classList.remove('open');
    openChatBtnEl.classList.remove('active');
    openHistoryBtnEl.classList.remove('active');
    openPersonaBtnEl.classList.remove('active');
    openFeedBtnEl.classList.remove('active');
  }

  function getActivePersonaPair() {
    const t = personaConfig.traits.find((x) => x.id === personaConfig.activeTraitId) || personaConfig.traits[0];
    const b = personaConfig.behaviors.find((x) => x.id === personaConfig.activeBehaviorId) || personaConfig.behaviors[0];
    return { trait: t, behavior: b };
  }

  function maybeRollRandomMood(isNewPage = false) {
    if (!personaConfig.randomMoodEnabled) return;
    const intervalMin = Number(personaConfig.randomMoodIntervalMin);
    const now = Date.now();
    const shouldSwitch =
      (intervalMin === 0 && isNewPage) ||
      (intervalMin > 0 && now - (Number(personaConfig.lastMoodSwitchAt) || 0) >= intervalMin * 60000);

    if (!shouldSwitch) return;
    const randTrait = personaConfig.traits[Math.floor(Math.random() * personaConfig.traits.length)];
    const randBehavior = personaConfig.behaviors[Math.floor(Math.random() * personaConfig.behaviors.length)];
    personaConfig.activeTraitId = randTrait.id;
    personaConfig.activeBehaviorId = randBehavior.id;
    personaConfig.lastMoodSwitchAt = now;
    savePersonaConfig(true);
    renderPersonaPanel();
    showVoiceLine(`🎲 心情随机切换：【${randTrait.name} × ${randBehavior.name}】！`, { source: '随机心情', durationMs: 5000 });
  }

  function renderAffectionUI() {
    const info = getAffectionInfo(affection);
    affStagePillEl.textContent = `${info.emoji} ${info.label} ${affection}`;
    affStagePillEl.style.background = info.color;
    cfgAffectionEl.value = String(affection);
    cfgAffectionValEl.textContent = `${affection}`;

    affOrbEmojiEl.textContent = info.emoji;
    affOrbNumEl.textContent = affection > 0 ? `+${affection}` : `${affection}`;
    affOrbBtnEl.title = `当前好感度：${info.label} (${affection}) · 点击调节`;
    affOrbBtnEl.classList.toggle('tier-hate', affection <= -70);
    affOrbBtnEl.classList.toggle('tier-love', affection >= 85);
    if (affection >= 85) {
      affOrbBtnEl.style.background = 'linear-gradient(135deg, #ec4899, #f59e0b)';
    } else if (affection >= 65) {
      affOrbBtnEl.style.background = 'linear-gradient(135deg, #f43f5e, #ec4899)';
    } else if (affection <= -70) {
      affOrbBtnEl.style.background = 'linear-gradient(135deg, #450a0a, #991b1b)';
    } else {
      affOrbBtnEl.style.background = info.color;
    }
  }

  openFeedBtnEl.addEventListener('click', () => {
    const wasOpen = feedDockEl.classList.contains('open');
    closeAllPopups();
    if (!wasOpen) {
      applyLayout();
      feedDockEl.classList.add('open');
      openFeedBtnEl.classList.add('active');
    }
  });
  shadow.getElementById('feed-close-btn').addEventListener('click', closeAllPopups);

  affOrbBtnEl.addEventListener('click', () => {
    const wasOpen = affPopoverEl.classList.contains('open');
    closeAllPopups();
    if (!wasOpen) {
      renderAffectionUI();
      applyLayout();
      affPopoverEl.classList.add('open');
    }
  });

  function renderFeedButtons() {
    feedGridEl.innerHTML = FEED_ITEMS.map((item) => {
      const cls = item.special ? 'feed-btn special' : 'feed-btn';
      return `<button class="${cls}" data-feed-id="${item.id}" title="${escapeHtml(item.desc)}" type="button">${item.icon} ${escapeHtml(item.name)}</button>`;
    }).join('');
  }

  feedGridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-id]');
    if (!btn) return;
    const item = FEED_ITEMS.find((x) => x.id === btn.getAttribute('data-feed-id'));
    if (!item) return;

    let delta = item.delta || 0;
    if (item.special === 'yogurt') {
      delta = affection >= item.threshold ? item.highDelta : item.lowDelta;
    }

    const before = affection;
    setAffection(before + delta);
    playJellyBounce();
    triggerTempExpression(delta >= 0 ? 'eat' : 'xd', 2600);

    const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
    if (aiConfig.enabled && aiConfig.apiUrl && hasKeysOrLocal) {
      showVoiceLine(`投喂了${item.icon}${item.name}（好感 ${delta >= 0 ? '+' : ''}${delta}）…`, { durationMs: 3200, saveLog: false });
      triggerAiPetReaction('feed', {
        feedInfo: { itemName: item.name, itemNote: item.note, delta }
      });
    } else {
      const fallback = delta >= 0
        ? `啊呜~ 吃掉了${item.name}！（好感 ${delta >= 0 ? '+' : ''}${delta}）`
        : `呸呸呸！才不要吃${item.name}呢！（好感 ${delta}）`;
      showVoiceLine(fallback, { source: `投喂 ${item.name}` });
    }
  });

  cfgAffectionEl.addEventListener('input', () => {
    setAffection(Number(cfgAffectionEl.value));
    chrome.storage.local.set({ petRecentReplies: [] });
  });

  cfgRandomMoodEl.addEventListener('change', () => {
    personaConfig.randomMoodEnabled = cfgRandomMoodEl.checked;
    if (personaConfig.randomMoodEnabled) {
      personaConfig.lastMoodSwitchAt = Date.now();
    }
    savePersonaConfig(false);
  });

  cfgRandomIntervalEl.addEventListener('change', () => {
    personaConfig.randomMoodIntervalMin = Number(cfgRandomIntervalEl.value);
    savePersonaConfig(false);
  });

  function renderPersonaPanel() {
    const { trait, behavior } = getActivePersonaPair();
    personaActivePillEl.textContent = `${trait.name} × ${behavior.name}`;
    traitDescEl.textContent = trait.desc;
    behaviorDescEl.textContent = behavior.desc;
    personaCustomNoteEl.value = personaConfig.customNote || '';
    cfgRandomMoodEl.checked = Boolean(personaConfig.randomMoodEnabled);
    cfgRandomIntervalEl.value = String(personaConfig.randomMoodIntervalMin ?? 30);
    renderAffectionUI();

    const defaultTraitIds = new Set(DEFAULT_TRAITS.map((x) => x.id));
    traitChipsEl.innerHTML = personaConfig.traits
      .map((item) => {
        const active = item.id === trait.id ? 'active' : '';
        const del = !defaultTraitIds.has(item.id) ? `<span class="chip-del" data-del-trait="${escapeHtml(item.id)}">✕</span>` : '';
        return `<button class="persona-chip ${active}" data-trait-id="${escapeHtml(item.id)}" type="button">${escapeHtml(item.name)}${del}</button>`;
      })
      .join('');

    const defaultBehaviorIds = new Set(DEFAULT_BEHAVIORS.map((x) => x.id));
    behaviorChipsEl.innerHTML = personaConfig.behaviors
      .map((item) => {
        const active = item.id === behavior.id ? 'active' : '';
        const del = !defaultBehaviorIds.has(item.id) ? `<span class="chip-del" data-del-behavior="${escapeHtml(item.id)}">✕</span>` : '';
        return `<button class="persona-chip ${active}" data-behavior-id="${escapeHtml(item.id)}" type="button">${escapeHtml(item.name)}${del}</button>`;
      })
      .join('');
  }

  traitChipsEl.addEventListener('click', (e) => {
    const delId = e.target.getAttribute && e.target.getAttribute('data-del-trait');
    if (delId) {
      e.stopPropagation();
      personaConfig.traits = personaConfig.traits.filter((t) => t.id !== delId);
      if (personaConfig.activeTraitId === delId) personaConfig.activeTraitId = personaConfig.traits[0].id;
      savePersonaConfig(true);
      renderPersonaPanel();
      return;
    }
    const btn = e.target.closest('[data-trait-id]');
    if (!btn) return;
    personaConfig.activeTraitId = btn.getAttribute('data-trait-id');
    savePersonaConfig(true);
    renderPersonaPanel();
  });

  behaviorChipsEl.addEventListener('click', (e) => {
    const delId = e.target.getAttribute && e.target.getAttribute('data-del-behavior');
    if (delId) {
      e.stopPropagation();
      personaConfig.behaviors = personaConfig.behaviors.filter((b) => b.id !== delId);
      if (personaConfig.activeBehaviorId === delId) personaConfig.activeBehaviorId = personaConfig.behaviors[0].id;
      savePersonaConfig(true);
      renderPersonaPanel();
      return;
    }
    const btn = e.target.closest('[data-behavior-id]');
    if (!btn) return;
    personaConfig.activeBehaviorId = btn.getAttribute('data-behavior-id');
    savePersonaConfig(true);
    renderPersonaPanel();
  });

  shadow.getElementById('toggle-add-trait').addEventListener('click', () => {
    addTraitFormEl.classList.toggle('open');
    if (addTraitFormEl.classList.contains('open')) newTraitNameEl.focus();
  });
  shadow.getElementById('cancel-add-trait').addEventListener('click', () => addTraitFormEl.classList.remove('open'));
  shadow.getElementById('confirm-add-trait').addEventListener('click', () => {
    const name = newTraitNameEl.value.trim();
    const desc = newTraitDescEl.value.trim();
    if (!name) return;
    const id = 'custom_t_' + Date.now();
    personaConfig.traits.push({ id, name, desc: desc || `以「${name}」的鲜明性格风格与主人互动。` });
    personaConfig.activeTraitId = id;
    newTraitNameEl.value = '';
    newTraitDescEl.value = '';
    addTraitFormEl.classList.remove('open');
    savePersonaConfig(true);
    renderPersonaPanel();
  });

  shadow.getElementById('toggle-add-behavior').addEventListener('click', () => {
    addBehaviorFormEl.classList.toggle('open');
    if (addBehaviorFormEl.classList.contains('open')) newBehaviorNameEl.focus();
  });
  shadow.getElementById('cancel-add-behavior').addEventListener('click', () => addBehaviorFormEl.classList.remove('open'));
  shadow.getElementById('confirm-add-behavior').addEventListener('click', () => {
    const name = newBehaviorNameEl.value.trim();
    const desc = newBehaviorDescEl.value.trim();
    if (!name) return;
    const id = 'custom_b_' + Date.now();
    personaConfig.behaviors.push({ id, name, desc: desc || `在互动中表现出「${name}」的行为倾向。` });
    personaConfig.activeBehaviorId = id;
    newBehaviorNameEl.value = '';
    newBehaviorDescEl.value = '';
    addBehaviorFormEl.classList.remove('open');
    savePersonaConfig(true);
    renderPersonaPanel();
  });

  openPersonaBtnEl.addEventListener('click', () => {
    const wasOpen = personaCardEl.classList.contains('open');
    closeAllPopups();
    if (!wasOpen) {
      renderPersonaPanel();
      applyLayout();
      personaCardEl.classList.add('open');
      openPersonaBtnEl.classList.add('active');
    }
  });
  shadow.getElementById('persona-close-btn').addEventListener('click', closeAllPopups);
  shadow.getElementById('persona-reset-btn').addEventListener('click', () => {
    personaConfig = {
      ...DEFAULT_PERSONA_CONFIG,
      traits: DEFAULT_TRAITS.map((t) => ({ ...t })),
      behaviors: DEFAULT_BEHAVIORS.map((b) => ({ ...b }))
    };
    savePersonaConfig(true);
    renderPersonaPanel();
    showVoiceLine('已恢复默认人设预设~', { saveLog: false });
  });
  shadow.getElementById('persona-save-btn').addEventListener('click', () => {
    personaConfig.customNote = personaCustomNoteEl.value.trim();
    savePersonaConfig(true);
    const { trait, behavior } = getActivePersonaPair();
    closeAllPopups();
    playJellyBounce();
    triggerTempExpression('grin', 2200);
    showVoiceLine(`人设已切换为【${trait.name} × ${behavior.name}】！`, { saveLog: false });
  });

  function applyLayout() {
    const visible = shouldRenderOnThisPage();
    host.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const petSize = clamp(Number(state.petSize) || 132, 64, 240);
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

    const showQuotaBubble = isGeminiSite && state.bubbleVisible;
    bubbleEl.classList.toggle('hidden', !showQuotaBubble);
    bubbleEl.style.transform = `scale(${bubbleScale / 100})`;

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
    cfgGlobalModeEl.checked = Boolean(state.globalMode);
    cfgAutoPageEl.checked = Boolean(state.autoPageComment);
  }

  window.addEventListener('resize', applyLayout);

  cfgPetSizeEl.addEventListener('input', () => { state.petSize = Number(cfgPetSizeEl.value); applyLayout(); scheduleSaveLayout(); });
  cfgBubbleScaleEl.addEventListener('input', () => { state.bubbleScale = Number(cfgBubbleScaleEl.value); applyLayout(); scheduleSaveLayout(); });
  cfgVoiceScaleEl.addEventListener('input', () => {
    state.voiceScale = Number(cfgVoiceScaleEl.value);
    applyLayout();
    scheduleSaveLayout();
    showVoiceLine('对话气泡大小预览喵~', { durationMs: 2800, saveLog: false });
  });
  cfgVoiceSecEl.addEventListener('input', () => { state.voiceDurationSec = Number(cfgVoiceSecEl.value); applyLayout(); scheduleSaveLayout(); });
  cfgGlobalModeEl.addEventListener('change', () => { state.globalMode = cfgGlobalModeEl.checked; saveState(); applyLayout(); });
  cfgAutoPageEl.addEventListener('change', () => { state.autoPageComment = cfgAutoPageEl.checked; saveState(); });

  shadow.getElementById('cfg-hide-host').addEventListener('click', () => {
    const list = Array.isArray(state.hiddenHosts) ? [...state.hiddenHosts] : [];
    if (!list.includes(location.hostname)) list.push(location.hostname);
    state.hiddenHosts = list;
    saveState();
    closeAllPopups();
    applyLayout();
  });

  shadow.getElementById('cfg-reset-layout').addEventListener('click', () => {
    state.petSize = 132;
    state.bubbleScale = 100;
    state.voiceScale = 100;
    state.voiceDurationSec = 9;
    state.posRight = 16;
    state.posBottom = 0;
    state.hiddenHosts = [];
    applyLayout();
    saveState();
    showVoiceLine('位置、大小与网站屏蔽列表已重置~', { saveLog: false });
  });

  petBtnEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    state.petSize = clamp((Number(state.petSize) || 132) + (e.deltaY < 0 ? 8 : -8), 64, 240);
    applyLayout();
    scheduleSaveLayout();
  }, { passive: false });

  let dragActive = false, dragMoved = false, dragStartX = 0, dragStartY = 0, dragOrigRight = 16, dragOrigBottom = 0;
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
    try { petBtnEl.releasePointerCapture(e.pointerId); } catch {}
    if (dragMoved) {
      scheduleSaveLayout();
      setTimeout(() => { dragMoved = false; }, 60);
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
      closeAllPopups();
      return;
    }
    closeAllPopups();
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
  shadow.getElementById('drawer-close-btn').addEventListener('click', closeAllPopups);
  shadow.getElementById('drawer-cfg-btn').addEventListener('click', () => {
    closeAllPopups();
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
      historyListEl.innerHTML = `<div class="empty-hint">还没有历史吐槽记录哦~<br>浏览网页或戳一戳桌宠后，所有台词都会自动保存在这里。</div>`;
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
      chatMessagesEl.innerHTML = `<div class="empty-hint">喵呜~ 这里是独立的大模型小聊天窗！<br>在任何网页都能直接聊天；勾选上方开关可自动附带当前网页或 Gemini 对话内容。</div>`;
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
    thinkingEl.innerHTML = `<div class="msg-bubble">⏳ ${escapeHtml(aiConfig.model || '大模型')} 正在思考...</div>`;
    chatMessagesEl.appendChild(thinkingEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    updatePetAppearance();

    chrome.runtime.sendMessage(
      {
        type: 'CHAT_WITH_PET',
        payload: {
          message: text,
          history: prevHistory,
          context: isGeminiSite ? extractLatestTurnContext() : null,
          pageInfo: !isGeminiSite ? extractCurrentPageInfo() : null,
          attachContext: chatAttachCtxEl.checked
        }
      },
      (res) => {
        isChatSending = false;
        chatSendBtnEl.disabled = false;
        if (chrome.runtime.lastError) {
          chatHistory = [...chatHistory, { role: 'assistant', content: `⚠️ 后台异常: ${chrome.runtime.lastError.message}`, ts: Date.now() }].slice(-40);
        } else if (res && res.ok) {
          chatHistory = [...chatHistory, { role: 'assistant', content: res.reply, model: res.model, latencyMs: res.latencyMs, ts: Date.now() }].slice(-40);
          bumpAffectionSlowly(1);
          playJellyBounce();
          triggerTempExpression('xd', 2200);
        } else {
          chatHistory = [...chatHistory, { role: 'assistant', content: `⚠️ ${res && res.error ? res.error : '请求失败，请检查右键模型设置'}`, ts: Date.now() }].slice(-40);
        }
        chrome.storage.local.set({ petChatHistory: chatHistory });
        renderChatHistory();
        updatePetAppearance();
      }
    );
  }

  chatSendBtnEl.addEventListener('click', sendPetChat);
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPetChat(); }
  });
  chatAttachCtxEl.addEventListener('change', () => {
    aiConfig.attachContext = chatAttachCtxEl.checked;
    chrome.storage.local.set({ petAiConfig: aiConfig });
  });

  function updateKeyBadge() {
    const n = countKeys(cfgKeysEl.value);
    keyCountBadgeEl.textContent = isLocalUrl(cfgUrlEl.value) && n === 0 ? '本地免 Key' : (n > 1 ? `${n} 个 Key (轮询)` : `${n} 个 Key`);
  }
  cfgKeysEl.addEventListener('input', updateKeyBadge);
  cfgUrlEl.addEventListener('input', updateKeyBadge);

  function fillConfigForm() {
    cfgEnabledEl.checked = Boolean(aiConfig.enabled);
    cfgUrlEl.value = aiConfig.apiUrl || DEFAULT_AI_CONFIG.apiUrl;
    cfgKeysEl.value = aiConfig.apiKeys || '';
    cfgModelEl.value = aiConfig.model || DEFAULT_AI_CONFIG.model;
    chatAttachCtxEl.checked = Boolean(aiConfig.attachContext);
    chatModelTagEl.textContent = aiConfig.model || DEFAULT_AI_CONFIG.model;
    updateKeyBadge();
  }

  shadow.getElementById('preset-google').addEventListener('click', () => { cfgUrlEl.value = PRESETS.google.apiUrl; cfgModelEl.value = PRESETS.google.model; cfgEnabledEl.checked = true; updateKeyBadge(); });
  shadow.getElementById('preset-deepseek').addEventListener('click', () => { cfgUrlEl.value = PRESETS.deepseek.apiUrl; cfgModelEl.value = PRESETS.deepseek.model; cfgEnabledEl.checked = true; updateKeyBadge(); });
  shadow.getElementById('preset-ollama').addEventListener('click', () => { cfgUrlEl.value = PRESETS.ollama.apiUrl; cfgModelEl.value = PRESETS.ollama.model; cfgEnabledEl.checked = true; updateKeyBadge(); });

  petBtnEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const wasOpen = settingsCardEl.classList.contains('open');
    closeAllPopups();
    if (!wasOpen) {
      testResultEl.className = 'test-result';
      fillConfigForm();
      applyLayout();
      settingsCardEl.classList.add('open');
    }
  });
  shadow.getElementById('cfg-cancel').addEventListener('click', closeAllPopups);

  shadow.getElementById('cfg-test').addEventListener('click', () => {
    testResultEl.className = 'test-result show';
    testResultEl.textContent = '⏳ 正在向接口发送测试请求...';
    chrome.runtime.sendMessage(
      {
        type: 'TEST_PET_API',
        payload: {
          apiUrl: cfgUrlEl.value.trim() || DEFAULT_AI_CONFIG.apiUrl,
          apiKeys: cfgKeysEl.value,
          model: cfgModelEl.value.trim() || DEFAULT_AI_CONFIG.model
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
          testResultEl.className = 'test-result show err';
          testResultEl.textContent = `❌ 连接失败: ${res && res.error ? res.error : '未知错误'}`;
        }
      }
    );
  });

  shadow.getElementById('cfg-save').addEventListener('click', () => {
    aiConfig = {
      ...aiConfig,
      enabled: cfgEnabledEl.checked,
      apiUrl: cfgUrlEl.value.trim() || DEFAULT_AI_CONFIG.apiUrl,
      apiKeys: cfgKeysEl.value.trim(),
      model: cfgModelEl.value.trim() || DEFAULT_AI_CONFIG.model
    };
    chrome.storage.local.set({ petAiConfig: aiConfig }, () => {
      fillConfigForm();
      closeAllPopups();
      playJellyBounce();
      triggerTempExpression('xd', 2200);
      showVoiceLine(aiConfig.enabled ? 'AI 配置已保存生效喵！' : '已切换回本地词库~', { saveLog: false });
    });
  });

  function scheduleVoiceHide(ms) {
    clearTimeout(voiceHideTimer);
    voiceHideTimer = setTimeout(() => {
      if (!voiceHovered) voiceBubbleEl.classList.remove('show');
    }, ms);
  }
  voiceBubbleEl.addEventListener('mouseenter', () => { voiceHovered = true; clearTimeout(voiceHideTimer); });
  voiceBubbleEl.addEventListener('mouseleave', () => { voiceHovered = false; scheduleVoiceHide(2500); });

  function showVoiceLine(customText, opts = {}) {
    const defaultMs = clamp(Number(state.voiceDurationSec) || 9, 3, 30) * 1000;
    const durationMs = typeof opts === 'number' ? opts : (opts.durationMs || defaultMs);
    const saveLog = typeof opts === 'object' ? opts.saveLog !== false : true;
    const source = typeof opts === 'object' && opts.source ? opts.source : '互动';
    const line = customText || CUTE_LINES[Math.floor(Math.random() * CUTE_LINES.length)];
    voiceBubbleEl.textContent = line;
    voiceBubbleEl.classList.add('show');
    if (saveLog) recordVoiceLog(line, source);
    scheduleVoiceHide(durationMs);
  }

  function triggerTempExpression(spriteKey, durationMs = 2600) {
    tempSprite = spriteKey;
    updatePetAppearance();
    clearTimeout(tempSpriteTimer);
    tempSpriteTimer = setTimeout(() => { tempSprite = null; updatePetAppearance(); }, durationMs);
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
      triggerTempExpression(Math.random() < 0.65 ? 'xd' : 'grin', 2400);
      bumpAffectionSlowly(1);

      const now = Date.now();
      const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
      const canClickAi = aiConfig.enabled && hasKeysOrLocal && now - lastClickAiTime > 4500;

      if (canClickAi) {
        lastClickAiTime = now;
        showVoiceLine('喵呜？让我想想…', { durationMs: 4000, saveLog: false });
        if (isGeminiSite) {
          triggerAiPetReaction('click');
        } else {
          triggerAiPetReaction('page_click', { pageInfo: extractCurrentPageInfo() });
        }
      } else {
        showVoiceLine(null, { source: '戳一戳' });
      }
    }, 180);
  });

  petBtnEl.addEventListener('dblclick', () => {
    if (dragMoved) return;
    clearTimeout(clickDelayTimer);
    if (!isGeminiSite) {
      openDrawer('chat');
      return;
    }
    state.bubbleVisible = !state.bubbleVisible;
    applyLayout();
    saveState();
    playJellyBounce();
    showVoiceLine(state.bubbleVisible ? '额度面板展开啦~' : '额度面板先藏起来咯！', { saveLog: false });
  });

  shadow.getElementById('oval-card').addEventListener('click', () => {
    if (!isGeminiSite) return;
    triggerSilentSync(true);
    triggerTempExpression('grin', 1600);
    showVoiceLine('正在帮主人核对最新额度喵…', { saveLog: false });
  });

  function isAiStreaming() {
    if (isChatSending) return true;
    if (!isGeminiSite) return false;
    return Boolean(document.querySelector('[aria-label*="Stop"], [aria-label*="停止"], .stop-icon'));
  }

  function updatePetAppearance() {
    const streaming = isAiStreaming();
    petBtnEl.classList.toggle('eating', streaming && !tempSprite);
    let targetKey = 'idle';
    if (tempSprite && SPRITES[tempSprite]) targetKey = tempSprite;
    else if (streaming) targetKey = 'eat';
    if (petImgEl.src !== SPRITES[targetKey]) petImgEl.src = SPRITES[targetKey];
  }

  function extractLatestTurnContext() {
    const userNodes = document.querySelectorAll('user-query, .user-query-container, [data-test-id="user-query"]');
    const aiNodes = document.querySelectorAll('model-response, .model-response-container, message-content');
    return {
      userText: userNodes.length > 0 ? userNodes[userNodes.length - 1].innerText.trim() : '',
      aiText: aiNodes.length > 0 ? aiNodes[aiNodes.length - 1].innerText.trim() : ''
    };
  }

  function triggerAiPetReaction(triggerType = 'reply_done', extra = {}) {
    const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
    if (!aiConfig.enabled || !aiConfig.apiUrl || !hasKeysOrLocal) {
      if (triggerType === 'reply_done') {
        triggerTempExpression('xd', 2000);
        showVoiceLine('回答生成完毕喵~', { source: '回复围观' });
      }
      return;
    }

    const ctx = isGeminiSite ? extractLatestTurnContext() : { userText: '', aiText: '' };
    if (triggerType === 'reply_done' && !ctx.userText && !ctx.aiText) return;

    const srcMap = {
      click: 'AI 戳一戳',
      reply_done: 'AI 围观吐槽',
      page_open: `冲浪围观 · ${location.hostname}`,
      page_click: `网页点评 · ${location.hostname}`,
      feed: extra.feedInfo ? `投喂 · ${extra.feedInfo.itemName}` : '投喂互动'
    };

    chrome.runtime.sendMessage(
      {
        type: 'GENERATE_PET_COMMENT',
        payload: {
          userText: ctx.userText,
          aiText: ctx.aiText,
          remainPct: Math.round(state.exactFiveHourPct),
          triggerType,
          pageInfo: extra.pageInfo || null,
          feedInfo: extra.feedInfo || null
        }
      },
      (res) => {
        if (res && res.ok && res.text) {
          playJellyBounce();
          triggerTempExpression(res.mood || 'xd', 4200);
          showVoiceLine(res.text, { source: srcMap[triggerType] || 'AI 互动' });
        } else if (res && res.error && triggerType !== 'page_open') {
          showVoiceLine(`⚠️ ${res.error}`, { durationMs: 5000, saveLog: false });
        }
      }
    );
  }

  /* 全网页打开自动围观（每页仅 1 次，跨标签页 10 秒全局节流） */
  function maybeTriggerAutoPageComment() {
    if (pageAutoReacted || isGeminiSite || document.hidden) return;
    if (!shouldRenderOnThisPage() || !state.autoPageComment || !aiConfig.enabled) return;
    const hasKeysOrLocal = isLocalUrl(aiConfig.apiUrl) || countKeys(aiConfig.apiKeys) > 0;
    if (!aiConfig.apiUrl || !hasKeysOrLocal) return;

    pageAutoReacted = true;
    const now = Date.now();
    chrome.storage.local.get(['petLastAutoPageAt'], (res) => {
      const lastAt = Number(res.petLastAutoPageAt) || 0;
      if (now - lastAt < 10000) return; // 10 秒全局跨标签页冷却内不触发
      chrome.storage.local.set({ petLastAutoPageAt: now }, () => {
        const info = extractCurrentPageInfo();
        if (!info.title && info.snippet.length < 20) return;
        triggerAiPetReaction('page_open', { pageInfo: info });
      });
    });
  }

  function triggerSilentSync(force = false) {
    if (!isGeminiSite) return;
    const now = Date.now();
    if (isSyncing || (!force && now - lastTriggerTime < 15000)) return;
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

  function estimateContextTokens() {
    if (!isGeminiSite || location.pathname.startsWith('/usage')) return 0;
    const mainEl = document.querySelector('main') || document.body;
    return Math.round(((mainEl && mainEl.innerText) || '').length / 1.8);
  }

  function renderUI() {
    applyLayout();
    if (isGeminiSite) {
      const remainPct = Math.round(state.exactFiveHourPct);
      pctEl.textContent = `剩 ${remainPct}%`;
      pctEl.className = 'big-pct' + (remainPct <= 20 ? ' danger' : remainPct <= 50 ? ' warn' : '');
      const modelBtn = document.querySelector('[data-test-id="bard-mode-menu-button"]');
      if (modelBtn && modelBtn.innerText.trim()) titleEl.textContent = `${modelBtn.innerText.trim()} 5h 额度`;
      const countdown = state.resetCountdownStr || '待同步';
      resetLineEl.innerHTML = `周剩 ${Number(state.weeklyRemainPct).toFixed(1)}% · ${countdown}<span class="underline">重置</span>`;
      const ctxTokens = estimateContextTokens();
      ctxLineEl.innerHTML = `上下文 ${((ctxTokens / state.contextMaxTokens) * 100).toFixed(1)}% (${(ctxTokens / 1000).toFixed(1)}K/${Math.round(state.contextMaxTokens / 1000)}K) · 已用<br>${(state.totalSessionTokens / 1000000).toFixed(2)}M tok`;
      if (isSyncing) syncStatusEl.textContent = '无感校准中...';
      else if (state.lastSyncAt) {
        const t = new Date(state.lastSyncAt);
        syncStatusEl.textContent = `已校准 (${formatClock(t)}) · 点击刷新`;
      }
    }
    updatePetAppearance();
  }

  renderFeedButtons();

  chrome.storage.local.get(
    ['geminiPetState', 'petAiConfig', 'petVoiceLogs', 'petChatHistory', 'petPersonaConfig', 'petAffection'],
    (res) => {
      if (res.geminiPetState) state = { ...DEFAULT_STATE, ...res.geminiPetState };
      if (res.petAiConfig) {
        aiConfig = { ...DEFAULT_AI_CONFIG, ...res.petAiConfig, apiKeys: res.petAiConfig.apiKeys || res.petAiConfig.apiKey || '' };
      }
      if (Array.isArray(res.petVoiceLogs)) voiceLogs = res.petVoiceLogs.slice(0, 40);
      if (Array.isArray(res.petChatHistory)) chatHistory = res.petChatHistory.slice(-40);
      if (res.petPersonaConfig) {
        personaConfig = {
          ...DEFAULT_PERSONA_CONFIG,
          ...res.petPersonaConfig,
          traits: Array.isArray(res.petPersonaConfig.traits) && res.petPersonaConfig.traits.length ? res.petPersonaConfig.traits : DEFAULT_TRAITS.map((t) => ({ ...t })),
          behaviors: Array.isArray(res.petPersonaConfig.behaviors) && res.petPersonaConfig.behaviors.length ? res.petPersonaConfig.behaviors : DEFAULT_BEHAVIORS.map((b) => ({ ...b }))
        };
      }
      if (Number.isFinite(Number(res.petAffection))) affection = clamp(Number(res.petAffection), -100, 100);

      fillConfigForm();
      renderPersonaPanel();
      renderChatHistory();
      renderVoiceLogs();
      renderUI();

      maybeRollRandomMood(true);

      if (isGeminiSite && !location.pathname.startsWith('/usage')) {
        setTimeout(() => triggerSilentSync(true), 2000);
      } else if (!isGeminiSite) {
        setTimeout(maybeTriggerAutoPageComment, 1600);
      }
    }
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiPetState?.newValue) { state = { ...state, ...changes.geminiPetState.newValue }; renderUI(); }
    if (changes.petAiConfig?.newValue) {
      const nv = changes.petAiConfig.newValue;
      aiConfig = { ...DEFAULT_AI_CONFIG, ...nv, apiKeys: nv.apiKeys || nv.apiKey || '' };
      fillConfigForm();
    }
    if (Array.isArray(changes.petVoiceLogs?.newValue)) { voiceLogs = changes.petVoiceLogs.newValue.slice(0, 40); renderVoiceLogs(); }
    if (Array.isArray(changes.petChatHistory?.newValue)) { chatHistory = changes.petChatHistory.newValue.slice(-40); renderChatHistory(); }
    if (changes.petPersonaConfig?.newValue) {
      const np = changes.petPersonaConfig.newValue;
      personaConfig = {
        ...DEFAULT_PERSONA_CONFIG,
        ...np,
        traits: Array.isArray(np.traits) && np.traits.length ? np.traits : DEFAULT_TRAITS.map((t) => ({ ...t })),
        behaviors: Array.isArray(np.behaviors) && np.behaviors.length ? np.behaviors : DEFAULT_BEHAVIORS.map((b) => ({ ...b }))
      };
      renderPersonaPanel();
    }
    if (changes.petAffection && Number.isFinite(Number(changes.petAffection.newValue))) {
      affection = clamp(Number(changes.petAffection.newValue), -100, 100);
      renderAffectionUI();
    }
  });

  function getResponseCount() {
    return document.querySelectorAll('model-response, .model-response-container, message-content').length;
  }

  let syncedResponseCount = -1;
  let lastTurnTokens = 0;

  setInterval(updatePetAppearance, 500);
  setInterval(() => {
    maybeRollRandomMood(false);
    if (!isGeminiSite) return;
    const currentCtx = estimateContextTokens();
    if (currentCtx > lastTurnTokens + 50) {
      state.totalSessionTokens += currentCtx - lastTurnTokens;
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
