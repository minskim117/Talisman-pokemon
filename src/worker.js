// Cloudflare Worker: public/ 정적 자산 + /api/* (사주 풀이, 부적 이미지)
// 무료 플랜은 요청당 CPU 10ms 라서, 수 MB 짜리 이미지 응답은 파싱하지 않고 그대로 흘려보낸다.
// (fetch 를 기다리는 시간은 CPU 시간에 포함되지 않는다)
import { computeSaju } from './saju.js';
import { candidatesFor, pokemonDetail, weakestElement } from './pokemon.js';
import KoreanLunarCalendar from 'korean-lunar-calendar';

const OPENAI = 'https://api.openai.com/v1';

// ---- IP 당 하루 생성 횟수 제한 ----
// A 방식(포켓몬 그려 넣기) 성공만 1회로 센다. B 방식·실패는 세지 않는다.
// 하루는 한국 시간 자정 기준. 관리자 IP(secret ADMIN_IPS)는 제한 없음.
const DAILY_LIMIT = 5;

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function isAdmin(request, env) {
  const admins = String(env.ADMIN_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return admins.includes(clientIp(request));
}

function usageKey(request) {
  const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return `usage:${kstDate}:${clientIp(request)}`;
}

// 남은 횟수 (관리자는 null = 무제한)
async function remainingToday(request, env) {
  if (isAdmin(request, env)) return null;
  const used = Number(await env.USAGE.get(usageKey(request))) || 0;
  return Math.max(0, DAILY_LIMIT - used);
}

async function countUsage(request, env) {
  if (isAdmin(request, env)) return;
  const key = usageKey(request);
  const used = Number(await env.USAGE.get(key)) || 0;
  // 이틀 뒤 자동 삭제 (KV 최소 보관 시간 60초 이상)
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 2 * 24 * 3600 });
}

function limitReached() {
  return json({ error: `부적은 하루 ${DAILY_LIMIT}번까지 받을 수 있어요. 내일 다시 와주세요.`, remaining: 0 }, 429);
}

const BASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    talismanName: { type: 'string', description: '부적 이름 (한글, 예: 재물운 상승 부적)' },
    summary: { type: 'string', description: '한 줄 요약' },
    personalityReading: { type: 'string', description: '타고난 기운으로 본 성격 해석 2문장, 공백 포함 85자 이내 (화면에서 3줄)' },
    lackingEnergy: { type: 'string', description: '성격 풀이 바로 뒤에 이어지는 글. 가장 부족한 오행이 무엇이고, 그 기운이 부족해서 생기기 쉬운 모습 1~2문장' },
    fillEffect: { type: 'string', description: '반드시 "수호 포켓몬 <한국어 이름>의"로 시작해서, 그 포켓몬의 기운이 부족한 기운을 채워 주는 좋은 효과 1~2문장' },
    visual: {
      type: 'object',
      additionalProperties: false,
      description: '이미지 생성용 영어 묘사',
      properties: {
        symbols: { type: 'string', description: 'English: talisman motifs only (plants, elements, seals). Do not mention the guardian, any Pokémon, character or franchise name' },
        mood: { type: 'string', description: 'English: overall energy/mood' },
      },
      required: ['symbols', 'mood'],
    },
  },
  required: [
    'talismanName', 'summary', 'personalityReading', 'lackingEnergy', 'fillEffect', 'visual',
  ],
};

// 후보 포켓몬 중에서만 고르도록 enum으로 묶는다
function readingSchema(candidates) {
  return {
    ...BASE_SCHEMA,
    properties: {
      ...BASE_SCHEMA.properties,
      pokemon: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', enum: candidates.map((c) => c.name), description: '후보 중 이 사람에게 가장 어울리는 포켓몬' },
          reason: { type: 'string', description: '이 포켓몬이 부족한 기운을 채워주는 이유 1문장, 40자 이내' },
        },
        required: ['name', 'reason'],
      },
    },
    required: [...BASE_SCHEMA.required, 'pokemon'],
  };
}

