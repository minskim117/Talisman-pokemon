const $ = (id) => document.getElementById(id);
const form = $('form');

// ---- 해·달·별 구분선 SVG ----
// 풀이 저장(html2canvas) 때도 그려지도록 색은 CSS 대신 SVG 안에 직접 쓴다
const G = '#e2b866';
function rays(cx, cy, n, r1, r2, w) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + Math.PI / 2;
    const [x1, y1] = [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2];
    const [bx, by] = [Math.cos(b) * w, Math.sin(b) * w];
    const [x0, y0] = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
    d += `M${(x0 + bx).toFixed(1)} ${(y0 + by).toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}L${(x0 - bx).toFixed(1)} ${(y0 - by).toFixed(1)}Z`;
  }
  return d;
}
function lines(id, gap) {
  return `<defs>
    <linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="${G}" stop-opacity="0"/><stop offset="1" stop-color="${G}"/></linearGradient>
    <linearGradient id="${id}r" x1="1" x2="0"><stop offset="0" stop-color="${G}" stop-opacity="0"/><stop offset="1" stop-color="${G}"/></linearGradient>
  </defs>
  <path d="M10 20L${200 - gap} 19.2V20.8Z" fill="url(#${id}l)"/>
  <path d="M390 20L${200 + gap} 19.2V20.8Z" fill="url(#${id}r)"/>`;
}
const DIVIDERS = {
  // 해: 가운데 햇살, 양옆 점과 작은 마름모
  sun: `${lines('dvs', 34)}
    <path d="${rays(200, 20, 16, 7, 17, 1.6)}" fill="${G}"/>
    <circle cx="200" cy="20" r="7.5" fill="${G}"/>
    <circle cx="160" cy="20" r="2.6" fill="${G}"/><circle cx="240" cy="20" r="2.6" fill="${G}"/>
    <path d="M146 20l3-3 3 3-3 3zM248 20l3-3 3 3-3 3z" fill="${G}"/>`,
  // 달: 초승달과 별, 양옆 작은 달
  moon: `${lines('dvm', 30)}
    <path d="M200 7a13 13 0 1 0 12 18 10.5 10.5 0 1 1-12-18z" fill="${G}"/>
    <path d="M207 9l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="${G}"/>
    <path d="M167 15a5 5 0 1 0 0 10 4 4 0 1 1 0-10zM233 15a5 5 0 1 1 0 10 4 4 0 1 0 0-10z" fill="${G}"/>
    <circle cx="157" cy="20" r="1.8" fill="${G}"/><circle cx="243" cy="20" r="1.8" fill="${G}"/>`,
  // 별: 네 갈래 별과 가는 빛살
  star: `${lines('dvt', 30)}
    <path d="${rays(200, 20, 8, 3, 15, .5)}" fill="${G}" opacity=".7"/>
    <path d="M200 4l3.2 12.8L216 20l-12.8 3.2L200 36l-3.2-12.8L184 20l12.8-3.2z" fill="${G}"/>
    <circle cx="172" cy="20" r="3" fill="${G}"/><circle cx="228" cy="20" r="3" fill="${G}"/>
    <circle cx="163" cy="20" r="1.6" fill="${G}"/><circle cx="237" cy="20" r="1.6" fill="${G}"/>`,
};
// ---- 배경 반짝이: 화면 곳곳에서 천천히 깜빡인다 ----
(() => {
  const sky = $('sky');
  for (let i = 0; i < 70; i++) {
    const t = document.createElement('span');
    const big = Math.random() < 0.25;
    t.className = big ? 'twinkle star' : 'twinkle';
    t.style.left = `${Math.random() * 100}%`;
    t.style.top = `${Math.random() * 100}%`;
    t.style.setProperty('--s', `${big ? 8 + Math.random() * 8 : 2 + Math.random() * 3}px`);
    t.style.setProperty('--o', (big ? 0.5 : 0.35) + Math.random() * 0.35);
    t.style.setProperty('--d', `${3 + Math.random() * 4}s`);
    t.style.setProperty('--delay', `${-Math.random() * 7}s`);
    sky.append(t);
  }
})();

