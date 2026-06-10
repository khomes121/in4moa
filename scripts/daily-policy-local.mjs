#!/usr/bin/env node
// 인포모아 일일 콘텐츠 자동 발행 파이프라인 v2 (2026-06-11 전면 개편)
//
// v1 대비 개선 (content-creator·콘텐츠 스튜디오 기술 이식):
//   1. KST 단일 시간 유틸 — UTC 혼용으로 슬러그가 전날로 찍히던 버그 근본 수정
//   2. 정직한 pubDate — 실행 시각 기준 분 단위 분산 (미래 시각 날조 제거)
//   3. 프롬프트 라이브러리 분리 (prompts.mjs) + 오늘 날짜 앵커 주입
//   4. 황금키워드 스코어링 — 추천순이 아니라 "돈·집·일자리 영향 × 행동의지" 점수로 자료 선별
//   5. 구글 트렌드(KR) 연동 — 급상승 검색어와 겹치는 자료는 이슈 슬롯으로 추가 발행
//   6. 검수 전문 에이전트 — 생성 후 별도 Claude 가 환각·금지표현 점검 (스튜디오 §11 패턴)
//   7. 결정적 frontmatter 정규화 (lib/validate.mjs) — YAML 사고 원천 차단
//   8. 푸시 전 로컬 빌드 게이트 — 실패 파일 자동 격리, 깨진 콘텐츠는 push 불가
//   9. 하루 1회 가드 — 스케줄러 중복 실행 방지 (--force 로 무시)
//
// 발행 구성 (하루 1회):
//   뉴스 5편 (카테고리별) + 이슈 0-1편 (트렌드 매칭 시) + 에버그린 1편 (큐)
//
// 사용:
//   node scripts/daily-policy-local.mjs            # 실제 발행
//   node scripts/daily-policy-local.mjs --dry-run  # 생성만, 저장·발송 안 함
//   node scripts/daily-policy-local.mjs --force    # 오늘 이미 발행했어도 재실행
//   node scripts/daily-policy-local.mjs --no-review# 검수 에이전트 생략 (빠른 테스트)

import { spawn, execSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream,
  readdirSync, unlinkSync, statSync, appendFileSync, renameSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kstDate, kstDateTime, kstStamp, spreadPubDates } from './lib/kst.mjs';
import { normalizePost } from './lib/validate.mjs';
import { buildNewsPrompt, buildEvergreenPrompt, buildReviewerPrompt } from './prompts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG = join(ROOT, 'src', 'content', 'blog');
const PUBLISHED = join(__dirname, 'published-links.json');
const EVERGREEN = join(__dirname, 'evergreen-topics.json');
const QUARANTINE = join(ROOT, '_quarantine');
const LOGS = join(ROOT, 'logs');

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const NO_REVIEW = process.argv.includes('--no-review');

// ─────────────────────────────────────────────────────────────────────────────
// 로그 — 콘솔 + 날짜별 + latest + error + _status.json (모두 KST)
mkdirSync(LOGS, { recursive: true });
const RUN_ID = kstStamp();
const LOG_FILE = join(LOGS, `${RUN_ID}.log`);
const STATUS_FILE = join(LOGS, '_status.json');
const logStream = createWriteStream(LOG_FILE, { flags: 'a' });
const latestStream = createWriteStream(join(LOGS, 'latest.log'), { flags: 'w' });

const _log = console.log;
console.log = (...a) => {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  _log(line); logStream.write(line + '\n'); latestStream.write(line + '\n');
};
console.error = (...a) => {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  _log('[ERROR] ' + line); logStream.write('[ERROR] ' + line + '\n');
  latestStream.write('[ERROR] ' + line + '\n');
  appendFileSync(join(LOGS, 'error.log'), `[${RUN_ID}] ${line}\n`);
};

function saveStatus(extra = {}) {
  writeFileSync(STATUS_FILE, JSON.stringify({
    last_run: new Date().toISOString(),
    last_run_kst: kstDateTime(),
    run_id: RUN_ID,
    log_file: `logs/${RUN_ID}.log`,
    ...extra,
  }, null, 2) + '\n', 'utf-8');
}