// 부족한 오행 한 글자를 부적 중앙에 크게 쓰고, 그 오행의 색을 메인 색으로 쓴다
const ELEMENTS = {
  목: { hanja: '木', ink: 'vivid leaf green', palette: 'fresh leaf green, jade and clover green with bright spring-sky accents' },
  화: { hanja: '火', ink: 'blazing crimson red', palette: 'blazing crimson, vermilion and fiery orange with sunset gold glow' },
  토: { hanja: '土', ink: 'rich earthy brown', palette: 'warm earthy brown, ochre and sunflower yellow with sandstone tones' },
  금: { hanja: '金', ink: 'shining metallic gold', palette: 'shining gold, platinum silver and pearl white with crystal sparkle' },
  수: { hanja: '水', ink: 'deep ocean blue', palette: 'clear ocean blue, aqua and sky blue with white water sparkle' },
};

const ARTWORK_PREFIX = 'https://raw.githubusercontent.com/PokeAPI/sprites/';

function describeSaju(s) {
  const pillars = [
    `년주 ${s.year.hangul}(${s.year.hanja})`,
    `월주 ${s.month.hangul}(${s.month.hanja})`,
    `일주 ${s.day.hangul}(${s.day.hanja})`,
    s.hour ? `시주 ${s.hour.hangul}(${s.hour.hanja})` : '시주 모름',
  ].join(', ');
  const elements = Object.entries(s.elementCounts).map(([k, v]) => `${k} ${v}`).join(', ');
  return `${pillars}\n일간: ${s.dayMaster}\n띠: ${s.animal}\n오행 분포: ${elements}`;
}

// 한국어 글에 영문 포켓몬 이름이 섞이면 한국어 공식 이름으로 바꾼다 (visual, pokemon.name 제외)
function koreanNames(reading, candidates) {
  const toKo = (text) => candidates.reduce((t, c) => {
    const words = [c.name, c.name.split('-')[0]].filter((n) => n.length >= 4).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return t.replace(new RegExp(`\\b(${words.join('|')})\\b`, 'gi'), c.ko);
  }, text);
  for (const key of ['talismanName', 'summary', 'personalityReading', 'lackingEnergy', 'fillEffect']) {
    reading[key] = toKo(reading[key]);
  }
  reading.pokemon.reason = toKo(reading.pokemon.reason);
  return reading;
}

// 이미지 프롬프트에 캐릭터 이름이 들어가면 거절되기 쉬워서 일반 표현으로 바꾼다
function stripNames(text, pokemon) {
  const names = [pokemon?.name, pokemon?.name?.split('-')[0], pokemon?.koName, 'pokémon', 'pokemon', '포켓몬']
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return String(text || '').replace(new RegExp(names.join('|'), 'gi'), 'guardian spirit');
}

