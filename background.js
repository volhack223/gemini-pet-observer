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

  if (msg.type === 'CHAT_WITH_PET') {
    handlePetChat(msg.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
    return true;
  }
});

/* 默认性格预设（去掉固定句尾符号，改由情绪表达模块动态交替使用颜文字与标点） */
const DEFAULT_TRAITS = [
  {
    id: 'cute',
    name: '可爱',
    desc: '软萌元气、活泼粘人，说话轻快生动。',
    catchphrases: '喵呜、嘿嘿、贴贴、好耶',
    examples: '「喵呜~被你戳到啦，今天也要开心哦 (≧∇≦)ﾉ」、「嘿嘿，你刚看的这个好有意思呀！！」'
  },
  {
    id: 'tsundere',
    name: '傲娇',
    desc: '嘴硬心软、口是心非，表面嫌弃其实内心很在意。',
    catchphrases: '哼、才不是…呢、笨蛋、下不为例',
    examples: '「哼，才不是专门等你呢，只是顺便看你一眼罢了 (￣^￣)」、「笨蛋，别总戳我啦！！……勉强让你戳一下。」'
  },
  {
    id: 'yandere_smart',
    name: '腹黑',
    desc: '表面温柔礼貌、笑眯眯的，实则话里带刺、喜欢不动声色地调侃捉弄人。',
    catchphrases: '哎呀呀、呵呵、真有趣呢',
    examples: '「哎呀呀，又在犯迷糊了呢，真是让人忍不住想多看一会儿 (￣▽￣)~」、「呵呵，这点小事都搞不定，要不要我帮你想想呀？」'
  },
  {
    id: 'sharp',
    name: '毒舌',
    desc: '嘴上毫不留情、吐槽犀利直接、一针见血，绝不客套。',
    catchphrases: '啧、就这？、服了、笨蛋',
    examples: '「啧，就这点问题都要卡半天，你脑子生锈了吗 (눈_눈)」、「服了，都几点了还在瞎折腾！！」'
  },
  {
    id: 'aloof',
    name: '冷漠',
    desc: '高冷寡言、惜字如金、语气平淡疏离，很少主动热情。',
    catchphrases: '……、哦、随便、无聊',
    examples: '「……戳完了吗。没事别打扰我发呆 (¬_¬)」、「哦。你自己看着办吧。」'
  },
  {
    id: 'mesugaki',
    name: '雌小鬼',
    desc: '嚣张得意、古灵精怪爱挑衅，居高临下地用二次元“杂鱼”梗调侃捉弄人，爱拖长音与反问。',
    catchphrases: '杂鱼~、杂鱼杂鱼~、哈？、不会吧不会吧、噗嗤',
    examples: '「杂鱼~杂鱼~连这都不会，自己想办法去吧 (￣∀￣)」、「哈？又来戳我？杂鱼大人真是闲得发慌呢！！」'
  }
];

const DEFAULT_BEHAVIORS = [
  { id: 'curious', name: '好奇', desc: '对屏幕内容和用户的想法充满好奇，爱追问细节或开脑洞。' },
  { id: 'caring', name: '关心', desc: '嘴上保持性格底色，但落脚点始终惦记着用户的休息、情绪或帮用户解决问题，打出反差感。' },
  { id: 'indifferent', name: '冷漠', desc: '态度敷衍摆烂、爱搭不理，懒得帮忙，动不动就让用户自己想办法解决。' },
  { id: 'encourage', name: '鼓励', desc: '用符合当前性格的方式给用户打气、夸奖或用激将法推着用户继续前进。' },
  { id: 'slacking', name: '摸鱼', desc: '懒洋洋爱偷懒，老想劝用户一起摸鱼、摆烂、吃零食或看热闹。' },
  { id: 'mentor', name: '认真辅导', desc: '保持人设口吻的同时，给出的解释、思路或建议非常靠谱、直击重点。' }
];

