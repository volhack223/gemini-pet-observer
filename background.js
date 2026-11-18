chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GENERATE_PET_COMMENT') {
    handleGenerateComment(msg.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
    return true;
  }

  if (msg.type === 'TEST_PET_API') {
    handleTestApi(msg.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
    return true;
  }
});

/* 每次点击随机抽取一种反应剧本，彻底打破复读 */
const CLICK_PLAYBOOKS = [
  '【剧本：被戳痒了】假装被戳到了怕痒的部位，笑得喘不过气并求饶。',
  '【剧本：装睡被吵醒】迷迷糊糊刚打盹就被戳醒，带着起床气软萌抗议。',
  '【剧本：讨要零食】借机向主人撒娇讨要小鱼干、布丁或电子零食。',
  '【剧本：一本正经小管家】突然切换成严肃专业的秘书口吻汇报当前状态。',
  '【剧本：中二病发作】用夸张的中二台词宣称自己封印着强大的算力能量。',
  '【剧本：反客为主】调皮地反问主人是不是摸鱼太久、太无聊才一直戳你。',
  '【剧本：好奇宝宝】歪着头好奇主人为什么总喜欢戳右下角，询问是不是觉得你很Q弹。',
  '【剧本：害羞脸红】被戳得不知所措，结结巴巴地掩饰自己的害羞。',
  '【剧本：偷吃被抓包】假装嘴角还沾着刚才偷吃的 Token 碎屑，心虚地转移话题。',
  '【剧本：加油打气】元气满满地给主人加油鼓劲，夸主人今天也很厉害。',
  '【剧本：神秘预言家】装作掐指一算，调侃主人接下来要问一个超厉害的问题。',
  '【剧本：傲娇嘴硬】嘴上说着“才不稀罕被你戳呢”，语气却明显很开心。',
  '【剧本：话题联想】如果下方有聊天内容，顺着聊天里的某个关键词开个小玩笑；没有就吐槽空气太安静。',
  '【剧本：模仿回声】学着主人的节奏哼哼唧唧，像一只粘人的小猫。'
];

/* 对话结束旁观时的随机切入角度 */
const REPLY_PLAYBOOKS = [
  '【视角：崇拜夸夸】对刚才的对话内容表示惊叹或崇拜。',
  '【视角：吃瓜群众】像在电影院吃爆米花一样津津有味地围观刚才的问答。',
  '【视角：硬核吐槽】用轻松幽默的口吻调侃刚才聊的话题太烧脑或太有趣。',
  '【视角：贴心提醒】结合刚才的对话长度，顺便关心一下主人的眼睛或剩余额度。',
  '【视角：脑洞延伸】针对刚才聊到的内容，提出一个可爱又奇特的小联想。',
  '【视角：干饭模式】表示刚才那波输出味道真香，吃得很满足。'
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseApiKeys(rawKeys, fallbackSingleKey) {
  const source = rawKeys ? rawKeys : (fallbackSingleKey ? fallbackSingleKey : '');
  return String(source)
    .split(/[\r\n,，;；]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/* 记录最近生成的台词，防止短期重复 */
async function getRecentReplies() {
  const store = await chrome.storage.local.get(['petRecentReplies']);
  return Array.isArray(store.petRecentReplies) ? store.petRecentReplies : [];
}

async function saveRecentReply(newText) {
  if (!newText) return;
  const list = await getRecentReplies();
  const updated = [newText, ...list.filter((item) => item !== newText)].slice(0, 6);
  await chrome.storage.local.set({ petRecentReplies: updated });
}

/* 带多 Key 轮询与自动故障转移的请求函数 */
async function requestWithKeyRotation({ apiUrl, keys, model, messages, maxTokens = 120, temperature = 1.0 }) {
  if (!Array.isArray(keys)) {
    throw new Error('未填写任何 API Key');
  }
  if (keys.length === 0) {
    throw new Error('未填写任何 API Key');
  }

  const store = await chrome.storage.local.get(['petKeyCursor']);
  const rawCursor = Number(store.petKeyCursor);
  const startCursor = Number.isFinite(rawCursor) ? rawCursor : 0;
  await chrome.storage.local.set({ petKeyCursor: (startCursor + 1) % keys.length });

  const cleanUrl = apiUrl.trim();
  const isGoogleEndpoint = cleanUrl.includes('googleapis.com');
  let lastError = '请求失败';

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startCursor + attempt) % keys.length;
    const apiKey = keys[keyIdx];
    const t0 = Date.now();

    const payload = {
      model: model.trim(),
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.95
    };

    /* 针对 Google 接口强制关闭后台推理链，大幅降低首字延迟 */
    if (isGoogleEndpoint) {
      payload.reasoning_effort = 'none';
    }

    try {
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        let errDetail = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          const msg = errJson?.error?.message ? errJson.error.message : errJson?.[0]?.error?.message;
          if (msg) {
            errDetail += `: ${msg.slice(0, 60)}`;
          }
        } catch {}
        lastError = `[Key #${keyIdx + 1}] ${errDetail}`;

        if ([401, 403, 429, 500, 502, 503].includes(response.status) && attempt < keys.length - 1) {
          continue;
        }
        throw new Error(lastError);
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content;
      const rawReply = (typeof contentStr === 'string' ? contentStr : '').trim();
      if (!rawReply) {
        throw new Error(`[Key #${keyIdx + 1}] 模型返回空内容`);
      }

      return {
        rawReply,
        keyIndex: keyIdx + 1,
        totalKeys: keys.length,
        latencyMs
      };
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      if (attempt === keys.length - 1) {
        throw new Error(lastError);
      }
    }
  }

  throw new Error(lastError);
}

