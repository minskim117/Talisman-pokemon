// 부족한 오행을 채워줄 수호 포켓몬 후보와 PokeAPI(https://pokeapi.co) 조회. API 키 불필요.

const API = 'https://pokeapi.co/api/v2';

// 오행별 수호 포켓몬 후보: 1~4세대 중 해당 타입(목=풀·벌레, 화=불꽃, 토=땅·바위, 금=강철, 수=물·얼음)
// 인기 상위 25마리. 오행 안에서 아래 두 순위의 평균으로 정렬했다(2026-10 기준).
//  - 공식: The Pokémon Company "Pokémon of the Year 2020" 지역별 상위 30 득표 (전 세계 660만 표)
//    https://pokemon2020.pokemon.com/en-us/  — 순위권 밖은 공동 최하위로 처리
//  - 최신: Thomas Game Docs 1:1 대결 투표 2025 (160만 표, 1,025마리 전체 순위)
//    https://thomasgamedocs.com/pokemon/
// [PokeAPI 영문 이름, 한국어 공식 이름]
export const CANDIDATES = {
  목: [
    ['bulbasaur', '이상해씨'], ['leafeon', '리피아'], ['scizor', '핫삼'], ['torterra', '토대부기'], ['shaymin-land', '쉐이미'],
    ['sceptile', '나무킹'], ['celebi', '세레비'], ['venusaur', '이상해꽃'], ['grovyle', '나무돌이'], ['breloom', '버섯모'],
    ['turtwig', '모부기'], ['heracross', '헤라크로스'], ['ivysaur', '이상해풀'], ['chikorita', '치코리타'], ['treecko', '나무지기'],
    ['scyther', '스라크'], ['meganium', '메가니움'], ['shedinja', '껍질몬'], ['roserade', '로즈레이드'], ['bayleef', '베이리프'],
    ['beedrill', '독침붕'], ['shuckle', '단단지'], ['tropius', '트로피우스'], ['ludicolo', '로파파'], ['butterfree', '버터플'],
  ],
  화: [
    ['typhlosion', '블레이범'], ['cyndaquil', '브케인'], ['ninetales', '나인테일'], ['blaziken', '번치코'], ['arcanine', '윈디'],
    ['charizard', '리자몽'], ['ho-oh', '칠색조'], ['flareon', '부스터'], ['vulpix', '식스테일'], ['infernape', '초염몽'],
    ['torchic', '아차모'], ['quilava', '마그케인'], ['charmander', '파이리'], ['houndoom', '헬가'], ['entei', '앤테이'],
    ['growlithe', '가디'], ['rapidash', '날쌩마'], ['charmeleon', '리자드'], ['ponyta', '포니타'], ['moltres', '파이어'],
    ['houndour', '델빌'], ['magcargo', '마그카르고'], ['combusken', '영치코'], ['chimchar', '불꽃숭이'], ['torkoal', '코터스'],
  ],
  토: [
    ['garchomp', '한카리아스'], ['flygon', '플라이곤'], ['swampert', '대짱이'], ['tyranitar', '마기라스'], ['torterra', '토대부기'],
    ['quagsire', '누오'], ['wooper', '우파'], ['groudon', '그란돈'], ['gliscor', '글라이온'], ['aggron', '보스로라'],
    ['cubone', '탕구리'], ['nidoking', '니드킹'], ['gible', '딥상어동'], ['sandslash', '고지'], ['gabite', '한바이트'],
    ['aron', '가보리'], ['marowak', '텅구리'], ['sandshrew', '모래두지'], ['marshtomp', '늪짱이'], ['shuckle', '단단지'],
    ['gligar', '글라이거'], ['steelix', '강철톤'], ['phanpy', '코코리'], ['trapinch', '톱치'], ['omanyte', '암나이트'],
  ],
  금: [
    ['lucario', '루카리오'], ['scizor', '핫삼'], ['empoleon', '엠페르트'], ['metagross', '메타그로스'], ['jirachi', '지라치'],
    ['dialga', '디아루가'], ['aggron', '보스로라'], ['mawile', '입치트'], ['aron', '가보리'], ['steelix', '강철톤'],
    ['magnezone', '자포코일'], ['registeel', '레지스틸'], ['skarmory', '무장조'], ['magneton', '레어코일'], ['metang', '메탕구'],
    ['magnemite', '코일'], ['lairon', '갱도라'], ['beldum', '메탕'], ['bronzong', '동탁군'], ['heatran', '히드런'],
    ['shieldon', '방패톱스'], ['bastiodon', '바리톱스'], ['forretress', '쏘콘'], ['bronzor', '동미러'], ['probopass', '대코파스'],
  ],
  수: [
    ['mudkip', '물짱이'], ['piplup', '팽도리'], ['suicune', '스이쿤'], ['lapras', '라프라스'], ['glaceon', '글레이시아'],
    ['vaporeon', '샤미드'], ['swampert', '대짱이'], ['kyogre', '가이오가'], ['empoleon', '엠페르트'], ['milotic', '밀로틱'],
    ['blastoise', '거북왕'], ['squirtle', '꼬부기'], ['totodile', '리아코'], ['wooper', '우파'], ['quagsire', '누오'],
    ['articuno', '프리져'], ['feraligatr', '장크로다일'], ['gyarados', '갸라도스'], ['weavile', '포푸니라'], ['froslass', '눈여아'],
    ['spheal', '대굴레오'], ['wartortle', '어니부기'], ['palkia', '펄기아'], ['sharpedo', '샤크니아'], ['slowbro', '야도란'],
  ],
};

const TYPE_KO = {
  normal: '노말', fire: '불꽃', water: '물', grass: '풀', electric: '전기', ice: '얼음',
  fighting: '격투', poison: '독', ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레',
  rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악', steel: '강철', fairy: '페어리',
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PokeAPI 요청 실패 (${res.status}): ${url}`);
  return res.json();
}

// 오행 분포에서 가장 부족한 기운. 동률이면 무작위로 하나
export function weakestElement(counts) {
  const min = Math.min(...Object.values(counts));
  const weakest = Object.keys(counts).filter((k) => counts[k] === min);
  return weakest[Math.floor(Math.random() * weakest.length)];
}

// 해당 오행의 인기 후보 [{ name, ko }]
export function candidatesFor(element) {
  return CANDIDATES[element].map(([name, ko]) => ({ name, ko }));
}

// 고른 포켓몬의 한국어 이름, 타입, 공식 일러스트
export async function pokemonDetail(name) {
  const p = await getJson(`${API}/pokemon/${name}`);
  const species = await getJson(p.species.url);
  const koName = species.names.find((n) => n.language.name === 'ko')?.name || p.name;
  return {
    id: p.id,
    name: p.name,
    koName,
    types: p.types.map((t) => TYPE_KO[t.type.name] || t.type.name),
    artwork: p.sprites.other?.['official-artwork']?.front_default || p.sprites.front_default,
  };
}