// 포켓몬별 A/B 결과. 파일 대신 로그로 남겨 `npx wrangler tail` 이나 대시보드 Workers Logs 에서 본다
function logGuardian(pokemon, element, mode, error) {
  console.log(JSON.stringify({
    event: 'guardian',
    element,
    id: pokemon?.id,
    name: pokemon?.name,
    koName: pokemon?.koName,
    mode,
    ...(error && { error }),
  }));
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function openaiError(res) {
  const body = await res.json().catch(() => ({}));
  return new ApiError(res.status, body.error?.message || `OpenAI 요청 실패 (${res.status})`);
}

// Responses API 의 응답에서 텍스트만 꺼낸다 (SDK 의 output_text 와 같음)
function outputText(body) {
  return (body.output || [])
    .flatMap((item) => item.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
}

// 음력 생일을 양력으로 바꾼다 (한국천문연구원 기준 음력표). 없는 날짜면 null
// 윤달 여부는 받지 않으므로 평달로 보고, 평달에 없는 날짜(예: 윤달에만 있는 30일)일 때만 윤달로 계산한다
function lunarToSolar(date) {
  const [y, m, d] = date.split('-').map(Number);
  const cal = new KoreanLunarCalendar();
  if (!cal.setLunarDate(y, m, d, false) && !cal.setLunarDate(y, m, d, true)) return null;
  const s = cal.getSolarCalendar();
  return `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
}

async function handleReading(request, env) {
  // 풀이 비용도 아끼도록, 오늘 횟수를 다 썼으면 풀이 전에 막는다
  const remaining = await remainingToday(request, env);
  if (remaining === 0) return limitReached();
  const { birthDate, birthTime, calendar } = await request.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) {
    return json({ error: '생년월일을 입력해주세요.' }, 400);
  }
  const lunar = calendar === 'lunar';
  const solarDate = lunar ? lunarToSolar(birthDate) : birthDate;
  if (!solarDate) {
    return json({ error: `음력 ${birthDate}은(는) 없는 날짜예요. 날짜를 확인해주세요.` }, 400);
  }
  const birthLabel = lunar ? `음력 ${birthDate} = 양력 ${solarDate}` : `양력 ${birthDate}`;

  const saju = computeSaju(solarDate, birthTime);
  const element = weakestElement(saju.elementCounts);
  const candidates = candidatesFor(element);
  const res = await fetch(`${OPENAI}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.TEXT_MODEL,
      instructions:
        '당신은 명리학에 밝은 따뜻한 부적 술사입니다. 주어진 사주 팔자(오행의 과다/부족, 일간, 띠)로 타고난 기질과 성격을 분석해 ' +
        '이 사람에게 지금 가장 필요한 부적 하나를 처방하세요. 부족한 오행을 보완하거나 과한 기운을 다스리는 방향으로 근거를 대고, ' +
        '말투는 친근하고 긍정적으로. ' +
        '일간, 천간, 지지, 경금·기토 같은 간지 이름, 상생·상극, 비겁·식상 같은 어려운 명리 용어는 쓰지 말고, ' +
        '나무(목)·불(화)·흙(토)·쇠(금)·물(수) 기운처럼 누구나 이해할 쉬운 말로 풀어 쓰세요. 의학·법률·투자 조언은 하지 마세요. 한국어로 답하되 visual 필드만 영어로 쓰세요. ' +
        '부족한 오행을 채워줄 수호 포켓몬도 후보 중에서 하나 골라, 효과 설명에 자연스럽게 녹여주세요. ' +
        '한국어 글에서 포켓몬은 반드시 한국어 공식 이름(후보 목록의 괄호 앞 이름)으로만 쓰고, 영어 이름은 pokemon.name 필드에만 쓰세요.',
      input:
        `생년월일: ${birthLabel}${birthTime ? ` ${birthTime}` : ''}\n` +
        `\n[계산된 사주]\n${describeSaju(saju)}\n` +
        `가장 부족한 오행: ${element}\n` +
        `수호 포켓몬 후보(${element} 기운, 한국어 이름(영문)): ${candidates.map((c) => `${c.ko}(${c.name})`).join(', ')}`,
      text: { format: { type: 'json_schema', name: 'talisman_reading', schema: readingSchema(candidates), strict: true } },
    }),
  });
  if (!res.ok) throw await openaiError(res);

  const reading = koreanNames(JSON.parse(outputText(await res.json())), candidates);
  // 부적의 힘은 "수호 포켓몬 ○○의 …" 부분부터만 보여준다
  const from = reading.fillEffect.indexOf('수호 포켓몬');
  if (from > 0) reading.fillEffect = reading.fillEffect.slice(from);
  const pokemon = { ...(await pokemonDetail(reading.pokemon.name)), element, reason: reading.pokemon.reason };
  return json({ saju, reading, pokemon, element: { name: element, ...ELEMENTS[element] }, birth: { label: birthLabel, solar: solarDate }, remaining });
}

// 이미지 응답은 OpenAI JSON 을 그대로 흘려보내고, A/B 결과는 헤더로 알린다
function passImage(res, mode) {
  return new Response(res.body, {
    headers: { 'Content-Type': 'application/json', 'X-Talisman-Mode': mode },
  });
}

