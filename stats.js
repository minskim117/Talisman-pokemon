// logs/guardian.jsonl 을 읽어 포켓몬별 A(그려 넣기) / B(겹치기) 횟수를 보여준다.
import { readFile } from 'node:fs/promises';

const text = await readFile('logs/guardian.jsonl', 'utf8').catch(() => '');
const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
if (!rows.length) {
  console.log('아직 기록이 없습니다. 부적을 생성하면 logs/guardian.jsonl 에 쌓입니다.');
  process.exit(0);
}

const byPokemon = new Map();
for (const r of rows) {
  const key = `${r.koName}(${r.name})`;
  const s = byPokemon.get(key) || { 오행: r.element, A: 0, B: 0 };
  if (r.mode === 'drawn') s.A++;
  else s.B++;
  byPokemon.set(key, s);
}

const table = [...byPokemon]
  .map(([포켓몬, s]) => ({ 포켓몬, ...s, 'B 비율': `${Math.round((s.B / (s.A + s.B)) * 100)}%` }))
  .sort((a, b) => b.B - a.B || b.A + b.B - (a.A + a.B));

const total = { A: rows.filter((r) => r.mode === 'drawn').length };
total.B = rows.length - total.A;
console.log(`전체 ${rows.length}회 · A ${total.A}회 · B ${total.B}회`);
console.table(table);
