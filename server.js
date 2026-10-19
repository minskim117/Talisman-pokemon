import 'dotenv/config';
import { appendFile, mkdir } from 'node:fs/promises';
import express from 'express';
import OpenAI, { toFile } from 'openai';
import { computeSaju } from './saju.js';
import { candidatesFor, fetchArtwork, pokemonDetail, weakestElement } from './pokemon.js';

const {
  OPENAI_API_KEY,
  TEXT_MODEL = 'gpt-5.6-terra',
  IMAGE_MODEL = 'gpt-image-2.5-sunburst',
  IMAGE_SIZE = '1024x1536',
  IMAGE_QUALITY = 'medium',
  PORT = 3000,
} = process.env;

if (!OPENAI_API_KEY) {
  console.warn('⚠️  .env 파일에 OPENAI_API_KEY가 비어 있습니다. 키를 넣고 서버를 다시 시작하세요.');
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY || 'missing' });
const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/vendor', express.static('node_modules/html2canvas/dist'));

const BASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    talismanName: { type: 'string', description: '부적 이름 (한글, 예: 재물운 상승 부적)' },
    summary: { type: 'string', description: '한 줄 요약' },
    personalityReading: { type: 'string', description: '타고난 기운으로 본 성격 해석 2문장, 공백 포함 85자 이내 (화면에서 3줄)' },
    lackingEnergy: { type: 'string', description: '가장 부족한 오행이 무엇이고, 그 기운이 부족해서 생기기 쉬운 모습 2~3문장' },
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

// 포켓몬별 A/B 결과를 한 줄씩 남긴다 (npm run stats 로 집계)
const LOG_FILE = 'logs/guardian.jsonl';
async function logGuardian(pokemon, element, mode, error) {
  const entry = {
    time: new Date().toISOString(),
    element,
    id: pokemon?.id,
    name: pokemon?.name,
    koName: pokemon?.koName,
    mode,
    ...(error && { error }),
  };
  try {
    await mkdir('logs', { recursive: true });
    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.warn('결과 로그를 남기지 못했습니다:', err.message);
  }
}

function toSrc(result) {
  const img = result.data?.[0];
  const src = img?.b64_json ? `data:image/png;base64,${img.b64_json}` : img?.url;
  if (!src) throw new Error('이미지가 생성되지 않았습니다.');
  return src;
}

function apiError(res, err) {
  console.error(err);
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: err.message || '알 수 없는 오류가 발생했습니다.' });
}

