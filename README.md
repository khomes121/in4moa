# 인포모아 (in4moa.store)

> 부동산·세금·대출·정부지원금·창업·계산기·뉴스 — 한국 생활정보 종합 블로그.
> Astro + Cloudflare Pages 정적 사이트.

## 기술 스택

- **Astro 6.3.3** (정적 사이트 생성)
- **TypeScript strict**
- **Pretendard Variable** (한국어 폰트, CDN dynamic-subset)
- **Cloudflare Pages** (호스팅·자동 배포)
- **fast-xml-parser** (정책브리핑 RSS 파싱)
- `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/sitemap`, `sharp`

## 7대 카테고리

| 슬러그 | 라벨 | 다루는 영역 |
|---|---|---|
| `realestate` | 🏠 부동산 | 청약·분양·매매·전월세·실거래 |
| `tax` | 🧾 세금 | 양도세·취득세·종부세·증여세 |
| `loan` | 💳 대출·금융 | 디딤돌·보금자리·생활자금 |
| `subsidy` | 🎁 정부지원금 | 청년·신혼·소상공인·복지 |
| `business` | 🚀 창업·자영업 | 인허가·세무·임대차 |
| `calculator` | 🧮 계산기 | LTV·DTI·취득세·중개수수료·청약가점·임대수익률 |
| `news` | 📰 뉴스·정책 | 시의성 있는 정책·시장 동향 |

카테고리 메타데이터: `src/consts.ts` (`CATEGORIES`)

## 로컬 개발

```bash
npm install
npm run dev      # http://localhost:4331
npm run build    # dist/
npm run preview  # 빌드 결과 미리보기
```

dev 포트는 **4331** (분양노트 4321과 충돌 회피).

## 콘텐츠 작성

`src/content/blog/<slug>.md` 또는 `.mdx`. Frontmatter 필수 필드:

```yaml
---
title: '글 제목'
description: '메타·OG·검색에 노출되는 한 줄 요약'
pubDate: 2026-05-17
updatedDate: 2026-05-20    # 옵션
category: realestate        # 7대 슬러그 중 하나 (enum 강제)
tags: [양도세, 비과세]      # 옵션
heroImage: ./hero.jpg       # 옵션
---
```

스키마: `src/content.config.ts`

## 운영 원칙

1. **출처와 기준일 명시** — 모든 글은 공식 자료(법령·정부 보도자료·API)와 작성·확인 시점을 표시.
2. **AI 단독 생성 X** — 외부 API/RSS 원문 fetch → 짧은 인용 + 자체 해석 + 행동 체크리스트 가공.
3. **본문 전재 금지** — 언론사·정부 본문 그대로 복붙 X. KOGL 1유형(공공) 외엔 제목·요약·링크만.
4. **시의성 글 분리** — 자주 바뀌는 정책·금리·한도는 `category: news`에 두고 유효기간 명시.
5. **계산기 입력은 본인 브라우저에서만** — 인포모아 서버는 정적이므로 받을 곳이 없음.

## 사이트 구조

```
/                       카테고리 카드 + 계산기 스트립 + 최근 글
/blog                   전체 글 목록
/blog/[slug]            글 상세 (관련 글 4편 + 카테고리별 계산기 추천 자동 삽입)
/calculator             계산기 허브
/calculator/[slug]      취득세·중개보수·DSR·청약가점·전월세전환 (5종, 순수 클라이언트 JS)
/category/[slug]        카테고리별 글 목록 (7개)
/policy-feed            정책브리핑 RSS 자동 분류 (빌드 시 fetch)
/about                  소개·운영 원칙·면책
/privacy                개인정보처리방침 (애드센스 필수 요건)
/rss.xml                전체 RSS
/sitemap-index.xml      사이트맵
/robots.txt             크롤러 정책
```

## 수익화 (애드센스)

활성화 스위치는 `src/consts.ts` 한 곳:

| 상수 | 역할 |
|---|---|
| `ADSENSE_CLIENT` | `ca-pub-XXXX` 입력 시 전 페이지에 애드센스 스크립트 + 글 하단·계산기 광고 슬롯(`AdSlot.astro`) 자동 활성화. 빈 문자열 = 완전 비활성 |
| `GA_MEASUREMENT_ID` | `G-XXXX` 입력 시 GA4 활성화 |

승인 후 할 일: ① `ADSENSE_CLIENT` 입력 ② `public/ads.txt` 생성 (`google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`) ③ 재배포.

## 콘텐츠 자동 발행 (일 6편)

- **뉴스 5편** — korea.kr RSS 14개 → 카테고리 분배 → Claude CLI 생성 (기존 파이프라인)
- **에버그린 1편** — `scripts/evergreen-topics.json` 큐에서 1개씩 소진. 고단가 행동형 키워드(신청·조회·계산) 중심. 큐가 비면 주제를 보충할 것
- 모든 글에 계산기 내부링크 자동 유도 (프롬프트 지시)
- **스케줄**: Windows 작업 스케줄러 `Infomoa-DailyPublish` (매일 09:30, `run-daily-task.bat` → `logs/scheduler.log`)
- 수동 실행: `run-daily.bat` 더블클릭

## 배포 (Cloudflare Pages)

`main` 브랜치 push 시 자동 배포.

- **빌드 명령**: `npm run build`
- **출력 디렉토리**: `dist`
- **Node 버전**: 22.12.0+

커스텀 도메인: `in4moa.store`

## SEO

- `<html lang="ko">`, `og:locale ko_KR`
- JSON-LD: Organization + WebSite (공통) + BlogPosting (글)
- 자동 sitemap (우선순위 차등: 홈 1.0 / 카테고리 0.8 / 글 0.7)
- robots.txt: GPTBot/ClaudeBot 허용, CCBot 차단
- Pretendard `font-display: swap` + preconnect

## 라이선스

콘텐츠 = 본인 운영 한정. 코드 = 비공개.
공공 데이터(KOGL) 인용 시 출처 박스로 명시.

---

**관련 자산**:
- 디자인 권고서: `C:\_클로드\수익형블로그_연구\인포모아_디자인_권고서.md`
- 알파남 모델 매트릭스: 같은 폴더 `알파남_블로그_수익화_적용매트릭스.md`
- 콘텐츠 API 카탈로그: `C:\_클로드\_지식자산\API_데이터소스\`
