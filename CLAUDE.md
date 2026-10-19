# 포켓몬 부적공방

생년월일(+선택한 태어난 시간)로 사주 오행을 계산해, 가장 부족한 기운을 채워 줄 수호 포켓몬과 부적 이미지를 만들어 주는 웹서비스.

- `public/` — 정적 화면(index.html, app.js, style.css, vendor/html2canvas)
- `src/worker.js` — Cloudflare Worker. `/api/reading`(gpt-5.6-terra 풀이), `/api/image`(gpt-image-2.5-sunburst 부적)
- `src/saju.js` — 년·월·일·시주와 오행 개수 계산
- `src/pokemon.js` — 오행별 인기 포켓몬 25마리 후보, PokeAPI 조회

## Cloudflare 배포

- **Workers 관련 작업 전에는 https://developers.cloudflare.com 의 최신 문서를 확인한다.** (설정 키, 한도, 가격이 자주 바뀐다)
- 설정 파일: `wrangler.jsonc` — `public/` 은 정적 자산, `/api/*` 만 Worker 가 처리(`run_worker_first`)
- 무료 플랜은 요청당 CPU 10ms. 이미지 응답(수 MB)은 Worker 에서 파싱하지 말고 그대로 흘려보낸다.

로컬 확인 (`.env` 의 `OPENAI_API_KEY` 를 읽는다, http://localhost:8787):

```bash
npx wrangler dev
```

배포 전 점검(실제 배포 안 함):

```bash
npx wrangler deploy --dry-run
```

처음 배포할 때 API 키 등록(한 번만):

```bash
npx wrangler secret put OPENAI_API_KEY
```

배포:

```bash
npx wrangler deploy
```

포켓몬별 A/B(그려 넣기/겹치기) 결과 로그 실시간 보기:

```bash
npx wrangler tail
```