async function handleImage(request, env) {
  const { reading, pokemon, element } = await request.json().catch(() => ({}));
  const el = ELEMENTS[element];
  if (!reading?.visual || !el) return json({ error: '부적 정보가 없습니다.' }, 400);
  // /api/image 를 직접 부르는 경우도 막는다
  if (await remainingToday(request, env) === 0) return limitReached();

  const clean = (t) => stripNames(t, pokemon);
  const prompt = [
    'Use case: stylized-concept',
    'Asset type: personal Korean talisman (bujeok) card shown in a fortune web app',
    `Primary request: a traditional Korean bujeok talisman meant to bring "${clean(reading.summary)}"`,
    'Scene/backdrop: a single vertical talisman paper filling the frame on a dark, softly lit surface',
    `Subject: hand-painted talisman with ${clean(reading.visual.symbols)}`,
    `Style/medium: Korean talisman, ${el.ink} brush ink on pale hanji paper tinted with ${el.ink}, elegant calligraphic seal patterns`,
    'Composition/framing: centered, vertical, symmetrical, full talisman visible with a small margin; one huge character in the upper center',
    `Lighting/mood: ${clean(reading.visual.mood)}, radiant glow and sparkles around the character`,
    `Color palette: ${el.palette}; ${el.ink} is the dominant color of the whole image`,
    'Materials/textures: fibrous hanji texture, slightly uneven ink bleed, subtle glossy highlights',
    `Text (verbatim): exactly one Chinese character "${el.hanja}" in the upper center, very large, bold brush calligraphy rendered as a glossy glowing 3D emblem in ${el.ink} with a light outline; no other characters or text anywhere`,
    'Constraints: no modern objects, no Latin letters, no watermark, no frame borders other than the talisman itself',
  ].join('\n');
  const auth = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };

  const artworkUrl = String(pokemon?.artwork || '');
  const artRes = artworkUrl.startsWith(ARTWORK_PREFIX) ? await fetch(artworkUrl) : null;
  const artwork = artRes?.ok ? await artRes.blob() : null;

  // A: 포켓몬 일러스트를 참고 이미지로 부적 안에 그려 넣는다
  if (artwork) {
    const form = new FormData();
    form.append('model', env.IMAGE_MODEL);
    form.append('image', new File([artwork], 'guardian.png', { type: 'image/png' }));
    form.append('prompt', `${prompt}\n` +
      'Input images: Image 1: reference for the guardian creature design only\n' +
      'Guardian: redraw the creature from Image 1 as the talisman\'s guardian spirit, in the lower half of the paper, ' +
      `painted in the same ${el.ink} brush ink style with soft highlights, keeping its recognizable silhouette and features, ` +
      'surrounded by the talisman seal patterns');
    form.append('size', env.IMAGE_SIZE);
    form.append('quality', env.IMAGE_QUALITY);
    const res = await fetch(`${OPENAI}/images/edits`, { method: 'POST', headers: auth, body: form });
    if (res.ok) {
      logGuardian(pokemon, element, 'drawn');
      await countUsage(request, env); // A 성공만 1회 차감
      return passImage(res, 'drawn');
    }
    const err = await openaiError(res);
    // 키 오류나 한도 초과는 B로 넘겨도 똑같이 실패하므로 그대로 알린다
    if (res.status === 401 || res.status === 429) throw err;
    console.warn('포켓몬을 그려 넣지 못해 일러스트 겹치기로 전환합니다:', err.message);
    logGuardian(pokemon, element, 'overlay', `${res.status} ${err.message}`);
  }

  // B: 부적만 생성하고, 일러스트는 화면에서 겹쳐 보여준다.
  // 일러스트가 놓일 자리(.stamp 위치: 폭 62%, 가운데가 위에서 64%)를 받침 자리로 비워 둔다
  const pedestal = artwork
    ? `\nReserved area: below the big character, centered horizontally and at about 64% of the image height, leave an empty round glowing halo ` +
      `about 65% of the image width, with a soft ${el.ink} radiant aura and an ornate lotus-and-cloud pedestal beneath it; ` +
      'keep the inside of the halo plain and free of motifs, as a stage for a guardian figure added later'
    : '';
  const res = await fetch(`${OPENAI}/images/generations`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.IMAGE_MODEL, prompt: prompt + pedestal, size: env.IMAGE_SIZE, quality: env.IMAGE_QUALITY }),
  });
  if (!res.ok) throw await openaiError(res);
  return passImage(res, artwork ? 'overlay' : 'none');
}

const ROUTES = {
  'POST /api/reading': handleReading,
  'POST /api/image': handleImage,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = ROUTES[`${request.method} ${url.pathname}`];
    if (!route) {
      if (url.pathname.startsWith('/api/')) return json({ error: '없는 API 입니다.' }, 404);
      return env.ASSETS.fetch(request);
    }
    if (!env.OPENAI_API_KEY) {
      return json({ error: 'OPENAI_API_KEY 가 설정되지 않았습니다. 로컬은 .env, 배포는 wrangler secret put 으로 넣어주세요.' }, 500);
    }
    try {
      return await route(request, env);
    } catch (err) {
      console.error(err);
      const status = err.status && err.status < 500 ? err.status : 500;
      return json({ error: err.message || '알 수 없는 오류가 발생했습니다.' }, status);
    }
  },
};
