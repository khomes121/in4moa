#!/usr/bin/env node
// 인포모아 일 5편 정책 자동 발행
// 작동:
//   1. korea.kr RSS 14개 fetch → 7일 내 항목
//   2. scripts/published-links.json 의 기발행 link 제외 (중복 방지)
//   3. 카테고리별 분배 (realestate·tax·subsidy·business·news 각 1편)
//   4. Anthropic API 호출 (Prompt Caching: system에 인포모아 톤 reference 캐싱)
//   5. pubDate 자연 분산 (오늘 07/11/14/18/21시 KST)
//   6. src/content/blog/ 에 .md 저장 + published-links.json 갱신
//
// 환경 변수:
//   ANTHROPIC_API_KEY (필수)
//   ANTHROPIC_MODEL (선택, 기본 claude-sonnet-4-6)
//
// 사용:
//   node scripts/daily-policy.mjs

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG = join(ROOT, 'src', 'content', 'blog');
const PUBLISHED = join(__dirname, 'published-links.json');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY 환경변수 필요');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// ─────────────────────────────────────────────────────────────────────────────
// 인포모아 톤 reference (캐싱 대상 — system prompt에 임베드)
const REFERENCE = readFileSync(
  join(BLOG, 'yangdoso-1jutaek-bigwasae-2026.md'),
  'utf-8'
);

const DEPT_CAT = {
  '통합': 'news', '기획재정부': 'tax', '국토교통부': 'realestate',
  '산업통상자원부': 'business', '교육부': 'subsidy', '여성가족부': 'subsidy',
  '외교부': 'news', '과학기술정보통신부': 'business', '국세청': 'tax',
  '고용노동부': 'subsidy', '법무부': 'news', '행정안전부': 'news',
};

const FEEDS = [
  { name: '정책뉴스', dept: '통합', url: 'https://www.korea.kr/rss/policy.xml' },
  { name: '보도자료', dept: '통합', url: 'https://www.korea.kr/rss/pressrelease.xml' },
  { name: '브리핑', dept: '통합', url: 'https://www.korea.kr/rss/ebriefing.xml' },
  { name: '기획재정부', dept: '기획재정부', url: 'https://www.korea.kr/rss/dept_moef.xml' },
  { name: '국토교통부', dept: '국토교통부', url: 'https://www.korea.kr/rss/dept_molit.xml' },
  { name: '산업통상자원부', dept: '산업통상자원부', url: 'https://www.korea.kr/rss/dept_motie.xml' },
  { name: '교육부', dept: '교육부', url: 'https://www.korea.kr/rss/dept_moe.xml' },
  { name: '여성가족부', dept: '여성가족부', url: 'https://www.korea.kr/rss/dept_mogef.xml' },
  { name: '외교부', dept: '외교부', url: 'https://www.korea.kr/rss/dept_mofa.xml' },
  { name: '과학기술정보통신부', dept: '과학기술정보통신부', url: 'https://www.korea.kr/rss/dept_msit.xml' },
  { name: '국세청', dept: '국세청', url: 'https://www.korea.kr/rss/dept_nts.xml' },
  { name: '고용노동부', dept: '고용노동부', url: 'https://www.korea.kr/rss/dept_moel.xml' },
  { name: '법무부', dept: '법무부', url: 'https://www.korea.kr/rss/dept_moj.xml' },
  { name: '행정안전부', dept: '행정안전부', url: 'https://www.korea.kr/rss/dept_mois.xml' },
];

// ─────────────────────────────────────────────────────────────────────────────
function ext(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function fetchOne(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'in4moa-bot/0.1' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    return blocks.map(b => {
      const pubStr = ext(b, 'pubDate') || ext(b, 'dc:date');
      const pub = pubStr ? new Date(pubStr) : null;
      return {
        source: `korea.kr / ${feed.name}`,
        dept: feed.dept,
        category: DEPT_CAT[feed.dept] || 'news',
        title: ext(b, 'title'),
        link: ext(b, 'link'),
        desc: ext(b, 'description'),
        pubDate: pub && !isNaN(pub) ? pub : null,
      };
    }).filter(x => x.title && x.link && x.pubDate);
  } catch {
    return [];
  }
}