document.querySelectorAll('[data-divider]').forEach((el) => {
  el.innerHTML = `<svg viewBox="0 0 400 40" width="360" height="36" aria-hidden="true">${DIVIDERS[el.dataset.divider]}</svg>`;
});

// ---- 생년월일 선택기: 연도 → 월 → 일 순서로 고른다 ----
const dateInput = $('birthDate');
const picker = $('picker');
const MIN_YEAR = 1900;
const THIS_YEAR = new Date().getFullYear();
const DEFAULT_YEAR = 1995;
const pad = (n) => String(n).padStart(2, '0');
const sel = { year: null, month: null };

function parseInput() {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.value);
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

// ---- 양력/음력 ----
const isLunar = () => form.elements.calendar.value === 'lunar';
form.querySelectorAll('input[name="calendar"]').forEach((r) => r.addEventListener('change', () => {
  if (!picker.hidden) showYears();
}));

function isRealDate(v) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!p) return false;
  // 음력은 달마다 29~30일이라, 정확한 검사는 서버의 음력→양력 변환에서 한다
  if (isLunar()) return +p[1] >= MIN_YEAR && +p[1] <= THIS_YEAR && +p[2] >= 1 && +p[2] <= 12 && +p[3] >= 1 && +p[3] <= 30;
  const d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
  return d.getUTCFullYear() === +p[1] && d.getUTCMonth() === +p[2] - 1 && d.getUTCDate() === +p[3]
    && +p[1] >= MIN_YEAR && d <= new Date();
}

function header(title, back) {
  const h = document.createElement('div');
  h.className = 'picker-head';
  if (back) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'picker-back';
    b.textContent = '‹';
    b.setAttribute('aria-label', '뒤로');
    b.onclick = back;
    h.append(b);
  }
  const t = document.createElement('span');
  t.textContent = title;
  h.append(t);
  return h;
}

function cell(label, onClick, active) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (active) b.classList.add('active');
  b.onclick = onClick;
  return b;
}

function showYears() {
  const current = parseInput()?.year;
  const grid = document.createElement('div');
  grid.className = 'picker-grid years';
  let target;
  for (let y = THIS_YEAR; y >= MIN_YEAR; y--) {
    const b = cell(String(y), () => { sel.year = y; showMonths(); }, y === current);
    if (y === (current || DEFAULT_YEAR)) target = b;
    grid.append(b);
  }
  picker.replaceChildren(header('연도를 선택하세요'), grid);
  target?.scrollIntoView({ block: 'center' });
  (target || grid.firstChild).focus({ preventScroll: true });
}

function showMonths() {
  const cur = parseInput();
  const grid = document.createElement('div');
  grid.className = 'picker-grid months';
  for (let m = 1; m <= 12; m++) {
    grid.append(cell(`${m}월`, () => { sel.month = m; showDays(); },
      cur?.year === sel.year && cur?.month === m));
  }
  picker.replaceChildren(header(`${sel.year}년`, showYears), grid);
  grid.firstChild.focus();
}

function showDays() {
  const cur = parseInput();
  const grid = document.createElement('div');
  grid.className = 'picker-grid days';
  // 음력은 양력 요일과 맞지 않으므로 요일 없이 1~30일만 보여준다
  if (!isLunar()) {
    for (const w of ['일', '월', '화', '수', '목', '금', '토']) {
      const s = document.createElement('span');
      s.textContent = w;
      grid.append(s);
    }
    const first = new Date(sel.year, sel.month - 1, 1).getDay();
    for (let i = 0; i < first; i++) grid.append(document.createElement('span'));
  }
  const last = isLunar() ? 30 : new Date(sel.year, sel.month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    grid.append(cell(String(d), () => {
      dateInput.value = `${sel.year}-${pad(sel.month)}-${pad(d)}`;
      closePicker();
      dateInput.focus();
    }, cur?.year === sel.year && cur?.month === sel.month && cur?.day === d));
  }
  picker.replaceChildren(header(`${isLunar() ? '음력 ' : ''}${sel.year}년 ${sel.month}월`, showMonths), grid);
  grid.querySelector('button').focus();
}

function openPicker() {
  closeTimePicker();
  picker.hidden = false;
  showYears();
}

function closePicker() {
  picker.hidden = true;
}

