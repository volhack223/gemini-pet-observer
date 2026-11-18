(() => {
  const isIframe = window.self !== window.top;

  // 解析 /usage 页面上的真实百分比和重置时间
  function parseAndSyncUsageText(rawText) {
    if (!rawText || rawText.length < 20) return false;

    const usedMatches = [...rawText.matchAll(/(?:已使用|Used)\s*(\d{1,3}(?:\.\d+)?)\s*%/gi)]
      .map(m => parseFloat(m[1]));

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

  if (location.pathname.startsWith('/usage')) {
    let tries = 0;
    const usageTimer = setInterval(() => {
      tries++;
      const ok = parseAndSyncUsageText(document.body.innerText);
      if (ok || tries > 25) clearInterval(usageTimer);
    }, 400);
    if (isIframe) return;
  } else if (isIframe) {
    return;
  }

  if (document.getElementById('gemini-pet-observer-host')) return;

  const DEFAULT_STATE = {
    modelTitle: 'Gemini 4 Pro 5h 额度',
    exactFiveHourPct: 100,
    weeklyRemainPct: 100.0,
    resetCountdownStr: '',
    contextMaxTokens: 1000000,
    totalSessionTokens: 0,
    lastSyncAt: 0,
    bubbleVisible: true
  };

  let state = { ...DEFAULT_STATE };
  let isSyncing = false;
  let lastTriggerTime = 0;
  let syncTimeoutGuard = null;

  // 预加载 4 张 WebP 表情，切换零延迟不闪烁
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

  // 卖萌台词库
  const CUTE_LINES = [
    '喵呜~ 别戳啦，要被戳成布丁了！',
    '嘿嘿，被你发现我在偷偷摸鱼了 (＞◡＜)',
    '当前额度还很充足哦，放心大胆聊吧~',
    '啊呜啊呜… 刚才的回答味道还不错！',
    '再戳的话… 本喵就要把你的额度全吃掉咯！',
    '干嘛呀，是不是想夸我今天很可爱？',
    '双击我可以收起或展开头顶的额度气泡哦~'
  ];

  let tempSprite = null;      // 临时表情 ('xd' | 'grin' | null)
  let tempSpriteTimer = null;
  let voiceHideTimer = null;

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

  chrome.storage.local.get(['geminiPetState'], (res) => {
    if (res.geminiPetState) state = { ...DEFAULT_STATE, ...res.geminiPetState };
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
  });

  function saveState() {
    chrome.storage.local.set({ geminiPetState: state });
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

  // 创建 Shadow DOM UI
  const host = document.createElement('div');
  host.id = 'gemini-pet-observer-host';
  host.style.cssText = 'position:fixed;bottom:0;right:16px;z-index:2147483647;pointer-events:none;font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      .wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        user-select: none;
      }
      /* 额度思考气泡 */
      .bubble-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-right: 28px;
        margin-bottom: -6px;
        pointer-events: auto;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      .bubble-container.hidden {
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        pointer-events: none;
      }
      .main-oval {
        background: #ffffff;
        border: 4.5px solid #202a5c;
        border-radius: 50%;
        padding: 18px 34px;
        text-align: center;
        box-shadow: 0 6px 20px rgba(32, 42, 92, 0.14);
        min-width: 245px;
        cursor: pointer;
        transition: transform 0.12s ease;
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

      /* 桌宠区域 + 果冻弹性动画 */
      .pet-stage {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
      }
      /* 小人左侧卖萌台词气泡 */
      .voice-bubble {
        position: absolute;
        right: 138px;
        bottom: 42px;
        background: #ffffff;
        color: #202a5c;
        border: 2.5px solid #202a5c;
        border-radius: 14px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(32, 42, 92, 0.16);
        opacity: 0;
        transform: translateX(8px) scale(0.9);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .voice-bubble::after {
        content: '';
        position: absolute;
        right: -7px;
        bottom: 12px;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border-right: 2.5px solid #202a5c;
        border-top: 2.5px solid #202a5c;
        transform: rotate(45deg);
      }
      .voice-bubble.show {
        opacity: 1;
        transform: translateX(0) scale(1);
      }

      .pet-box {
        width: 138px;
        height: 138px;
        pointer-events: auto;
        cursor: pointer;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        transform-origin: bottom center;
      }
      .pet-box img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.16));
        transform-origin: bottom center;
        animation: idleBreath 3.2s ease-in-out infinite;
      }
      /* 吃 Token 生成中的咀嚼晃动 */
      .pet-box.eating img {
        animation: eatingMunch 0.55s ease-in-out infinite;
      }
      /* 果冻被点击 Q 弹关键帧 */
      .pet-box.jelly img {
        animation: jellyBounce 0.65s cubic-bezier(0.28, 0.84, 0.42, 1) forwards !important;
      }

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

    <div class="wrapper">
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
        <div class="voice-bubble" id="voice-bubble">喵呜~ 别戳啦！</div>
        <div class="pet-box" id="pet-btn" title="单击戳一戳互动 · 双击隐藏/显示额度气泡">
          <img id="pet-img" src="${SPRITES.idle}" alt="Pet" />
        </div>
      </div>
    </div>
  `;

  const bubbleEl = shadow.getElementById('bubble');
  const pctEl = shadow.getElementById('remain-pct');
  const titleEl = shadow.getElementById('model-title');
  const resetLineEl = shadow.getElementById('reset-line');
  const ctxLineEl = shadow.getElementById('ctx-line');
  const syncStatusEl = shadow.getElementById('sync-status');
  const petBtnEl = shadow.getElementById('pet-btn');
  const petImgEl = shadow.getElementById('pet-img');
  const voiceBubbleEl = shadow.getElementById('voice-bubble');

  function showVoiceLine(customText) {
    const remainPct = Math.round(state.exactFiveHourPct);
    const dynamicLines = [
      ...CUTE_LINES,
      `现在还剩 ${remainPct}% 额度呢，能量满满喵！`
    ];
    const line = customText || dynamicLines[Math.floor(Math.random() * dynamicLines.length)];
    voiceBubbleEl.textContent = line;
    voiceBubbleEl.classList.add('show');
    clearTimeout(voiceHideTimer);
    voiceHideTimer = setTimeout(() => {
      voiceBubbleEl.classList.remove('show');
    }, 2800);
  }

  function triggerTempExpression(spriteKey, durationMs = 2400) {
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
    // 强制触发重排以重新播放动画
    void petBtnEl.offsetWidth;
    petBtnEl.classList.add('jelly');
  }

  // 单击小人：果冻 Q 弹 + 随机切换 xd / grin 表情 + 弹出卖萌台词
  let clickDelayTimer = null;
  petBtnEl.addEventListener('click', () => {
    clearTimeout(clickDelayTimer);
    clickDelayTimer = setTimeout(() => {
      playJellyBounce();
      const nextExpr = Math.random() < 0.65 ? 'xd' : 'grin';
      triggerTempExpression(nextExpr, 2400);
      showVoiceLine();
    }, 180);
  });

  // 双击小人：切换顶部额度气泡的显示/隐藏
  petBtnEl.addEventListener('dblclick', () => {
    clearTimeout(clickDelayTimer);
    state.bubbleVisible = !state.bubbleVisible;
    bubbleEl.classList.toggle('hidden', !state.bubbleVisible);
    saveState();
    playJellyBounce();
    showVoiceLine(state.bubbleVisible ? '额度面板展开啦~' : '额度面板先藏起来咯！');
  });

  // 单击额度气泡：手动立即校准
  shadow.getElementById('oval-card').addEventListener('click', () => {
    triggerSilentSync(true);
    triggerTempExpression('grin', 1600);
    showVoiceLine('正在帮主人核对最新额度喵…');
  });

  function isAiStreaming() {
    return Boolean(document.querySelector('[aria-label*="Stop"], [aria-label*="停止"], .stop-icon'));
  }

  function updatePetAppearance() {
    const streaming = isAiStreaming();
    petBtnEl.classList.toggle('eating', streaming && !tempSprite);

    let targetKey = 'idle';
    if (tempSprite && SPRITES[tempSprite]) {
      targetKey = tempSprite;
    } else if (streaming) {
      targetKey = 'eat'; // 生成回复时自动变成嚼嚼表情
    }

    const targetUrl = SPRITES[targetKey];
    if (petImgEl.src !== targetUrl) {
      petImgEl.src = targetUrl;
    }
  }

  function estimateContextTokens() {
    if (location.pathname.startsWith('/usage')) return 0;
    const mainEl = document.querySelector('main') || document.body;
    return Math.round((mainEl.innerText || '').length / 1.8);
  }

  function renderUI() {
    bubbleEl.classList.toggle('hidden', !state.bubbleVisible);

    const remainPct = Math.round(state.exactFiveHourPct);
    pctEl.textContent = `剩 ${remainPct}%`;
    pctEl.className = 'big-pct' + (remainPct <= 20 ? ' danger' : remainPct <= 50 ? ' warn' : '');

    const modelBtn = document.querySelector('[data-test-id="bard-mode-menu-button"]');
    if (modelBtn && modelBtn.innerText.trim()) {
      titleEl.textContent = `${modelBtn.innerText.trim()} 5h 额度`;
    }

    const countdown = state.resetCountdownStr || '待同步';
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

  // 高频检测生成状态，让“开始输出 -> 切换 eat.webp”几乎零延迟
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
      // 回复刚刚生成完毕：切换成 xd (> <) 表情并弹出提示，同时无感校准额度
      triggerTempExpression('xd', 2000);
      showVoiceLine('回答生成完毕喵~');
      setTimeout(() => triggerSilentSync(false), 1500);
    } else if (curResponses < syncedResponseCount) {
      syncedResponseCount = curResponses;
    }

    renderUI();
  }, 2000);
})();