// 30일 지난 로그 정리
for (const f of readdirSync(LOGS)) {
  if (!f.endsWith('.log') || f === 'latest.log' || f === 'error.log') continue;
  try {
    if ((Date.now() - statSync(join(LOGS, f)).mtimeMs) / 86400000 > 30) unlinkSync(join(LOGS, f));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
const REFERENCE = readFileSync(join(BLOG, 'yangdoso-1jutaek-bigwasae-2026.md'), 'utf-8');

const DEPT_CAT = {
  '통합': 'news', '기획재정부': 'tax', '국토교통부': 'realestate',
  '산업통상자원부': 'business', '교육부': 'subsidy', '여성가족부': 'subsidy',
  '과학기술정보통신부': 'news', '국세청': 'tax',
  '고용노동부': 'subsidy', '법무부': 'news', '행정안전부': 'news',
  '중소벤처기업부': 'business',
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
  { name: '중소벤처기업부', dept: '중소벤처기업부', url: 'https://www.korea.kr/rss/dept_mss.xml' },
  { name: '과학기술정보통신부', dept: '과학기술정보통신부', url: 'https://www.korea.kr/rss/dept_msit.xml' },
  { name: '국세청', dept: '국세청', url: 'https://www.korea.kr/rss/dept_nts.xml' },
  { name: '고용노동부', dept: '고용노동부', url: 'https://www.korea.kr/rss/dept_moel.xml' },
  { name: '법무부', dept: '법무부', url: 'https://www.korea.kr/rss/dept_moj.xml' },
  { name: '행정안전부', dept: '행정안전부', url: 'https://www.korea.kr/rss/dept_mois.xml' },
];

// ─── 황금키워드 사전 (검색량 × CPC × 행동의지 프록시) ──────────────
// 알파남 매트릭스: 가입·신청·납부·조회로 이어지는 고단가 단어가 돈이 된다.
const CPC_KEYWORDS = [
  '지원금', '환급', '신청', '대출', '한도', '금리', '청약', '분양', '전세', '월세',
  '세금', '공제', '연말정산', '보조금', '수당', '급여', '연금', '계좌', '혜택',
  '마감', '시행', '과태료', '단속', '요금', '인상', '인하', '무료', '감면', '면제',
];
// 생활 무관 소재 감점
const PENALTY_KEYWORDS = [
  '외교', '정상회담', 'MOU', '업무협약', '기념식', '시상', '임명', '위촉',
  '포럼', '세미나', '간담회', '컨퍼런스', '박람회 개막', '방문단',
];
// 트렌드 검색어 → 우리 카테고리 매핑 사전
const TREND_DOMAIN = {
  realestate: ['아파트', '전세', '월세', '청약', '분양', '집값', '부동산', '재건축', '재개발', '입주'],
  tax: ['세금', '연말정산', '종부세', '양도세', '상속세', '증여세', '재산세', '취득세', '홈택스'],
  loan: ['대출', '금리', 'DSR', '주담대', '버팀목', '디딤돌', '보금자리'],
  subsidy: ['지원금', '수당', '급여', '연금', '바우처', '복지', '장려금', '민생'],
  business: ['소상공인', '자영업', '창업', '부가세', '폐업', '정책자금'],
};

// ─────────────────────────────────────────────────────────────────────────────
// fetch helpers

function ext(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function fetchOne(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'in4moa-bot/0.2' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(b => {
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
  } catch { return []; }
}

async function fetchAllRSS() {
  const since = Date.now() - 7 * 86400000;
  const all = (await Promise.all(FEEDS.map(fetchOne))).flat()
    .filter(x => x.pubDate.getTime() >= since);
  const seen = new Set();
  return all.filter(x => !seen.has(x.link) && seen.add(x.link))
    .sort((a, b) => b.pubDate - a.pubDate);
}

// 구글 트렌드 급상승 검색어 (KR) — 키 불필요 공개 RSS. 실패해도 파이프라인 계속.
async function fetchTrends() {
  try {
    const r = await fetch('https://trends.google.com/trending/rss?geo=KR', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(b => ({
      keyword: ext(b, 'title'),
      traffic: ext(b, 'ht:approx_traffic'),
    })).filter(t => t.keyword);
  } catch (e) {
    console.log(`     트렌드 수집 실패 (무시): ${e.message.slice(0, 80)}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 주제 선정 — 황금키워드 스코어링

function scoreItem(it, trendKws) {
  const text = it.title + ' ' + it.desc.slice(0, 200);
  let s = 0;
  const ageH = (Date.now() - it.pubDate.getTime()) / 3600000;
  s += ageH <= 24 ? 3 : ageH <= 48 ? 2 : 1;                       // 신선도
  let hits = 0;
  for (const k of CPC_KEYWORDS) if (text.includes(k)) hits++;
  s += Math.min(hits, 3) * 2;                                      // 행동·고단가 키워드
  for (const k of PENALTY_KEYWORDS) if (text.includes(k)) s -= 4;  // 생활 무관 감점
  for (const t of trendKws) {
    if (t.keyword.length >= 2 && text.includes(t.keyword)) {       // 급상승 검색어 일치
      s += 8; it.trendKw = t.keyword;
      break;
    }
  }
  return s;
}

function distribute(items, trends, n = 5) {
  const PREFERRED = ['realestate', 'tax', 'subsidy', 'business', 'news'];
  const PER_POST = 4;
  items.forEach(it => { it.score = scoreItem(it, trends); });

  const picks = [];
  const used = new Set();
  for (const cat of PREFERRED) {
    const pool = items.filter(x => x.category === cat && !used.has(x.link))
      .sort((a, b) => b.score - a.score || b.pubDate - a.pubDate);
    if (!pool.length) continue;
    const sel = pool.slice(0, PER_POST);
    sel.forEach(x => used.add(x.link));
    picks.push({ kind: 'news', cat, items: sel });
    if (picks.length >= n) break;
  }
  while (picks.length < n) {
    const remaining = items.filter(x => !used.has(x.link))
      .sort((a, b) => b.score - a.score);
    if (!remaining.length) break;
    const sel = remaining.slice(0, PER_POST);
    sel.forEach(x => used.add(x.link));
    picks.push({ kind: 'news', cat: sel[0].category, items: sel });
  }

  // 이슈 슬롯: 급상승 검색어 ↔ 우리 도메인 ↔ RSS 자료 3중 매칭 시 1편 추가
  const issue = findIssuePick(items, trends, used);
  if (issue) picks.push(issue);
  return picks.slice(0, n + 1);
}

function findIssuePick(items, trends, used) {
  for (const t of trends) {
    if (!t.keyword || t.keyword.length < 2) continue;
    // 트렌드 키워드가 우리 도메인에 속하는가
    let cat = null;
    for (const [c, kws] of Object.entries(TREND_DOMAIN)) {
      if (kws.some(k => t.keyword.includes(k))) { cat = c; break; }
    }
    if (!cat) continue;
    // 근거 자료가 있는가 (환각 방지 — 자료 없으면 발행 안 함)
    const matched = items.filter(x =>
      (x.title + x.desc).includes(t.keyword) ||
      t.keyword.split(/\s+/).every(w => w.length >= 2 && (x.title + x.desc).includes(w)));
    const fresh = matched.filter(x => !used.has(x.link));
    const pool = (fresh.length ? fresh : matched).slice(0, 4);
    if (!pool.length) continue;
    console.log(`     🔥 이슈 슬롯: "${t.keyword}" (${t.traffic || '?'}) → ${cat}, 근거 ${pool.length}건`);
    pool.forEach(x => used.add(x.link));
    return { kind: 'issue', cat, items: pool, trendKw: t.keyword };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude CLI

async function callClaude(prompt, timeout = 240000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: true, windowsHide: true,
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} reject(new Error('Claude 호출 타임아웃')); }, timeout);
    proc.stdout.on('data', d => stdout += d.toString('utf-8'));
    proc.stderr.on('data', d => stderr += d.toString('utf-8'));
    proc.on('error', e => { clearTimeout(timer); reject(new Error(`Claude spawn 실패: ${e.message}`)); });
    proc.on('close', code => {
      clearTimeout(timer);
      code !== 0 ? reject(new Error(`Claude exit ${code}: ${stderr.slice(0, 200)}`)) : resolve(stdout.trim());
    });
    proc.stdin.write(prompt, 'utf-8'); proc.stdin.end();
  });
}

// 생성 → 정규화 → 검수 에이전트 → 재정규화
async function generateAndReview({ prompt, sourcesText, category, pubDateISO, label }) {
  const draft = await callClaude(prompt);
  let norm = normalizePost(draft, { pubDateISO, category });
  if (!norm.ok) throw new Error(`정규화 실패: ${norm.issues.join('; ')}`);
  if (norm.issues.length) console.log(`        정규화: ${norm.issues.join('; ')}`);

  if (NO_REVIEW) return norm;
  try {
    const verdict = await callClaude(
      buildReviewerPrompt({ draftMd: norm.md, sourcesText, category }), 240000);
    if (verdict.trim().toUpperCase() === 'PASS') {
      console.log('        검수: PASS');
      return norm;
    }
    const fixed = normalizePost(verdict, { pubDateISO, category });
    if (fixed.ok) {
      console.log('        검수: 수정본 적용');
      return fixed;
    }
    console.log(`        검수 출력 비정상(${fixed.issues.join('; ')}) → 초안 유지`);
    return norm;
  } catch (e) {
    console.log(`        검수 실패(무시, 초안 유지): ${e.message.slice(0, 80)}`);
    return norm;
  }
}

function uniqueSlug(base) {
  let slug = base;
  for (let s = 'a'.charCodeAt(0); existsSync(join(BLOG, `${slug}.md`)); s++) {
    slug = `${base}${String.fromCharCode(s)}`;
  }
  return slug;
}

// ─────────────────────────────────────────────────────────────────────────────
// 에버그린

async function publishEvergreen(pubDateISO) {
  if (!existsSync(EVERGREEN)) return null;
  const data = JSON.parse(readFileSync(EVERGREEN, 'utf-8'));
  const topic = (data.topics || []).find(t => !t.done);
  if (!topic) { console.log('     큐 소진 — 에버그린 주제 없음'); return null; }

  const norm = await generateAndReview({
    prompt: buildEvergreenPrompt({ referenceMd: REFERENCE, topic, pubDateISO }),
    sourcesText: null,
    category: topic.category,
    pubDateISO,
    label: 'evergreen',
  });

  const slug = uniqueSlug(topic.slug);
  if (!DRY) {
    writeFileSync(join(BLOG, `${slug}.md`), norm.md, 'utf-8');
    topic.done = true;
    topic.publishedAt = kstDate();
    topic.publishedSlug = slug;
    writeFileSync(EVERGREEN, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
  return { slug, cat: topic.category, title: norm.title };
}

// ─────────────────────────────────────────────────────────────────────────────
// 빌드 게이트 — 깨진 콘텐츠는 push 전에 잡는다

function tryBuild() {
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 300000 });
    return { ok: true };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    // Astro 에러에서 문제 파일 추출: "blog → slug-name" 또는 Location 경로
    const m = out.match(/blog → ([\w-]+)/) || out.match(/src[\\/]content[\\/]blog[\\/]([\w-]+)\.mdx?/);
    return { ok: false, badSlug: m?.[1] || null, log: out.slice(-1500) };
  }
}

function buildGate(newSlugs) {
  mkdirSync(QUARANTINE, { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`     빌드 검증 ${attempt}/3 ...`);
    const r = tryBuild();
    if (r.ok) { console.log('     ✓ 빌드 통과'); return { ok: true, quarantined: [] }; }
    if (r.badSlug && newSlugs.includes(r.badSlug)) {
      const from = join(BLOG, `${r.badSlug}.md`);
      const to = join(QUARANTINE, `${RUN_ID}_${r.badSlug}.md`);
      renameSync(from, to);
      console.error(`     ✗ 빌드 실패 — ${r.badSlug} 격리 (${basename(to)})`);
      newSlugs.splice(newSlugs.indexOf(r.badSlug), 1);
      continue;
    }
    // 이번 실행 파일이 원인이 아니거나 식별 불가 → 전체 중단 (기존 콘텐츠 보호)
    console.error('     ✗ 빌드 실패 — 이번 실행 외 원인. push 중단');
    console.error(r.log);
    return { ok: false, quarantined: [] };
  }
  return { ok: false, quarantined: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// git

function runGit(...args) {
  return execSync(`git ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`,
    { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function gitCommitAndPush(count, dateStr) {
  try {
    runGit('add', 'src/content/blog/', 'scripts/published-links.json', 'scripts/evergreen-topics.json');
    try { runGit('diff', '--cached', '--quiet'); console.log('변경 없음. push 스킵'); return false; }
    catch { /* 변경 있음 */ }
    runGit('commit', '-m', `feat(auto): 일일 콘텐츠 ${count}편 자동 발행 (${dateStr})`);
    runGit('push');
    return true;
  } catch (e) {
    console.error('git 실패:', e.message.slice(0, 200));
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const today = kstDate();
  console.log('━━━ 인포모아 일일 자동 발행 v2 ━━━');
  console.log(`시작: ${kstDateTime()} KST · Run ${RUN_ID}${DRY ? ' (DRY-RUN)' : ''}`);

  // [0] 하루 1회 가드
  if (!FORCE && !DRY && existsSync(STATUS_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
      if (prev.phase === 'completed' && (prev.last_run_kst || '').slice(0, 10) === today) {
        console.log(`오늘(${today}) 이미 발행 완료 (${prev.last_run_kst}). 종료 — 재실행은 --force`);
        return;
      }
    } catch {}
  }
  saveStatus({ phase: 'started', success: 0 });

  console.log('[1/8] RSS 수집');
  const all = await fetchAllRSS();
  console.log(`     ${all.length}건 (7일 이내)`);

  console.log('[2/8] 구글 트렌드 급상승 검색어 (KR)');
  const trends = await fetchTrends();
  console.log(`     ${trends.length}건${trends.length ? ' — 상위: ' + trends.slice(0, 5).map(t => t.keyword).join(', ') : ''}`);

  console.log('[3/8] 기발행 제외');
  const published = new Set(existsSync(PUBLISHED) ? JSON.parse(readFileSync(PUBLISHED, 'utf-8')) : []);
  const unpublished = all.filter(x => !published.has(x.link));
  console.log(`     미발행 ${unpublished.length}건 (기발행 ${published.size}건)`);
  if (!unpublished.length) {
    console.log('     새 자료 없음. 에버그린만 진행');
  }

  console.log('[4/8] 황금키워드 스코어링 + 분배');
  // 발행량 랜덤화: 뉴스 3~5편 (매일 같은 개수로 찍히는 기계적 패턴 방지)
  const newsCount = 3 + Math.floor(Math.random() * 3);
  console.log(`     오늘 뉴스 목표: ${newsCount}편 (랜덤 3~5)`);
  const picks = distribute(unpublished, trends, newsCount);
  picks.forEach((p, i) => console.log(
    `     ${i + 1}. [${p.kind}] ${p.cat} (${p.items.length}건, 최고점 ${Math.max(...p.items.map(x => x.score ?? 0))})${p.trendKw ? ` 🔥${p.trendKw}` : ''}`));

  console.log('[5/8] 생성 + 검수');
  const pubDates = spreadPubDates(picks.length + 1); // 랜덤 간격, 마지막 1개는 에버그린용
  let success = 0;
  const results = [], failures = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    try {
      const sourcesText = pick.items.map(x => `- ${x.title} (${x.link})`).join('\n');
      let prompt = buildNewsPrompt({
        referenceMd: REFERENCE, items: pick.items,
        category: pick.cat, pubDateISO: pubDates[i],
      });
      if (pick.kind === 'issue') {
        prompt += `\n\n# 이슈 부스터\n지금 "${pick.trendKw}" 검색이 급상승 중입니다. 제목과 첫 문단에 이 키워드를 자연스럽게 포함하고, 검색해서 들어온 사람이 가장 궁금해할 질문에 먼저 답하세요.`;
      }
      const norm = await generateAndReview({
        prompt, sourcesText, category: pick.cat, pubDateISO: pubDates[i], label: pick.kind,
      });
      const base = pick.kind === 'issue' ? `issue-${pick.cat}-${today}` : `auto-${pick.cat}-${today}-${i + 1}`;
      const slug = uniqueSlug(base);
      if (!DRY) {
        writeFileSync(join(BLOG, `${slug}.md`), norm.md, 'utf-8');
        pick.items.forEach(x => published.add(x.link));
      }
      console.log(`     ✓ [${i + 1}/${picks.length}] ${slug}.md`);
      console.log(`        ${norm.title.slice(0, 70)}`);
      success++; results.push({ slug, cat: pick.cat, kind: pick.kind, title: norm.title });
    } catch (e) {
      console.error(`     ✗ [${i + 1}] ${pick.cat} 실패: ${e.message.slice(0, 120)}`);
      failures.push({ index: i + 1, cat: pick.cat, error: e.message.slice(0, 200) });
    }
  }

  console.log('[6/8] 에버그린');
  // 75% 확률로 1편 (가끔 쉬어 가는 날 — 발행 패턴 자연화. 큐는 그만큼 천천히 소진)
  const everToday = Math.random() < 0.75;
  if (!everToday) console.log('     오늘은 에버그린 휴식일 (랜덤 25%)');
  try {
    const ever = everToday ? await publishEvergreen(pubDates[picks.length]) : null;
    if (ever) {
      console.log(`     ✓ ${ever.slug}.md`);
      console.log(`        ${ever.title.slice(0, 70)}`);
      success++; results.push({ ...ever, kind: 'evergreen' });
    }
  } catch (e) {
    console.error(`     ✗ 에버그린 실패: ${e.message.slice(0, 120)}`);
    failures.push({ index: 'evergreen', cat: 'evergreen', error: e.message.slice(0, 200) });
  }

  if (DRY) {
    console.log(`\n✓ DRY-RUN 완료 ${success}편 (${Math.round((Date.now() - t0) / 1000)}초)`);
    return;
  }

  writeFileSync(PUBLISHED, JSON.stringify([...published].sort(), null, 2) + '\n', 'utf-8');

  console.log('[7/8] 빌드 게이트');
  const newSlugs = results.map(r => r.slug);
  const gate = success > 0 ? buildGate(newSlugs) : { ok: false };
  const survivors = results.filter(r => newSlugs.includes(r.slug));

  console.log('[8/8] git commit + push');
  let pushed = false;
  if (success > 0 && gate.ok) {
    pushed = gitCommitAndPush(survivors.length, today);
    if (pushed) console.log(`     ✓ ${survivors.length}편 push → CF 자동 배포`);
  } else {
    console.log('     발행 가능한 글 없음 또는 빌드 실패. push 스킵');
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✓ 완료 ${survivors.length}편 발행 / 격리 ${results.length - survivors.length}편 / 실패 ${failures.length}건 (${elapsed}초)`);
  saveStatus({
    phase: 'completed',
    success: survivors.length,
    total: results.length,
    failed: failures.length,
    quarantined: results.length - survivors.length,
    pushed, elapsed_sec: elapsed,
    posts: survivors, failures,
  });
}

main().catch(e => {
  console.error('✗ 파이프라인 중단:', e.message);
  saveStatus({ phase: 'crashed', error: e.message.slice(0, 300) });
  process.exit(1);
});