$('calBtn').addEventListener('click', () => (picker.hidden ? openPicker() : closePicker()));
document.addEventListener('click', (e) => {
  // 화면 전환으로 클릭한 버튼이 DOM에서 빠지므로 target 대신 이벤트 경로로 판단
  if (!picker.hidden && !e.composedPath().includes(dateInput.parentElement)) closePicker();
});
picker.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePicker(); $('calBtn').focus(); }
});

// ---- 태어난 시간 선택기 ----
// 브라우저 기본 시간 창처럼 오전/오후 · 시 · 분 세 줄을 스크롤해서 고르고, 모양은 날짜 선택기와 같다.
// 칸에 직접 입력하는 것은 그대로 브라우저 기본 time 입력이 처리한다.
const timeInput = $('birthTime');
const timePicker = $('timePicker');

// 비어 있을 때만 형식 안내를 보이도록 표시 (선택기·직접 입력·지우기 모두 반영)
function syncTimeEmpty() {
  timeInput.parentElement.classList.toggle('empty', !timeInput.value);
}
timeInput.addEventListener('input', syncTimeEmpty);
timeInput.addEventListener('change', syncTimeEmpty);

function timeParts() {
  const m = /^(\d{2}):(\d{2})$/.exec(timeInput.value);
  if (!m) return null;
  const h = +m[1];
  return { pm: h >= 12, hour: h % 12 || 12, minute: +m[2] };
}

function setTime(change) {
  const cur = timeParts() || { pm: false, hour: 12, minute: 0 };
  const t = { ...cur, ...change };
  const h24 = (t.hour % 12) + (t.pm ? 12 : 0);
  timeInput.value = `${pad(h24)}:${pad(t.minute)}`;
  syncTimeEmpty();
  showTimeColumns();
}

function timeColumn(items, isActive, onPick, label) {
  const col = document.createElement('div');
  col.className = 'picker-grid time-col';
  col.setAttribute('aria-label', label);
  for (const [text, value] of items) {
    col.append(cell(text, () => onPick(value), isActive(value)));
  }
  return col;
}

function showTimeColumns() {
  const cur = timeParts();
  const scroll = [...timePicker.querySelectorAll('.time-col')].map((c) => c.scrollTop);
  const cols = document.createElement('div');
  cols.className = 'time-cols';
  cols.append(
    timeColumn([['오전', false], ['오후', true]], (v) => cur?.pm === v, (pm) => setTime({ pm }), '오전 오후'),
    timeColumn(Array.from({ length: 12 }, (_, i) => [`${i + 1}시`, i + 1]), (v) => cur?.hour === v, (hour) => setTime({ hour }), '시'),
    timeColumn(Array.from({ length: 60 }, (_, i) => [`${pad(i)}분`, i]), (v) => cur?.minute === v, (minute) => setTime({ minute }), '분'),
  );
  const foot = document.createElement('div');
  foot.className = 'picker-foot';
  const clear = cell('지우기', () => { timeInput.value = ''; syncTimeEmpty(); showTimeColumns(); });
  const done = cell('확인', () => { closeTimePicker(); timeInput.focus(); });
  foot.append(clear, done);
  timePicker.replaceChildren(header('태어난 시간을 선택하세요'), cols, foot);
  // 다시 그려도 스크롤 위치를 유지하고, 처음 열 때는 선택된 칸이 보이게 한다
  timePicker.querySelectorAll('.time-col').forEach((c, i) => {
    if (scroll.length) c.scrollTop = scroll[i];
    else c.querySelector('.active')?.scrollIntoView({ block: 'center' });
  });
}

function closeTimePicker() {
  timePicker.hidden = true;
}

$('timeBtn').addEventListener('click', () => {
  if (!timePicker.hidden) return closeTimePicker();
  closePicker();
  timePicker.replaceChildren();
  timePicker.hidden = false;
  showTimeColumns();
});
document.addEventListener('click', (e) => {
  if (!timePicker.hidden && !e.composedPath().includes(timeInput.parentElement)) closeTimePicker();
});
timePicker.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeTimePicker(); $('timeBtn').focus(); }
});

async function post(url, body) {
  return (await postRaw(url, body)).data;
}

async function postRaw(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return { res, data };
}