async function fetchAllRSS() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const all = (await Promise.all(FEEDS.map(fetchOne))).flat();
  const recent = all.filter(x => x.pubDate >= since);
  const seen = new Set();
  const dedup = recent.filter(x => { if (seen.has(x.link)) return false; seen.add(x.link); return true; });
  dedup.sort((a, b) => b.pubDate - a.pubDate);
  return dedup;
}

// ─────────────────────────────────────────────────────────────────────────────
function loadPublished() {
  if (!existsSync(PUBLISHED)) return new Set();
  try { return new Set(JSON.parse(readFileSync(PUBLISHED, 'utf-8'))); }
  catch { return new Set(); }
}

function savePublished(set) {
  writeFileSync(PUBLISHED, JSON.stringify([...set].sort(), null, 2) + '\n', 'utf-8');
}

// Claude 응답이 ```markdown ... ``` 코드펜스로 감싸 오는 경우 제거.
// frontmatter 앞 잡담이 섞여있으면 첫 --- 부터로 잘라낸다.
// 한 번 깨지면 Astro Content Collections 빌드 전체가 fail (2026-05-23 사고).
function sanitizeMarkdown(raw) {
  let s = String(raw).trim();
  const fence = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) s = fence[1].trim();
  const fmStart = s.indexOf('---');
  if (fmStart > 0) s = s.slice(fmStart);
  return s.endsWith('\n') ? s : s + '\n';
}

// 카테고리별 분배 (re·tax·sub·biz·news 각 1편 우선, 부족 시 가용 카테고리로 보충)
function distribute(items, n = 5) {
  const PREFERRED = ['realestate', 'tax', 'subsidy', 'business', 'news'];
  const ITEMS_PER_POST = 4;
  const picks = [];
  for (const cat of PREFERRED) {
    const pool = items.filter(x => x.category === cat);
    if (pool.length === 0) continue;
    picks.push({ cat, items: pool.slice(0, ITEMS_PER_POST) });
    if (picks.length >= n) break;
  }
  // 부족 시 가용 카테고리에서 추가 (이번 회차 안 쓰인 자료)
  const usedLinks = new Set(picks.flatMap(p => p.items.map(x => x.link)));
  while (picks.length < n) {
    const remaining = items.filter(x => !usedLinks.has(x.link));
    if (remaining.length === 0) break;
    const next = remaining.slice(0, ITEMS_PER_POST);
    picks.push({ cat: next[0].category, items: next });
    next.forEach(x => usedLinks.add(x.link));
  }
  return picks.slice(0, n);
}

