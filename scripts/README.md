# Scripts — 인포모아 자동화

## daily-policy.mjs

매일 정책 큐레이션 5편 자동 발행.

### 작동
1. korea.kr RSS 14개 (정책뉴스·보도자료·브리핑 + 부처별 11개) fetch
2. `published-links.json` 의 기발행 link 제외 (중복 방지)
3. 카테고리별 분배 (realestate · tax · subsidy · business · news 각 1편 우선)
4. Anthropic API 호출 (**Prompt Caching**: 인포모아 톤 reference + 작성 원칙을 system에 캐싱 → 5편 모두 동일 system, cache hit 4번 = 비용 약 90% 절감)
5. pubDate 자연 분산 — 오늘 KST 07/11/14/18/21시
6. `src/content/blog/auto-{cat}-{date}-{n}.md` 저장
7. `published-links.json` 갱신

### 환경 변수
| 변수 | 필수 | 기본 | 설명 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | https://console.anthropic.com/ |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-4-6` | 사용 모델 |

### 로컬 실행
```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/daily-policy.mjs
```

### 자동 실행 (GitHub Actions)
`.github/workflows/daily-policy.yml` 매일 UTC 19시 (KST 04시) cron.

### 사전 작업 (1회만)
1. **Anthropic API 키 발급**: https://console.anthropic.com/ → API Keys → Create
2. **인포모아 GH Secrets 등록**:
   - 인포모아 리포 → Settings → Secrets and variables → Actions
   - **New repository secret** → Name: `ANTHROPIC_API_KEY` / Value: 발급 키
3. GitHub Actions 탭 → "매일 5편 자동 발행" → **Run workflow** 수동 시험

### 비용 추정
- Claude Sonnet 4.6 기준
- system prompt (인포모아 톤 + 원칙): ~3,000 tokens × 캐시
- user prompt (자료): ~1,500 tokens
- output: ~2,500 tokens
- 5편/일 = ~33k tokens (캐시 적용 ~18k effective)
- **월 약 $1.5-3** (Pro Max 와 별개)

## published-links.json
이미 발행에 사용한 RSS source URL 누적. 중복 방지 핵심.
- 초기 빈 배열 `[]` (첫 실행 시 충돌 가능 — 수동 검증 후 첫 실행 권장)
- 매번 git commit에 포함 (다음 실행이 인식)