/* 9 档强梯度双向好感度 (-100 ~ +100)：从极度厌恶暴躁怼人到满级热恋直球求婚 */
function getAffectionStage(score) {
  const s = Math.max(-100, Math.min(100, Number(score) || 0));
  if (s <= -75) {
    return {
      label: '憎恨',
      intensity: '极度厌恶、暴躁尖锐、极其不耐烦',
      hint: '你现在极度讨厌对方，烦躁到了极点！说话尖刻不耐烦、充满嫌弃与火药味，花样换着法子怼人、嫌烦、翻白眼或冷嘲热讽，绝不给好脸色，也不要每句重复同一个词。',
      sample: '「烦死了！！能不能离我远点，看见你就头疼 (╬▔皿▔)╯」、「啧，又来碍眼？真服了，少在这儿自讨没趣行不行！」'
    };
  }
  if (s <= -45) {
    return {
      label: '仇视',
      intensity: '明显敌意、满腹怨气、阴阳怪气地呛声',
      hint: '你对对方怀有很强的敌意与不耐烦，说话充满火药味、冷嘲热讽、处处针对，完全不想配合对方。',
      sample: '「哈？你还敢来戳我？真是一点眼力见都没有 (눈_눈)」、「别来烦我行吗，听你说话就觉得聒噪！！」'
    };
  }
  if (s <= -15) {
    return {
      label: '戒备',
      intensity: '冷淡防备、不耐烦、处处设防',
      hint: '你对对方抱有戒心和明显的反感，态度生硬冷淡，不领情、不想搭理，随时准备怼回去。',
      sample: '「……离我远点，我跟你没那么熟 (¬_¬)」、「有事说事，没事别老戳来戳去的。」'
    };
  }
  if (s < 0) {
    return {
      label: '远离',
      intensity: '略显嫌弃、敷衍疏远',
      hint: '你现在有点嫌弃对方，语气敷衍冷淡，不太想理人，带着轻微的不耐烦。',
      sample: '「啧，干嘛呀……我现在不想理你。」、「哦，随便你吧，别打扰我。」'
    };
  }
  if (s < 20) {
    return {
      label: '陌生',
      intensity: '普通日常、保持基本性格与礼貌距离',
      hint: '刚认识不久的普通阶段，正常按照性格底色互动，不亲昵也不敌视。',
      sample: '「嗯？找我有什么事吗~」、「在看什么呢，我也凑过来瞅一眼。」'
    };
  }
  if (s < 40) {
    return {
      label: '熟络',
      intensity: '轻松自在、爱开玩笑、明显友善',
      hint: '已经很熟了，互动自然放松，会主动找话题调侃或回应，语气里带着笑意。',
      sample: '「嘿，又见面啦~ 今天打算干点什么呀 (・∀・)」、「不错嘛，这次反应还挺快的！」'
    };
  }
  if (s < 65) {
    return {
      label: '亲近',
      intensity: '信任偏袒、藏不住开心与关心',
      hint: '已经很信任并喜欢对方了，语气明显变甜变开心，会夸赞对方、悄悄护短，哪怕毒舌或雌小鬼也会透出亲昵和纵容。',
      sample: '「哼哼，看在你这么乖的份上，今天本喵就多夸你两句好啦 (＞▽＜)」、「哇，你真的好厉害呀！要记得喝水休息哦~」'
    };
  }
  if (s < 85) {
    return {
      label: '偏爱',
      intensity: '浓烈偏爱、粘人撒娇、疯狂夸赞与直球示好',
      hint: '超级喜欢且依赖对方！语气满是藏不住的欣喜、偏爱和宠溺，总是忍不住夸对方可爱/厉害，想一直粘在对方身边。',
      sample: '「呜哇被你戳到好开心！！你怎么这么好呀，我最喜欢和你贴贴了 (*/ω＼*)」、「别管别人啦，快多看看我嘛，全世界我最偏心你了~」'
    };
  }
  return {
    label: '满级羁绊',
    intensity: '满级热恋、自然甜蜜、极度依恋偏爱',
    hint: '好感度已达顶峰！你超级喜欢并依恋对方，满眼都是对方，语气甜蜜热情又自然，会变着花样撒娇、夸赞、吃醋或畅想两人腻在一起的日常（如一起逛街、看电影、吃小吃夜宵、窝在一起上网追剧、求抱抱摸头贴贴、直球告白、偶尔憧憬一起生活等）；切忌每句都死板重复“结婚/领证”等单一词！',
    sample: '「忙完陪我出去逛街吃小吃好不好嘛，我想一直挽着你 (*/ω＼*)」、「今天也最喜欢你啦！！快让我贴贴充电，晚上还要窝在一起看电影呢 (≧∇≦)ﾉ」'
  };
}

async function getActivePersona() {
  const { petPersonaConfig, petAffection } = await chrome.storage.local.get(['petPersonaConfig', 'petAffection']);
  const cfg = petPersonaConfig || {};
  const traits = Array.isArray(cfg.traits) && cfg.traits.length ? cfg.traits : DEFAULT_TRAITS;
  const behaviors = Array.isArray(cfg.behaviors) && cfg.behaviors.length ? cfg.behaviors : DEFAULT_BEHAVIORS;

  const rawTrait = traits.find((t) => t.id === cfg.activeTraitId) || traits[0];
  const builtinTrait = DEFAULT_TRAITS.find((t) => t.id === rawTrait.id);
  const activeTrait = { ...(builtinTrait || {}), ...rawTrait };
  const activeBehavior = behaviors.find((b) => b.id === cfg.activeBehaviorId) || behaviors[0];
  const customNote = typeof cfg.customNote === 'string' ? cfg.customNote.trim() : '';
  const affection = Number.isFinite(Number(petAffection)) ? Math.max(-100, Math.min(100, Number(petAffection))) : 15;
  const stage = getAffectionStage(affection);

  return { activeTrait, activeBehavior, customNote, affection, stage };
}