// /api/image 는 OpenAI 이미지 응답을 그대로 넘겨주고, A/B 결과는 X-Talisman-Mode 헤더로 알려준다
async function requestImage(body) {
  const { res, data } = await postRaw('/api/image', body);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지가 생성되지 않았습니다.');
  return { image: `data:image/png;base64,${b64}`, mode: res.headers.get('X-Talisman-Mode') };
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = !msg;
}

function renderReading({ reading, element }) {
  $('rHanja').textContent = element.hanja;
  $('rHanja').dataset.el = element.name;
  $('rName').textContent = reading.talismanName;
  // 성격 풀이와 부족한 기운 풀이를 한 문단(기운 풀이)으로 이어 보여준다
  $('rEnergy').textContent = `${reading.personalityReading} ${reading.lackingEnergy}`;
  $('rEffect').textContent = reading.fillEffect;
}

// 풀이 저장: 설명 카드를 그대로 PNG 이미지로 내려받는다
let current = null;
async function saveCard() {
  if (!current) return;
  const btn = $('saveCard');
  btn.disabled = true;
  try {
    await document.fonts.ready;
    const card = $('readingCard');
    const canvas = await html2canvas(card, {
      backgroundColor: getComputedStyle(card).backgroundColor,
      scale: 2,
      useCORS: true,
      onclone: (doc) => {
        const c = doc.getElementById('readingCard');
        c.style.animation = 'none';
        // html2canvas 는 inset 그림자를 제대로 못 그려서, 안쪽 금선을 테두리 요소로 대신 그린다
        c.style.boxShadow = 'none';
        const line = doc.createElement('div');
        line.style.cssText = 'position:absolute;inset:5px;border:1px solid rgba(201,149,63,.45);border-radius:3px;pointer-events:none';
        c.append(line);
      },
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${current.reading.talismanName} 풀이.png`;
    a.click();
  } catch (err) {
    alert(`풀이 이미지를 만들지 못했습니다: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}
$('saveCard').addEventListener('click', saveCard);

// 이미지 등장 효과: 오행 색 빛이 터지며 부적이 퍼져 나오고, 반짝이가 흩어진다
function revealImage(box, glow) {
  box.style.setProperty('--glow', glow);
  box.classList.remove('reveal');
  void box.offsetWidth; // 애니메이션 다시 시작
  box.classList.add('reveal');
  box.querySelector('.flash')?.remove();
  const flash = document.createElement('span');
  flash.className = 'flash';
  box.append(flash);
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const angle = Math.random() * Math.PI * 2;
    const dist = box.clientWidth * (0.25 + Math.random() * 0.4);
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.setProperty('--delay', `${Math.random() * 0.4}s`);
    s.style.setProperty('--size', `${6 + Math.random() * 10}px`);
    box.append(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

function showCard() {
  $('readingCard').hidden = false;
  $('actions').hidden = false;
}

// 오행 색 (B 모드 일러스트 후광, 설명 카드 한자와 같은 계열)
const GLOW = { 목: '#7ddc6a', 화: '#ff6a3d', 토: '#e0a75e', 금: '#ffe08a', 수: '#6cc4ff' };
// B 모드에서 공식 일러스트에 입히는 부적 먹색 (A 방식처럼 부적 색감을 따라가게)
const INK = { 목: '#4f9a3c', 화: '#d23a20', 토: '#9a6630', 금: '#d4a23a', 수: '#2f6fc0' };
const TINT_KEEP = 0.2; // 원래 색을 얼마나 남길지 (0 = 완전히 부적 색, 1 = 원본 그대로)

// 일러스트의 명암은 그대로 두고 색만 부적 먹색으로 바꾼다 (투명한 부분은 그대로)
async function tintArtwork(src, ink) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'color'; // 밝기는 유지하고 색상·채도만 먹색으로
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = TINT_KEEP;
  ctx.drawImage(img, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in'; // 원래 일러스트 모양대로 다시 오려낸다
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function renderPokemon(p) {
  $('pkImg').crossOrigin = 'anonymous'; // 풀이 저장 때 캔버스에 그리려면 필요
  $('pkImg').src = p.artwork;
  $('pkImg').alt = p.koName;
  $('pkElement').textContent = p.element;
  $('pkName').textContent = p.koName;
  $('pkTypes').textContent = `No.${p.id} · ${p.types.join(' / ')}`;
  $('pkReason').textContent = p.reason;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 외부 일러스트를 캔버스에 합성해도 저장할 수 있게
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 저장용 이미지: 화면의 .stamp 위치(폭 62%, 가운데가 위에서 64%)·후광과 같게 합성
async function composite(baseSrc, stampSrc, glow) {
  const [base, stamp] = await Promise.all([loadImage(baseSrc), loadImage(stampSrc)]);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  const w = canvas.width * 0.62;
  const h = (stamp.naturalHeight / stamp.naturalWidth) * w;
  const x = (canvas.width - w) / 2;
  const y = canvas.height * 0.64 - h / 2;
  ctx.shadowColor = glow;
  ctx.shadowBlur = canvas.width * 0.035;
  ctx.drawImage(stamp, x, y, w, h);
  ctx.shadowColor = 'rgba(0, 0, 0, .35)';
  ctx.shadowBlur = canvas.width * 0.012;
  ctx.shadowOffsetY = canvas.width * 0.006;
  ctx.drawImage(stamp, x, y, w, h);
  return canvas.toDataURL('image/png');
}

// 이미지 생성은 진행률을 알려주지 않아서, 걸린 시간으로 어림한 %를 보여준다.
// 보통 20~30초 걸리므로 14초마다 남은 양의 약 63%씩 차오르게 하고, 끝나기 전에는 95%에서 멈춘다.
const LOADING_TAU = 14;
let loadingTimer = null;

function stopLoading() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

function setImageLoading() {
  stopLoading();
  $('imageBox').innerHTML =
    '<div class="loading"><span class="spinner"></span><p>지라치가 부적을 그리는 중 <span class="load-pct">0%</span></p></div>';
  const pct = $('imageBox').querySelector('.load-pct');
  const start = performance.now();
  loadingTimer = setInterval(() => {
    const t = (performance.now() - start) / 1000;
    pct.textContent = `${Math.min(95, Math.round(100 * (1 - Math.exp(-t / LOADING_TAU))))}%`;
  }, 200);
  $('download').hidden = true;
  $('imageBox').classList.remove('reveal');
  $('readingCard').hidden = true;
  $('actions').hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (!isRealDate(dateInput.value)) {
    showError('생년월일을 올바르게 입력해주세요 (예: 1990-05-15).');
    return;
  }
  const body = Object.fromEntries(new FormData(form));
  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = '기운을 읽는 중…';

  try {
    const data = await post('/api/reading', body);
    current = data;
    renderReading(data);
    renderPokemon(data.pokemon);
    setImageLoading();
    form.hidden = true;
    $('result').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const { image, mode } = await requestImage({ reading: data.reading, pokemon: data.pokemon, element: data.element.name });
      const artwork = data.pokemon.artwork;
      const img = new Image();
      img.src = image;
      img.alt = `${data.reading.talismanName} 부적 이미지`;
      await img.decode().catch(() => {});
      stopLoading();
      $('imageBox').replaceChildren(img);

      // B 모드: 포켓몬을 그려 넣지 못했으면 공식 일러스트를 부적 위에 겹친다
      let download = image;
      if (mode === 'overlay' && artwork) {
        const tinted = await tintArtwork(artwork, INK[data.element.name]);
        const stamp = new Image();
        stamp.src = tinted;
        stamp.className = 'stamp';
        stamp.style.setProperty('--glow', GLOW[data.element.name]);
        stamp.alt = `${data.pokemon.koName} 일러스트`;
        $('imageBox').append(stamp);
        download = await composite(image, tinted, GLOW[data.element.name]);
      }
      $('download').href = download;
      $('download').hidden = false;
      revealImage($('imageBox'), GLOW[data.element.name]);
      showCard();
    } catch (err) {
      stopLoading();
      $('imageBox').innerHTML = `<div class="loading"><p>이미지 생성 실패<br />${err.message}</p></div>`;
      showCard();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '부적 받기';
  }
});

$('again').addEventListener('click', () => {
  $('result').hidden = true;
  form.hidden = false;
});
