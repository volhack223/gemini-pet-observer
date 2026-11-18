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
    bubbleVisible: true
  };

  const DEFAULT_AI_CONFIG = {
    enabled: false,
    apiUrl: PRESETS.google.apiUrl,
    apiKeys: '',
    model: PRESETS.google.model
  };

  let state = { ...DEFAULT_STATE };
  let aiConfig = { ...DEFAULT_AI_CONFIG };
  let isSyncing = false;
  let lastTriggerTime = 0;
  let lastClickAiTime = 0;
  let syncTimeoutGuard = null;

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
    '嘿嘿，被你发现我在偷偷摸鱼了 (＞◡＜)',
    '当前额度还很充足哦，放心大胆聊吧~',
    '啊呜啊呜… 刚才的回答味道还不错！',
    '再戳的话… 本喵就要把你的额度全吃掉咯！',
    '右键点我可以配置 Google 免费 AI 吐槽大脑哦~'
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

  chrome.storage.local.get(['geminiPetState', 'petAiConfig'], (res) => {
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
    fillConfigForm();
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

  const host = document.createElement('div');
  host.id = 'gemini-pet-observer-host';
  host.style.cssText = 'position:fixed;bottom:0;right:16px;z-index:2147483647;pointer-events:none;font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      .wrapper { position: relative; display: flex; flex-direction: column; align-items: flex-end; user-select: none; }
      .bubble-container {
        display: flex; flex-direction: column; align-items: center;
        margin-right: 28px; margin-bottom: -6px; pointer-events: auto;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      .bubble-container.hidden { opacity: 0; transform: translateY(10px) scale(0.95); pointer-events: none; }
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

      .pet-stage { position: relative; display: flex; align-items: flex-end; justify-content: flex-end; }
      .voice-bubble {
        position: absolute;
        right: 146px;
        bottom: 28px;
        width: max-content;
        max-width: 240px;
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
        transform: translateX(8px) scale(0.92);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 5;
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
      .voice-bubble.show { opacity: 1; transform: translateX(0) scale(1); }

      .settings-card {
        position: absolute; right: 146px; bottom: 12px; width: 290px;
        background: #ffffff; color: #1f2937;
        border: 3px solid #202a5c; border-radius: 14px;
        padding: 12px 14px; box-shadow: 0 10px 28px rgba(32, 42, 92, 0.28);
        pointer-events: auto; display: none; flex-direction: column; gap: 8px;
        font-size: 12px; z-index: 20;
      }
      .settings-card.open { display: flex; }
      .settings-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #202a5c; font-size: 13px; }
      .preset-row { display: flex; gap: 6px; }
      .preset-btn {
        flex: 1; background: #eef2ff; color: #202a5c; border: 1.5px solid #c7d2fe;
        border-radius: 6px; padding: 4px 6px; font-size: 11px; font-weight: 700;
        cursor: pointer; transition: background 0.15s;
      }
      .preset-btn:hover { background: #e0e7ff; }
      .settings-row { display: flex; flex-direction: column; gap: 3px; }
      .label-line { display: flex; justify-content: space-between; align-items: center; }
      .settings-row label { font-weight: 600; color: #4b5563; font-size: 11.5px; }
      .key-badge { font-size: 10.5px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 99px; }
      .settings-row input[type="text"], .settings-row textarea {
        border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 5px 8px;
        font-size: 11.5px; outline: none; color: #111827; background: #f8fafc;
        font-family: ui-monospace, Consolas, monospace;
      }
      .settings-row textarea { resize: vertical; min-height: 54px; line-height: 1.35; }
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
        width: 138px; height: 138px; pointer-events: auto; cursor: pointer;
        display: flex; align-items: flex-end; justify-content: center; transform-origin: bottom center;
      }
      .pet-box img {
        max-width: 100%; max-height: 100%; object-fit: contain;
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
        <div class="voice-bubble" id="voice-bubble">喵呜~</div>

        <div class="settings-card" id="settings-card">
          <div class="settings-head">
            <span>🐾 AI 实时互动大脑配置</span>
          </div>
          <div class="preset-row">
            <button class="preset-btn" id="preset-google" type="button">填入 Google 免费版</button>
            <button class="preset-btn" id="preset-deepseek" type="button">填入 DeepSeek</button>
          </div>
          <div class="switch-line">
            <span>启用对话与点击实时吐槽</span>
            <input type="checkbox" id="cfg-enabled" />
          </div>
          <div class="settings-row">
            <label>API 接口地址 (OpenAI 兼容)</label>
            <input type="text" id="cfg-url" placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" />
          </div>
          <div class="settings-row">
            <div class="label-line">
              <label>API Keys (每行一个，自动轮询)</label>
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

        <div class="pet-box" id="pet-btn" title="单击戳一戳 · 双击隐藏气泡 · 右键配置 AI 吐槽">
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
  const settingsCardEl = shadow.getElementById('settings-card');

  const cfgEnabledEl = shadow.getElementById('cfg-enabled');
  const cfgUrlEl = shadow.getElementById('cfg-url');
  const cfgKeysEl = shadow.getElementById('cfg-keys');
  const cfgModelEl = shadow.getElementById('cfg-model');
  const keyCountBadgeEl = shadow.getElementById('key-count-badge');
  const testResultEl = shadow.getElementById('test-result');

  function updateKeyBadge() {
    const n = countKeys(cfgKeysEl.value);
    keyCountBadgeEl.textContent = n > 1 ? `${n} 个 Key (轮询)` : `${n} 个 Key`;
  }

  cfgKeysEl.addEventListener('input', updateKeyBadge);

  function fillConfigForm() {
    cfgEnabledEl.checked = Boolean(aiConfig.enabled);
    cfgUrlEl.value = aiConfig.apiUrl ? aiConfig.apiUrl : DEFAULT_AI_CONFIG.apiUrl;
    cfgKeysEl.value = aiConfig.apiKeys ? aiConfig.apiKeys : '';
    cfgModelEl.value = aiConfig.model ? aiConfig.model : DEFAULT_AI_CONFIG.model;
    updateKeyBadge();
  }

  shadow.getElementById('preset-google').addEventListener('click', () => {
    cfgUrlEl.value = PRESETS.google.apiUrl;
    cfgModelEl.value = PRESETS.google.model;
    cfgEnabledEl.checked = true;
  });

  shadow.getElementById('preset-deepseek').addEventListener('click', () => {
    cfgUrlEl.value = PRESETS.deepseek.apiUrl;
    cfgModelEl.value = PRESETS.deepseek.model;
    cfgEnabledEl.checked = true;
  });

  petBtnEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    testResultEl.className = 'test-result';
    fillConfigForm();
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
          testResultEl.className = 'test-result show ok';
          testResultEl.textContent = `✅ 连接成功 (命中 Key #${res.keyIndex}/${res.totalKeys} · ${res.latencyMs}ms) 回复: "${res.reply}"`;
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
      enabled: cfgEnabledEl.checked,
      apiUrl: savedUrl,
      apiKeys: cfgKeysEl.value.trim(),
      model: savedModel
    };
    chrome.storage.local.set({ petAiConfig: aiConfig }, () => {
      settingsCardEl.classList.remove('open');
      playJellyBounce();
      triggerTempExpression('xd', 2200);
      const n = countKeys(aiConfig.apiKeys);
      showVoiceLine(
        aiConfig.enabled ? `AI 大脑已就绪 (${n}个Key轮询中)喵！` : '已切换回本地卖萌词库~',
        3200
      );
    });
  });

  function showVoiceLine(customText, durationMs = 3400) {
    const remainPct = Math.round(state.exactFiveHourPct);
    const dynamicLines = [
      ...CUTE_LINES,
      `现在还剩 ${remainPct}% 额度呢，能量满满喵！`
    ];
    const line = customText ? customText : dynamicLines[Math.floor(Math.random() * dynamicLines.length)];
    voiceBubbleEl.textContent = line;
    voiceBubbleEl.classList.add('show');
    clearTimeout(voiceHideTimer);
    voiceHideTimer = setTimeout(() => {
      voiceBubbleEl.classList.remove('show');
    }, durationMs);
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
    clearTimeout(clickDelayTimer);
    clickDelayTimer = setTimeout(() => {
      playJellyBounce();
      const nextExpr = Math.random() < 0.65 ? 'xd' : 'grin';
      triggerTempExpression(nextExpr, 2400);

      const now = Date.now();
      const hasKeys = countKeys(aiConfig.apiKeys) > 0;
      const canTriggerClickAi = aiConfig.enabled && hasKeys && (now - lastClickAiTime > 5000);

      if (canTriggerClickAi) {
        lastClickAiTime = now;
        showVoiceLine('喵呜？让我想想…', 3000);
        triggerAiPetReaction('click');
      } else {
        showVoiceLine();
      }
    }, 180);
  });

  petBtnEl.addEventListener('dblclick', () => {
    clearTimeout(clickDelayTimer);
    state.bubbleVisible = !state.bubbleVisible;
    bubbleEl.classList.toggle('hidden', !state.bubbleVisible);
    saveState();
    playJellyBounce();
    showVoiceLine(state.bubbleVisible ? '额度面板展开啦~' : '额度面板先藏起来咯！');
  });

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
    const hasKeys = countKeys(aiConfig.apiKeys) > 0;
    let isReady = Boolean(aiConfig.enabled);
    if (!aiConfig.apiUrl) isReady = false;
    if (!hasKeys) isReady = false;

    if (!isReady) {
      if (triggerType === 'reply_done') {
        triggerTempExpression('xd', 2000);
        showVoiceLine('回答生成完毕喵~');
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
        if (res && res.ok && res.text) {
          playJellyBounce();
          const nextMood = res.mood ? res.mood : 'xd';
          triggerTempExpression(nextMood, 4200);
          showVoiceLine(res.text, 5000);
        } else if (res && res.error) {
          showVoiceLine(`⚠️ ${res.error}`, 4500);
        } else if (triggerType === 'reply_done') {
          triggerTempExpression('xd', 2000);
          showVoiceLine('回答生成完毕喵~');
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