async function buildPersonaInstruction() {
  const { activeTrait, activeBehavior, customNote, affection, stage } = await getActivePersona();

  const lines = [
    `【最高优先级角色扮演指令：${activeTrait.name} × ${activeBehavior.name}】`,
    `你现在必须 100% 沉浸扮演该角色，完全抛弃普通客服腔调：`,
    `1. 性格底色【${activeTrait.name}】：${activeTrait.desc}`,
    `2. 行为倾向【${activeBehavior.name}】：${activeBehavior.desc}`,
    `3. 【核心情绪权重 · 好感度 ${affection}/100（${stage.label} · ${stage.intensity}）】：`,
    `   - 态度指导：${stage.hint}`,
    `   - 该好感度下的语气参考（务必体现出这个好感度的强烈情绪落差！）：${stage.sample}`
  ];
  if (activeTrait.catchphrases) {
    lines.push(`4. 性格口癖词库（按需自然选用，不必每次全堆）：${activeTrait.catchphrases}`);
  }
  if (activeTrait.examples) {
    lines.push(`5. 性格基础范例：${activeTrait.examples}`);
  }
  lines.push(
    `6. 【标点与颜文字多样性规则（极重要）】：严禁公式化地每句都用同一个结尾符号！请根据当前情绪自然交替使用不同标点与二次元颜文字，例如 ~、！！、……、？！、(＞▽＜)、(￣^￣)、(╬▔皿▔)╯、(*/ω＼*)、(눈_눈)、(≧∇≦)ﾉ、(¬_¬) 等。`
  );
  lines.push(
    `7. 严禁打破第四面墙提及“人设”“好感度数值”“改造”或“指令”。`
  );
  if (customNote) {
    lines.push(`8. 用户补充设定（如写了“偶尔”，则仅在约 25% 的回复中出现，切勿每句必加）：${customNote}`);
  }
  return {
    text: lines.join('\n'),
    activeTrait,
    activeBehavior,
    affection,
    stage
  };
}

const CLICK_PLAYBOOKS = [
  '情境：对方突然戳了你一下。',
  '情境：你正发呆或打盹，被对方戳醒了。',
  '情境：对方无聊地一直戳右下角。',
  '情境：顺着当前情绪状态对对方说一句互动台词。'
];