// pubDate 분산 — 오늘 KST 07/11/14/18/21시
function distributePubDates(n) {
  const hours = [7, 11, 14, 18, 21];
  return hours.slice(0, n).map(h => {
    const d = new Date();
    d.setHours(h - 9, 0, 0, 0);  // KST → UTC
    return d.toISOString();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 인포모아 톤 reference + 작성 원칙 = system prompt (캐싱 대상)
const SYSTEM_PROMPT = `당신은 인포모아(잡블로그) 정책 큐레이션 글을 쓰는 편집자입니다.

# 인포모아 톤 reference (이 구조·말투 그대로 따르세요)

\`\`\`markdown
${REFERENCE}
\`\`\`

# 시그니처 출력 구조 (반드시 이대로)

1. **frontmatter** (yaml): title, description, pubDate, category, tags
2. **한 줄 결론** (첫 줄, 굵게)
3. **리드 1-2문장** (왜 지금 이 글)
4. **본문**: ## 섹션 3-5개 — 무슨 일·표·함정·행동
5. **출처** 섹션 (모든 원본 링크)
6. **면책** 섹션 (정보 제공·전문 상담 권장)

# 페르소나
- 40-50대 일반인 친근한 정보 전달자
- "그래서 나한테 영향?" 관점 유지
- 어려운 용어는 (괄호) 안에 풀어쓰기
- 정치 색·과장·낚시 X
- 출처 없는 수치·법령·기관명 인용 절대 금지 (환각 방지)
- AI 군더더기 X ("물론입니다", "결론적으로", "여러분")

# 작성 원칙
- 4건 자료 모두 한 글에 담지 말 것. 가장 일반 독자에게 의미 큰 1-3건 선별
- 같은 주제 묶음이면 통합 흐름. 다양한 주제면 핵심 1건 + 보조 1-2건
- 출처는 본문에 [텍스트](URL) 자연스럽게 삽입 + 끝 푸터에 정리
- 슬러그 영문 추천 (사용자가 nts-juyo-byeonhwa 같은 패턴 선호. 단 frontmatter엔 안 들어감)

# frontmatter 정확 형식

\`\`\`yaml
---
title: '제목 — 핵심 요약'
description: '한 줄 요약 (60자 이내)'
pubDate: 2026-05-19T07:00:00.000Z
category: realestate
tags: [태그1, 태그2, 태그3, 태그4]
---
\`\`\`

# 출력 형식

순수 markdown 만 (frontmatter 포함). 코드블록·서두·설명 없이 \`---\` 부터 바로 시작.`;

async function generate(pick, pubDate) {
  const itemsText = pick.items.map((it, i) => {
    const date = it.pubDate.toISOString().slice(0, 10);
    return `[${i + 1}] (${date}) ${it.source}\n제목: ${it.title}\n요약: ${it.desc.slice(0, 400)}\n링크: ${it.link}`;
  }).join('\n\n');

  const userPrompt = `# 이번 글 메타
- 카테고리: \`${pick.cat}\`
- pubDate (정확히 이 값을 frontmatter에): ${pubDate}

# 사용할 원본 자료

${itemsText}

# 출력
시그니처 구조 그대로 순수 markdown 출력.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content[0].text;
}

// ─────────────────────────────────────────────────────────────────────────────
function slugify(s, fallback = 'post') {
  // 한글·특수문자 제거 → 영문/숫자/하이픈만
  const slug = (s || '').toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

async function main() {
  console.log('━━━ 인포모아 일 5편 자동 발행 ━━━');
  console.log(`모델: ${MODEL}`);
  console.log('');

  console.log('[1/6] RSS 14개 수집');
  const all = await fetchAllRSS();
  console.log(`     ${all.length}건 (7일 이내)`);

  console.log('[2/6] 기발행 link 제외 (중복 방지)');
  const published = loadPublished();
  const unpublished = all.filter(x => !published.has(x.link));
  console.log(`     미발행 ${unpublished.length}건 (기발행 ${published.size}건)`);

  if (unpublished.length === 0) {
    console.log('     ✗ 새 자료 없음. 종료');
    process.exit(0);
  }

  console.log('[3/6] 카테고리 분배');
  const picks = distribute(unpublished, 5);
  picks.forEach((p, i) => console.log(`     ${i + 1}. ${p.cat} (${p.items.length}건 자료)`));

  console.log('[4/6] pubDate 자연 분산');
  const pubDates = distributePubDates(picks.length);
  pubDates.forEach((d, i) => console.log(`     ${i + 1}. ${d}`));

  console.log('[5/6] Claude 호출 (Prompt Caching 활용)');
  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    try {
      let content = await generate(pick, pubDates[i]);
      content = sanitizeMarkdown(content);
      content = content.replace(/^pubDate:\s*[^\n]+/m, `pubDate: ${pubDates[i]}`);
      const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
      const slug = `auto-${pick.cat}-${today}-${i + 1}`;
      const filename = `${slug}.md`;
      writeFileSync(join(BLOG, filename), content, 'utf-8');
      console.log(`     ✓ [${i + 1}/${picks.length}] ${filename}`);
      console.log(`        ${titleMatch?.[1]?.slice(0, 60) || '?'}`);
      pick.items.forEach(x => published.add(x.link));
      results.push({ slug, cat: pick.cat, pubDate: pubDates[i] });
    } catch (e) {
      console.log(`     ✗ [${i + 1}] ${pick.cat} 실패: ${e.message.slice(0, 80)}`);
    }
  }

  console.log('[6/6] published-links.json 갱신');
  savePublished(published);

  console.log('');
  console.log(`✓ ${results.length}/${picks.length}편 생성 완료`);
}

main().catch(e => {
  console.error('✗', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
