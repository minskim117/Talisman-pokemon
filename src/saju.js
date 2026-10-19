// 생년월일(양력)로 사주 기둥(년·월·일·시)을 계산한다.
// 절기 경계는 매년 하루 정도 오차가 있어 평균 날짜로 근사한다.

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCHES_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ANIMALS = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
const STEM_ELEMENT = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
const BRANCH_ELEMENT = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];

// 각 월지(인월부터)가 시작되는 절기의 대략적인 양력 날짜 [월, 일]
const TERM_STARTS = [
  [2, 4], [3, 6], [4, 5], [5, 6], [6, 6], [7, 7],
  [8, 8], [9, 8], [10, 8], [11, 7], [12, 7], [1, 6],
];

function pillar(stem, branch) {
  return {
    stem: STEMS[stem],
    branch: BRANCHES[branch],
    hanja: STEMS_HANJA[stem] + BRANCHES_HANJA[branch],
    hangul: STEMS[stem] + BRANCHES[branch],
    elements: [STEM_ELEMENT[stem], BRANCH_ELEMENT[branch]],
  };
}

// 0 = 인월 ... 11 = 축월
function monthIndex(month, day) {
  const md = month * 100 + day;
  for (let i = 10; i >= 0; i--) {
    const [m, d] = TERM_STARTS[i];
    if (md >= m * 100 + d) return i;
  }
  // 1월 1일 ~ 2월 3일: 소한 이후면 축월, 이전이면 자월
  return md >= 106 ? 11 : 10;
}

export function computeSaju(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error('생년월일 형식이 올바르지 않습니다.');

  // 년주: 입춘(2/4) 전이면 전년도
  const sajuYear = m * 100 + d < 204 ? y - 1 : y;
  const yearStem = (((sajuYear - 4) % 10) + 10) % 10;
  const yearBranch = (((sajuYear - 4) % 12) + 12) % 12;

  // 월주: 년간으로 인월의 천간을 정한다 (갑기년 → 병인월)
  const mi = monthIndex(m, d);
  const monthStem = (yearStem * 2 + 2 + mi) % 10;
  const monthBranch = (2 + mi) % 12;

  // 일주: 1900-01-01 = 갑술(60갑자 10번째)
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 1)) / 86400000);
  const dayIdx = (((10 + days) % 60) + 60) % 60;
  const dayStem = dayIdx % 10;
  const dayBranch = dayIdx % 12;

  const result = {
    year: pillar(yearStem, yearBranch),
    month: pillar(monthStem, monthBranch),
    day: pillar(dayStem, dayBranch),
    hour: null,
    animal: ANIMALS[yearBranch],
    dayMaster: `${STEMS[dayStem]}(${STEMS_HANJA[dayStem]}) ${STEM_ELEMENT[dayStem]}`,
  };

  // 시주: 23시부터 자시. 시간 미입력이면 생략
  if (timeStr) {
    const hour = Number(timeStr.split(':')[0]);
    const hourBranch = Math.floor((hour + 1) / 2) % 12;
    const hourStem = (dayStem * 2 + hourBranch) % 10;
    result.hour = pillar(hourStem, hourBranch);
  }

  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of [result.year, result.month, result.day, result.hour]) {
    if (p) p.elements.forEach((e) => counts[e]++);
  }
  result.elementCounts = counts;
  return result;
}