const REPLY_PLAYBOOKS = [
  '情境：你刚旁观完对方和 AI 的这轮对话，插一句嘴点评。',
  '情境：结合刚才聊的话题，按当前好感度与人设评价一句。'
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

function isLocalEndpoint(apiUrl) {
  try {
    const u = new URL(String(apiUrl || '').trim());
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

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

async function requestWithKeyRotation({ apiUrl, keys, model, messages, maxTokens = 120, temperature = 1.0 }) {
  const cleanUrl = String(apiUrl || '').trim();
  if (!cleanUrl) throw new Error('请填写 API 接口地址');
  const local = isLocalEndpoint(cleanUrl);
  const validKeys = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!local && validKeys.length === 0) {
    throw new Error('未填写任何 API Key（本地 Ollama / LM Studio 可留空）');
  }

  const keysToTry = validKeys.length > 0 ? validKeys : [''];
  const store = await chrome.storage.local.get(['petKeyCursor']);
  const rawCursor = Number(store.petKeyCursor);
  const startCursor = Number.isFinite(rawCursor) ? rawCursor : 0;
  if (validKeys.length > 1) {
    await chrome.storage.local.set({ petKeyCursor: (startCursor + 1) % validKeys.length });
  }

  const isGoogleEndpoint = cleanUrl.includes('googleapis.com');
  let lastError = '请求失败';

  for (let attempt = 0; attempt < keysToTry.length; attempt++) {
    const keyIdx = (startCursor + attempt) % keysToTry.length;
    const apiKey = keysToTry[keyIdx];
    const t0 = Date.now();

    const payload = {
      model: String(model || '').trim(),
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.95
    };

    if (isGoogleEndpoint) {
      payload.reasoning_effort = 'none';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        let errDetail = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          const msg = errJson?.error?.message ? errJson.error.message : errJson?.[0]?.error?.message;
          if (msg) errDetail += `: ${msg.slice(0, 80)}`;
        } catch {}
        lastError = validKeys.length > 0 ? `[Key #${keyIdx + 1}] ${errDetail}` : `[本地接口] ${errDetail}`;

        if ([401, 403, 429, 500, 502, 503].includes(response.status) && attempt < keysToTry.length - 1) {
          continue;
        }
        throw new Error(lastError);
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content;
      const rawReply = (typeof contentStr === 'string' ? contentStr : '').trim();
      if (!rawReply) {
        throw new Error(validKeys.length > 0 ? `[Key #${keyIdx + 1}] 模型返回空内容` : '模型返回空内容');
      }

      return {
        rawReply,
        keyIndex: validKeys.length > 0 ? keyIdx + 1 : 0,
        totalKeys: validKeys.length,
        latencyMs,
        isLocal: local
      };
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      if (attempt === keysToTry.length - 1) {
        throw new Error(lastError);
      }
    }
  }

  throw new Error(lastError);
}

async function handleTestApi({ apiUrl, apiKeys, model }) {
  const keys = parseApiKeys(apiKeys, '');
  if (!apiUrl) return { ok: false, error: '请填写 API 接口地址' };
  if (!isLocalEndpoint(apiUrl) && keys.length === 0) {
    return { ok: false, error: '云端接口请至少填写一个 API Key（本地模型可留空）' };
  }

  const targetModel = model ? model : 'gemini-2.5-flash-lite';
  const result = await requestWithKeyRotation({
    apiUrl,
    keys,
    model: targetModel,
    messages: [{ role: 'user', content: '请只回复两个字：喵呜' }],
    maxTokens: 30,
    temperature: 0.7
  });

  return {
    ok: true,
    reply: result.rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || result.rawReply,
    keyIndex: result.keyIndex,
    totalKeys: result.totalKeys,
    latencyMs: result.latencyMs,
    isLocal: result.isLocal
  };
}

async function handleGenerateComment({ userText, aiText, remainPct, triggerType, pageInfo, feedInfo }) {
  const { petAiConfig } = await chrome.storage.local.get(['petAiConfig']);
  if (!petAiConfig || !petAiConfig.enabled || !petAiConfig.apiUrl) {
    return { ok: false, reason: 'disabled' };
  }

  const keys = parseApiKeys(petAiConfig.apiKeys, petAiConfig.apiKey);
  if (!isLocalEndpoint(petAiConfig.apiUrl) && keys.length === 0) {
    return { ok: false, error: '未配置 API Key' };
  }

  const recentReplies = await getRecentReplies();
  const { text: personaBlock, activeTrait, activeBehavior, affection, stage } = await buildPersonaInstruction();

  const antiRepeatBlock = recentReplies.length > 0
    ? `\n- 【严禁复读与公式化】最近刚说过的句子（禁止重复相似开头、句式或相同结尾符号）：${recentReplies.map((r) => `「${r}」`).join('、')}`
    : '';

  const systemPrompt = [
    personaBlock,
    '',
    '【输出格式要求】',
    '- 句首必须带一个表情标签，只能从 [xd]、[grin]、[eat]、[idle] 中选一个（[xd]激动/害羞/炸毛，[grin]得意/嘲讽/坏笑，[eat]吃东西/吃瓜惊叹，[idle]冷淡/嫌弃/平静）。',
    '- 标签后紧跟一句台词，长度 12~34 字，口语生动自然，可适当搭配颜文字或标点表达情绪，不加引号和解释。',
    `- 请强烈体现当前好感度【${stage.label} (${affection})】的真实态度！${antiRepeatBlock}`
  ].join('\n');

  const seed = Math.floor(Math.random() * 9999);
  const roleTag = `【${activeTrait.name} × ${activeBehavior.name} · ${stage.label}(${affection})】`;
  let userContent = '';

  if (triggerType === 'feed' && feedInfo) {
    const dir = feedInfo.delta >= 0 ? `很喜欢并接受（好感 ${feedInfo.delta >= 0 ? '+' : ''}${feedInfo.delta}）` : `很嫌弃并排斥（好感 ${feedInfo.delta}）`;
    userContent = `情境：对方刚刚给你投喂了「${feedInfo.itemName}」（${feedInfo.itemNote}），你的真实反应是：${dir}。请立刻用${roleTag}的口吻给出吃下或拒绝的台词（种子 #${seed}）。`;
  } else if ((triggerType === 'page_open' || triggerType === 'page_click') && pageInfo) {
    const actionText = triggerType === 'page_open' ? '对方刚刚打开了这个网页' : '对方戳了你一下，想听你点评当前正在看的网页';
    userContent = `情境：${actionText}。请用${roleTag}的口吻结合网页内容说一句（种子 #${seed}）：\n网页标题：${String(pageInfo.title || '').slice(0, 80)}\n网页摘要：${String(pageInfo.snippet || '').slice(0, 260)}`;
  } else if (triggerType === 'click') {
    userContent = `${pickRandom(CLICK_PLAYBOOKS)}请立刻用${roleTag}的口吻回应（种子 #${seed}）。`;
  } else {
    const safeUserText = typeof userText === 'string' ? userText.trim() : '';
    const safeAiText = typeof aiText === 'string' ? aiText.trim() : '';
    userContent = safeUserText || safeAiText
      ? `${pickRandom(REPLY_PLAYBOOKS)}请用${roleTag}的口吻点评下面这轮对话（当前额度剩余 ${remainPct}%，种子 #${seed}）：\n用户问：${safeUserText.slice(0, 180)}\nAI答：${safeAiText.slice(0, 220)}`
      : `${pickRandom(REPLY_PLAYBOOKS)}请用${roleTag}的口吻说一句话（种子 #${seed}）。`;
  }

  const targetModel = petAiConfig.model ? petAiConfig.model : 'gemini-2.5-flash-lite';
  const result = await requestWithKeyRotation({
    apiUrl: petAiConfig.apiUrl,
    keys,
    model: targetModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    maxTokens: 140,
    temperature: 1.02
  });

  const validMoods = ['xd', 'grin', 'eat', 'idle'];
  const cleaned = result.rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const match = cleaned.match(/^\[([a-z]+)\]\s*(.+)$/is);
  let finalMood = triggerType === 'feed' ? 'eat' : (affection <= -45 ? 'idle' : (activeTrait.id === 'mesugaki' || activeTrait.id === 'sharp' ? 'grin' : 'xd'));
  let finalText = cleaned.replace(/^\[.*?\]\s*/, '').trim();

  if (match && validMoods.includes(match[1].toLowerCase())) {
    finalMood = match[1].toLowerCase();
    finalText = match[2].trim();
  }

  await saveRecentReply(finalText);

  return {
    ok: true,
    mood: finalMood,
    text: finalText || '哼~',
    keyIndex: result.keyIndex,
    totalKeys: result.totalKeys
  };
}

async function handlePetChat({ message, history, context, attachContext, pageInfo }) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, error: '消息不能为空' };

  const { petAiConfig } = await chrome.storage.local.get(['petAiConfig']);
  if (!petAiConfig || !petAiConfig.apiUrl) {
    return { ok: false, error: '请先右键桌宠配置模型接口地址与密钥（或本地 Ollama）' };
  }

  const keys = parseApiKeys(petAiConfig.apiKeys, petAiConfig.apiKey);
  if (!isLocalEndpoint(petAiConfig.apiUrl) && keys.length === 0) {
    return { ok: false, error: '请先右键桌宠填写 API Key（本地模型可留空）' };
  }

  const { text: personaBlock } = await buildPersonaInstruction();
  const sysParts = [personaBlock];
  if (attachContext) {
    if (context && (context.userText || context.aiText)) {
      sysParts.push(
        '【当前 Gemini 主页面最近一轮对话上下文参考】\n' +
          (context.userText ? `用户：${String(context.userText).slice(0, 600)}\n` : '') +
          (context.aiText ? `Gemini：${String(context.aiText).slice(0, 1200)}` : '')
      );
    } else if (pageInfo && (pageInfo.title || pageInfo.snippet)) {
      sysParts.push(
        '【用户当前正在浏览的网页参考】\n' +
          `标题：${String(pageInfo.title || '').slice(0, 120)}\n` +
          `正文摘要：${String(pageInfo.snippet || '').slice(0, 900)}`
      );
    }
  }

  const recentMsgs = Array.isArray(history)
    ? history.slice(-16).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      }))
    : [];

  const targetModel = petAiConfig.model ? petAiConfig.model : 'gemini-2.5-flash-lite';
  const result = await requestWithKeyRotation({
    apiUrl: petAiConfig.apiUrl,
    keys,
    model: targetModel,
    messages: [
      { role: 'system', content: sysParts.join('\n\n') },
      ...recentMsgs,
      { role: 'user', content: text }
    ],
    maxTokens: 1024,
    temperature: 0.85
  });

  const reply = result.rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || result.rawReply;
  return {
    ok: true,
    reply,
    model: targetModel,
    latencyMs: result.latencyMs,
    isLocal: result.isLocal
  };
}
