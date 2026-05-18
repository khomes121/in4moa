# Scripts — 인포모아 자동화

## 일 5편 정책 자동 발행 — 2가지 방식

### 🥇 1차: 로컬 (권장) — Claude Code CLI 활용

| 항목 | 값 |
|---|---|
| 스크립트 | `scripts/daily-policy-local.mjs` |
| 실행 | `run-daily.bat` (더블클릭) 또는 Windows 작업 스케줄러 |
| Claude 호출 | `claude -p` subprocess (Pro Max OAuth) |
| **비용** | **0원** (Pro Max 이미 보유) |
| 조건 | PC 켜짐 + Claude Code 인증 상태 |

### 🥈 2차: GitHub Actions (백업) — Anthropic SDK

| 항목 | 값 |
|---|---|
| 워크플로 | `.github/workflows/daily-policy.yml` (자동 cron 비활성, 수동 트리거만) |
| 스크립트 | `scripts/daily-policy.mjs` |
| Claude 호출 | Anthropic SDK (Prompt Caching) |
| 비용 | 월 $1.5-3 (API 키 발급 시) |
| 조건 | GitHub Secrets `ANTHROPIC_API_KEY` 등록 |

→ **PC 끄는 날만 백업으로 GH Actions 수동 실행 (Run workflow)**.

---

## 로그·모니터링

자동화 실행 결과는 모두 `logs/` 폴더에 자동 기록됩니다. (git 무시 — 로컬만)

```
logs/
├── _status.json                          # 마지막 실행 상태 (성공·실패·편수)
├── latest.log                            # 가장 최근 실행 전체 로그
├── error.log                             # 모든 에러 누적 (영구)
└── 2026-05-18T19-00-00.log               # 날짜별 (30일 자동 회전)
```

### 실시간 로그 보기 — `monitor.bat`
더블클릭 → PowerShell `tail -f` 모드로 `latest.log` 실시간 표시. 작업 스케줄러가 실행 중일 때 진행 보기.

### 마지막 상태 빠르게 — `status.bat`
더블클릭 → `_status.json` + 최근 에러 20줄 + latest.log 메타 표시.

### `_status.json` 구조 (예시)
```json
{
  "last_run": "2026-05-18T19:00:15.234Z",
  "last_run_kst": "2026-05-19 04:00:15",
  "run_id": "2026-05-18T19-00-00",
  "log_file": "logs/2026-05-18T19-00-00.log",
  "phase": "completed",
  "success": 5,
  "total": 5,
  "failed": 0,
  "pushed": true,
  "elapsed_sec": 287,
  "posts": [
    { "slug": "auto-realestate-2026-05-19-1", "cat": "realestate", "title": "..." },
    ...
  ],
  "failures": []
}
```

phase 값:
- `started`: 시작했지만 미완료 (= 실행 중 또는 비정상 종료)
- `no-new-items`: 새 자료 없어 스킵
- `completed`: 정상 완료 (success·failed로 결과 판단)

---

## 로컬 자동화 셋업 (1차 방식)

### 1단계 — 수동 시험
```bash
cd C:\_클로드\infomoa
node scripts/daily-policy-local.mjs
```
또는 `run-daily.bat` 더블클릭.

→ 5편 생성·git commit·git push 까지 1회 동작 확인.

### 2단계 — Windows 작업 스케줄러 등록 (매일 새벽 자동)

#### A. PowerShell (관리자 권한) 1줄 등록
```powershell
$action = New-ScheduledTaskAction -Execute 'C:\_클로드\infomoa\run-daily.bat'
$trigger = New-ScheduledTaskTrigger -Daily -At 4am
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -TaskName "in4moa-daily-policy" -Description "인포모아 매일 5편 정책 자동 발행"
```

#### B. GUI 등록
1. 시작 → "작업 스케줄러" 검색·실행
2. 우측 "기본 작업 만들기" 클릭
3. 이름: `in4moa-daily-policy` / 설명: 인포모아 매일 5편 정책 자동 발행
4. 트리거: **매일** / 시작 시간: **04:00**
5. 동작: **프로그램 시작**
6. 프로그램/스크립트: `C:\_클로드\infomoa\run-daily.bat`
7. 마침

### 3단계 — 검증
- 다음날 새벽 4시 PC 켜둔 상태로 자동 실행 확인
- 작업 스케줄러 → "in4moa-daily-policy" 우클릭 → "최근 실행 결과" 확인
- in4moa.store 에서 새 글 5편 확인

### 4단계 — 수동 즉시 실행 (테스트용)
- 작업 스케줄러 → "in4moa-daily-policy" 우클릭 → **실행**

---

## 작동 흐름

```
1. korea.kr RSS 14개 fetch (정책뉴스·보도자료·브리핑 + 부처별 11개)
   ↓
2. 7일 이내 항목 필터 (약 300건)
   ↓
3. published-links.json 의 기발행 link 제외 → 미발행만
   ↓
4. 카테고리 분배 (realestate·tax·subsidy·business·news 각 1편 우선)
   ↓
5. Claude Code CLI 호출 × 5 (인포모아 톤 reference 임베드, 환각 방지)
   ↓
6. pubDate KST 07/11/14/18/21시 분산 → src/content/blog/auto-*.md 저장
   ↓
7. published-links.json 갱신
   ↓
8. git add + commit + push
   ↓
9. CF Workers Builds 자동 빌드 → in4moa.store 라이브
```

## 사전 조건 점검

| 조건 | 확인 |
|---|---|
| Node.js 22+ | `node --version` |
| Claude Code CLI 인증 | `claude --version` 후 한 번 사용 시 인증 |
| Git 인증 (push) | 평소 push 되면 OK (credential manager 활성) |
| 인포모아 dependencies | `npm ci` 한 번 (이미 했으면 OK) |

## 함정

| 함정 | 대응 |
|---|---|
| Claude Pro Max 5시간 윈도우 한도 | 일 5편은 매우 적어 무관. 다른 Claude 사용량 많으면 한도 도달 가능 |
| Pro Max 인증 만료 | `claude` 한 번 사용해서 재인증 |
| PC 꺼진 날 | GH Actions 수동 실행 (백업) |
| RSS 14개 중 일부 일시 fetch 실패 | Promise.all 안 써서 graceful. 가용 자료만으로 진행 |
| 한국어 BAT 인코딩 | run-daily.bat 영문 only (패턴 A 검증됨) |

---

## published-links.json

이미 발행에 사용한 RSS source URL 누적. 중복 방지 핵심.
- 초기 빈 배열 `[]` (첫 실행 시 기존 글과 RSS 항목 중복 가능 — 첫 실행 후 검증 권장)
- 매번 git commit에 포함 → 다음 실행이 인식

## 비용

| 방식 | 비용 |
|---|---|
| **로컬 (Claude Code CLI)** | **0원** ✅ |
| GH Actions (Anthropic SDK) | 월 $1.5-3 (API 키 발급) |

## 문제 발생 시

`run-daily.bat` 출력 끝에 `pause` 있어서 에러 메시지 직접 확인 가능.

자주 발생:
- `Claude exit 1`: Pro Max 한도 → 5시간 후 재시도
- `git push 실패`: credential 만료 → 한 번 수동 push로 갱신
- `node command not found`: PATH 확인