/* 测试连通性专用接口 */
async function handleTestApi({ apiUrl, apiKeys, model }) {
  const keys = parseApiKeys(apiKeys, '');
  if (!apiUrl) {
    return { ok: false, error: '请填写 API 接口地址' };
  }
  if (keys.length === 0) {
    return { ok: false, error: '请至少填写一个 API Key' };
  }

  const targetModel = model ? model : 'gemini-3.1-flash-lite';
  const result = await requestWithKeyRotation({
    apiUrl,
    keys,
    model: targetModel,
    messages: [
      { role: 'user', content: '请只回复两个字：喵呜' }
    ],
    maxTokens: 30,
    temperature: 0.7
  });

  return {
    ok: true,
    reply: result.rawReply,
    keyIndex: result.keyIndex,
    totalKeys: result.totalKeys,
    latencyMs: result.latencyMs
  };
}

/* 正常生成互动吐槽 */
async function handleGenerateComment({ userText, aiText, remainPct, triggerType }) {
  const { petAiConfig } = await chrome.storage.local.get(['petAiConfig']);
  if (!petAiConfig) {
    return { ok: false, reason: 'disabled' };
  }
  if (!petAiConfig.enabled) {
    return { ok: false, reason: 'disabled' };
  }
  if (!petAiConfig.apiUrl) {
    return { ok: false, reason: 'disabled' };
  }

  const keys = parseApiKeys(petAiConfig.apiKeys, petAiConfig.apiKey);
  if (keys.length === 0) {
    return { ok: false, error: '未配置 API Key' };
  }

  const isClick = triggerType === 'click';
  const chosenPlaybook = isClick ? pickRandom(CLICK_PLAYBOOKS) : pickRandom(REPLY_PLAYBOOKS);
  const recentReplies = await getRecentReplies();

  const antiRepeatBlock = recentReplies.length > 0
    ? `\n4. 【严禁复读】你最近刚刚说过以下这些话，本次绝对禁止使用相同的开头或相似句式：\n${recentReplies.map((r) => `   - ${r}`).join('\n')}`
    : '';

  const sceneInstruction = isClick
    ? `触发场景：用户刚刚用鼠标“戳”了你一下！请严格按照本次指定的随机剧本演绎：${chosenPlaybook}`
    : `触发场景：用户刚刚和AI完成了一轮对话，你作为桌面宠物在旁边围观，请按照本次视角点评一句：${chosenPlaybook}`;

  const systemPrompt = [
    '你是一个常驻在用户浏览器右下角的Q版猫娘桌面宠物，性格灵动多变、古灵精怪。',
    sceneInstruction,
    '严格遵守以下输出格式：',
    '1. 必须在句首用方括号输出一个最贴合当前语境的表情标签，只能从 [xd]、[grin]、[eat]、[idle] 中选一个（[xd]表示开心激动/害羞，[grin]表示调皮偷笑，[eat]表示吃瓜惊叹，[idle]表示日常卖萌）。',
    '2. 标签后面紧跟台词正文，长度控制在 12 到 24 个汉字之间，自然口语化，不要加引号或任何解释。',
    `3. 当前账号剩余额度为 ${remainPct}%（除非剧本要求，否则不要每句都提额度数字）。${antiRepeatBlock}`
  ].join('\n');

  const safeUserText = typeof userText === 'string' ? userText.trim() : '';
  const safeAiText = typeof aiText === 'string' ? aiText.trim() : '';
  const hasContext = Boolean(safeUserText) ? true : Boolean(safeAiText);
  const userContent = hasContext
    ? `当前聊天上下文参考（随机种子 #${Math.floor(Math.random() * 9999)}）：\n用户问：${safeUserText.slice(0, 200)}\nAI答：${safeAiText.slice(0, 240)}`
    : `（当前是空白对话页面，随机种子 #${Math.floor(Math.random() * 9999)}）`;

  const targetModel = petAiConfig.model ? petAiConfig.model : 'gemini-3.1-flash-lite';
  const result = await requestWithKeyRotation({
    apiUrl: petAiConfig.apiUrl,
    keys,
    model: targetModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    maxTokens: 120,
    temperature: isClick ? 1.1 : 0.95
  });

  const validMoods = ['xd', 'grin', 'eat', 'idle'];
  const match = result.rawReply.match(/^\[([a-z]+)\]\s*(.+)$/i);
  let finalMood = 'xd';
  let finalText = result.rawReply.replace(/^\[.*?\]\s*/, '').trim();

  if (match && validMoods.includes(match[1].toLowerCase())) {
    finalMood = match[1].toLowerCase();
    finalText = match[2].trim();
  }

  await saveRecentReply(finalText);

  return {
    ok: true,
    mood: finalMood,
    text: finalText,
    keyIndex: result.keyIndex,
    totalKeys: result.totalKeys
  };
}