app.post('/api/reading', async (req, res) => {
  try {
    const { birthDate, birthTime } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) {
      return res.status(400).json({ error: '생년월일을 입력해주세요.' });
    }
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다. .env를 확인하세요.' });
    }

    const saju = computeSaju(birthDate, birthTime);
    const element = weakestElement(saju.elementCounts);
    const candidates = candidatesFor(element);
    const response = await client.responses.create({
      model: TEXT_MODEL,
      instructions:
        '당신은 명리학에 밝은 따뜻한 부적 술사입니다. 주어진 사주 팔자(오행의 과다/부족, 일간, 띠)로 타고난 기질과 성격을 분석해 ' +
        '이 사람에게 지금 가장 필요한 부적 하나를 처방하세요. 부족한 오행을 보완하거나 과한 기운을 다스리는 방향으로 근거를 대고, ' +
        '말투는 친근하고 긍정적으로. ' +
        '일간, 천간, 지지, 경금·기토 같은 간지 이름, 상생·상극, 비겁·식상 같은 어려운 명리 용어는 쓰지 말고, ' +
        '나무(목)·불(화)·흙(토)·쇠(금)·물(수) 기운처럼 누구나 이해할 쉬운 말로 풀어 쓰세요. 의학·법률·투자 조언은 하지 마세요. 한국어로 답하되 visual 필드만 영어로 쓰세요. ' +
        '부족한 오행을 채워줄 수호 포켓몬도 후보 중에서 하나 골라, 효과 설명에 자연스럽게 녹여주세요. ' +
        '한국어 글에서 포켓몬은 반드시 한국어 공식 이름(후보 목록의 괄호 앞 이름)으로만 쓰고, 영어 이름은 pokemon.name 필드에만 쓰세요.',
      input:
        `생년월일(양력): ${birthDate}${birthTime ? ` ${birthTime}` : ''}\n` +
        `\n[계산된 사주]\n${describeSaju(saju)}\n` +
        `가장 부족한 오행: ${element}\n` +
        `수호 포켓몬 후보(${element} 기운, 한국어 이름(영문)): ${candidates.map((c) => `${c.ko}(${c.name})`).join(', ')}`,
      text: { format: { type: 'json_schema', name: 'talisman_reading', schema: readingSchema(candidates), strict: true } },
    });

    const reading = koreanNames(JSON.parse(response.output_text), candidates);
    // 부적의 힘은 "수호 포켓몬 ○○의 …" 부분부터만 보여준다
    const from = reading.fillEffect.indexOf('수호 포켓몬');
    if (from > 0) reading.fillEffect = reading.fillEffect.slice(from);
    const pokemon = { ...(await pokemonDetail(reading.pokemon.name)), element, reason: reading.pokemon.reason };
    res.json({ saju, reading, pokemon, element: { name: element, ...ELEMENTS[element] } });
  } catch (err) {
    apiError(res, err);
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { reading, pokemon, element } = req.body || {};
    const el = ELEMENTS[element];
    if (!reading?.visual || !el) return res.status(400).json({ error: '부적 정보가 없습니다.' });
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다. .env를 확인하세요.' });
    }

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
    ].filter(Boolean).join('\n');

    const artworkUrl = String(pokemon?.artwork || '');
    const artwork = artworkUrl.startsWith(ARTWORK_PREFIX) ? await fetchArtwork(artworkUrl) : null;

    // A: 포켓몬 일러스트를 참고 이미지로 부적 안에 그려 넣는다
    if (artwork) {
      try {
        const result = await client.images.edit({
          model: IMAGE_MODEL,
          image: await toFile(artwork, 'guardian.png', { type: 'image/png' }),
          prompt: `${prompt}\n` +
            'Input images: Image 1: reference for the guardian creature design only\n' +
            'Guardian: redraw the creature from Image 1 as the talisman\'s guardian spirit, in the lower half of the paper, ' +
            `painted in the same ${el.ink} brush ink style with soft highlights, keeping its recognizable silhouette and features, ` +
            'surrounded by the talisman seal patterns',
          size: IMAGE_SIZE,
          quality: IMAGE_QUALITY,
        });
        const image = toSrc(result);
        await logGuardian(pokemon, element, 'drawn');
        return res.json({ image, mode: 'drawn' });
      } catch (err) {
        // 키 오류나 한도 초과는 B로 넘겨도 똑같이 실패하므로 그대로 알린다
        if (err.status === 401 || err.status === 429) throw err;
        console.warn('포켓몬을 그려 넣지 못해 일러스트 겹치기로 전환합니다:', err.message);
        await logGuardian(pokemon, element, 'overlay', `${err.status || ''} ${err.code || err.message}`.trim());
      }
    }

    // B: 부적만 생성하고, 일러스트는 화면에서 겹쳐 보여준다.
    // 일러스트가 놓일 아래쪽 가운데(.stamp 위치: 폭 45%, 높이 약 79% 지점)를 받침 자리로 비워 둔다
    const pedestal = artwork
      ? `\nReserved area: in the lower center, centered at about 79% of the image height, leave an empty round glowing halo ` +
        `about 50% of the image width, with a soft ${el.ink} radiant aura and an ornate lotus-and-cloud pedestal beneath it; ` +
        'keep the inside of the halo plain and free of motifs, as a stage for a guardian figure added later'
      : '';
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: prompt + pedestal,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    });
    res.json({
      image: toSrc(result),
      mode: artwork ? 'overlay' : 'none',
      artwork: artwork ? `data:image/png;base64,${artwork.toString('base64')}` : null,
    });
  } catch (err) {
    apiError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`🔮 부적 공방이 열렸습니다: http://localhost:${PORT}`);
});
