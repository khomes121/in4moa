#!/usr/bin/env node
// 인포모아 일 5편 정책 자동 발행 (로컬 버전 — Claude Code CLI 활용, API 키 불필요)
//
// 작동:
//   1. korea.kr RSS 14개 fetch → 7일 내 항목
//   2. scripts/published-links.json 의 기발행 link 제외 (중복 방지)
//   3. 카테고리별 분배 (realestate·tax·subsidy·business·news 각 1편)
//   4. Claude Code CLI (claude -p) subprocess 호출 — Pro Max OAuth 활용
//   5. pubDate 자연 분산 (오늘 KST 07/11/14/18/21시)
//   6. src/content/blog/ 에 .md 저장 + published-links.json 갱신
//   7. git add + commit + push (자동)
//
// 환경:
//   - Claude Code CLI 인증 상태 필요 (claude auth login 한 적 있음)
//   - git 인증 (credential manager 또는 SSH) 필요
//   - 사용자 계정으로 실행 (~/.claude/ 접근 위해)
//
// 사용:
//   node scripts/daily-policy-local.mjs
//   (또는 run-daily.bat 더블클릭 / 작업 스케줄러)

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream, readdirSync, unlinkSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG = join(ROOT, 'src', 'content', 'blog');
const PUBLISHED = join(__dirname, 'published-links.json');
const EVERGREEN = join(__dirname, 'evergreen-topics.json');
const LOGS = join(ROOT, 'logs');

// ─────────────────────────────────────────────────────────────────────────────
// 로그 시스템 — 콘솔 + 날짜별 로그 + latest.log + error.log + _status.json
mkdirSync(LOGS, { recursive: true });
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = join(LOGS, `${RUN_ID}.log`);
const LATEST_LOG = join(LOGS, 'latest.log');
const ERROR_LOG = join(LOGS, 'error.log');
const STATUS_FILE = join(LOGS, '_status.json');

const logStream = createWriteStream(LOG_FILE, { flags: 'a' });
const latestStream = createWriteStream(LATEST_LOG, { flags: 'w' });

const _log = console.log;
const _err = console.error;
console.log = (...args) => {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  _log(line);
  logStream.write(line + '\n');
  latestStream.write(line + '\n');
};
console.error = (...args) => {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  _err(line);
  const tagged = '[ERROR] ' + line;
  logStream.write(tagged + '\n');
  latestStream.write(tagged + '\n');
  appendFileSync(ERROR_LOG, `[${RUN_ID}] ${line}\n`);
};

function saveStatus(extra = {}) {
  const status = {
    last_run: new Date().toISOString(),
    last_run_kst: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' '),
    run_id: RUN_ID,
    log_file: `logs/${RUN_ID}.log`,
    ...extra,
  };
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2) + '\n', 'utf-8');
}

// 30일 이상 된 날짜 로그 자동 삭제 (latest·error 제외)
function rotateLogs() {
  const now = Date.now();
  const RETAIN_DAYS = 30;
  for (const f of readdirSync(LOGS)) {
    if (!f.endsWith('.log')) continue;
    if (f === 'latest.log' || f === 'error.log') continue;
    const fp = join(LOGS, f);
    try {
      const age = (now - statSync(fp).mtimeMs) / (24 * 3600 * 1000);
      if (age > RETAIN_DAYS) unlinkSync(fp);
    } catch {}
  }
}
rotateLogs();

// ─────────────────────────────────────────────────────────────────────────────
const REFERENCE = readFileSync(
  join(BLOG, 'yangdoso-1jutaek-bigwasae-2026.md'),
  'utf-8'
);

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
  // tags 배열의 숫자형 토큰을 따옴표로 감싼다 (YAML 이 숫자로 파싱 → 스키마 위반, 2026-06-10 사고)
  s = s.replace(/^tags:\s*\[([^\]]*)\]/m, (_, inner) => {
    const fixed = inner
      .split(',')
      .map(t => {
        const v = t.trim();
        return /^\d+(\.\d+)?$/.test(v) ? `'${v}'` : v;
      })
      .join(', ');
    return `tags: [${fixed}]`;
  });
  return s.endsWith('\n') ? s : s + '\n';
}

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

function distributePubDates(n) {
  const hours = [7, 11, 14, 18, 21];
  return hours.slice(0, n).map(h => {
    const d = new Date();
    d.setHours(h - 9, 0, 0, 0);  // KST → UTC
    return d.toISOString();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Code CLI subprocess

const SYSTEM_PROMPT_BASE = `당신은 인포모아(잡블로그) 정책 큐레이션 글을 쓰는 편집자입니다.

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
- **선별 기준: 독자의 돈·집·일자리에 직접 영향 있는 것 우선.** 외교 의전·기관 인사·
  기념행사·MOU 체결 같은 소재는 제외. 4건 모두 무관하면 그나마 실용적인 1건만 간결히
- 같은 주제 묶음이면 통합 흐름. 다양한 주제면 핵심 1건 + 보조 1-2건
- 출처는 본문에 [텍스트](URL) 자연스럽게 삽입 + 끝 푸터에 정리

# 내부 링크 (체류시간·SEO — 글마다 1-2개 자연스럽게)
글 내용과 관련 있을 때만, 본문 흐름 속에 마크다운 링크로 삽입:
- 취득세·매수 비용 언급 시 → [취득세 계산기](/calculator/acquisition-tax/)
- 중개수수료·복비 언급 시 → [중개보수 계산기](/calculator/brokerage-fee/)
- 대출·한도·DSR 언급 시 → [DSR 계산기](/calculator/dsr/)
- 청약·가점 언급 시 → [청약 가점 계산기](/calculator/subscription-score/)
- 전세·월세 전환 언급 시 → [전월세 전환 계산기](/calculator/jeonse-conversion/)
관련 없는 글에 억지로 넣지 말 것.`;

async function callClaudeCLI(prompt, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} reject(new Error('Claude 호출 타임아웃')); }, timeout);
    proc.stdout.on('data', d => stdout += d.toString('utf-8'));
    proc.stderr.on('data', d => stderr += d.toString('utf-8'));
    proc.on('error', err => { clearTimeout(timer); reject(new Error(`Claude spawn 실패: ${err.message}`)); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Claude exit ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
    try { proc.stdin.write(prompt, 'utf-8'); proc.stdin.end(); }
    catch (e) { clearTimeout(timer); reject(e); }
  });
}

async function generate(pick, pubDate) {
  const itemsText = pick.items.map((it, i) => {
    const date = it.pubDate.toISOString().slice(0, 10);
    return `[${i + 1}] (${date}) ${it.source}\n제목: ${it.title}\n요약: ${it.desc.slice(0, 400)}\n링크: ${it.link}`;
  }).join('\n\n');

  const fullPrompt = `${SYSTEM_PROMPT_BASE}

# 이번 글 메타
- 카테고리: \`${pick.cat}\`
- pubDate (정확히 이 값을 frontmatter에): ${pubDate}

# 사용할 원본 자료

${itemsText}

# 출력

시그니처 구조 그대로 순수 markdown 출력. 코드블록·서두·설명 없이 \`---\` 부터 바로 시작.`;

  return await callClaudeCLI(fullPrompt);
}

// ─────────────────────────────────────────────────────────────────────────────
// 에버그린 (상시 검색 수요) 글 — 큐에서 1개씩 소진

function buildEvergreenPrompt(topic, pubDate) {
  return `${SYSTEM_PROMPT_BASE}

# 이번 글: 에버그린 (뉴스 아님 — 상시 검색 수요용 기둥 글)

- 카테고리: \`${topic.category}\`
- pubDate (정확히 이 값을 frontmatter에): ${pubDate}
- 제목은 다음을 기반으로 검색 의도에 맞게 다듬어 사용: "${topic.title}"

# 다룰 내용 (사실관계 앵커 — 이 범위를 벗어난 구체 수치 창작 금지)

${topic.focus}

# 에버그린 글 추가 원칙 (뉴스 글과 다른 점)

- 분량 1500자 이상. ## 섹션 4-6개 + 표 1개 이상 + 자주 묻는 질문(### Q 형식) 2-3개
- 제도 수치(금액·요율·한도)가 자주 바뀌는 항목은 정확한 숫자 단정 대신
  "글 작성 시점 기준이며 최신 기준은 [공식 사이트]에서 확인" 패턴 사용
- 출처 링크는 정부 공식 사이트만: 홈택스(hometax.go.kr), 정부24(gov.kr), 복지로(bokjiro.go.kr),
  위택스(wetax.go.kr), 청약홈(applyhome.co.kr), 주택도시기금(nhuf.molit.go.kr),
  인터넷등기소(iros.go.kr), 워크넷(work24.go.kr), 소상공인시장진흥공단(semas.or.kr) 등
  실재가 확실한 도메인만. 존재가 불확실한 세부 URL 경로는 만들지 말고 도메인 루트만 링크
- 마지막 섹션 전에 "행동 체크리스트" (체크박스 또는 번호 목록 5개 내외)
${topic.calc ? `- 본문에서 [관련 계산기](/calculator/${topic.calc}/) 를 2회 이상 자연스럽게 링크` : ''}

# 출력

시그니처 구조 그대로 순수 markdown 출력. 코드블록·서두·설명 없이 \`---\` 부터 바로 시작.`;
}

async function publishEvergreen(pubDate) {
  if (!existsSync(EVERGREEN)) return null;
  let data;
  try { data = JSON.parse(readFileSync(EVERGREEN, 'utf-8')); }
  catch (e) { console.log('     ✗ evergreen-topics.json 파싱 실패:', e.message); return null; }

  const topic = (data.topics || []).find(t => !t.done);
  if (!topic) { console.log('     큐 소진 — 에버그린 주제 없음'); return null; }

  let content = await callClaudeCLI(buildEvergreenPrompt(topic, pubDate), 240000);
  content = sanitizeMarkdown(content);
  content = content.replace(/^pubDate:\s*[^\n]+/m, `pubDate: ${pubDate}`);

  let slug = topic.slug;
  for (let suffix = 'a'.charCodeAt(0); existsSync(join(BLOG, `${slug}.md`)); suffix++) {
    slug = `${topic.slug}-${String.fromCharCode(suffix)}`;
  }
  writeFileSync(join(BLOG, `${slug}.md`), content, 'utf-8');

  topic.done = true;
  topic.publishedAt = new Date().toISOString().slice(0, 10);
  topic.publishedSlug = slug;
  writeFileSync(EVERGREEN, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  return { slug, cat: topic.category, title: titleMatch?.[1] || topic.title };
}

// ─────────────────────────────────────────────────────────────────────────────
function runGit(...args) {
  return execSync(`git ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`, {
    cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function gitCommitAndPush(count, date) {
  try {
    runGit('add', 'src/content/blog/', 'scripts/published-links.json', 'scripts/evergreen-topics.json');
  } catch (e) {
    console.log('git add 실패:', e.message);
    return false;
  }
  try {
    runGit('diff', '--cached', '--quiet');
    console.log('변경 없음. git push 스킵');
    return false;
  } catch {
    // diff --cached --quiet 가 exit 1 = 변경 있음
  }
  try {
    runGit('commit', '-m', `feat(auto): 일일 정책 ${count}편 자동 발행 (${date})`);
    runGit('push');
    return true;
  } catch (e) {
    console.log('git commit/push 실패:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log('━━━ 인포모아 일 5편 자동 발행 (로컬) ━━━');
  console.log(`시작: ${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')} KST`);
  console.log(`Run ID: ${RUN_ID}`);
  console.log('');

  saveStatus({ phase: 'started', success: 0 });

  console.log('[1/8] RSS 14개 수집');
  const all = await fetchAllRSS();
  console.log(`     ${all.length}건 (7일 이내)`);

  console.log('[2/8] 기발행 link 제외');
  const published = loadPublished();
  const unpublished = all.filter(x => !published.has(x.link));
  console.log(`     미발행 ${unpublished.length}건 (기발행 ${published.size}건)`);

  if (unpublished.length === 0) {
    console.log('     ✗ 새 자료 없음. 종료');
    saveStatus({ phase: 'no-new-items', success: 0, total: 0, elapsed_sec: Math.round((Date.now() - startTime) / 1000) });
    process.exit(0);
  }

  console.log('[3/8] 카테고리 분배');
  const picks = distribute(unpublished, 5);
  picks.forEach((p, i) => console.log(`     ${i + 1}. ${p.cat} (${p.items.length}건)`));

  console.log('[4/8] pubDate 자연 분산');
  const pubDates = distributePubDates(picks.length);

  console.log('[5/8] Claude Code CLI 호출');
  const today = new Date().toISOString().slice(0, 10);
  let success = 0;
  const failures = [];
  const results = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    try {
      let content = await generate(pick, pubDates[i]);
      content = sanitizeMarkdown(content);
      content = content.replace(/^pubDate:\s*[^\n]+/m, `pubDate: ${pubDates[i]}`);
      const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
      let slug = `auto-${pick.cat}-${today}-${i + 1}`;
      // 같은 날 재실행 시 슬러그 충돌 → -a, -b, -c 접미사로 회피 (2026-05-23 사고)
      for (let suffix = 'a'.charCodeAt(0); existsSync(join(BLOG, `${slug}.md`)); suffix++) {
        slug = `auto-${pick.cat}-${today}-${i + 1}${String.fromCharCode(suffix)}`;
      }
      writeFileSync(join(BLOG, `${slug}.md`), content, 'utf-8');
      console.log(`     ✓ [${i + 1}/${picks.length}] ${slug}.md`);
      console.log(`        ${titleMatch?.[1]?.slice(0, 60) || '?'}`);
      pick.items.forEach(x => published.add(x.link));
      success++;
      results.push({ slug, cat: pick.cat, title: titleMatch?.[1] || '?' });
    } catch (e) {
      console.log(`     ✗ [${i + 1}] ${pick.cat} 실패: ${e.message.slice(0, 100)}`);
      failures.push({ index: i + 1, cat: pick.cat, error: e.message.slice(0, 200) });
    }
  }

  console.log('[6/8] 에버그린 1편 발행 (큐)');
  try {
    const everDate = (() => { const d = new Date(); d.setHours(9 - 9, 30, 0, 0); return d.toISOString(); })(); // KST 09:30
    const ever = await publishEvergreen(everDate);
    if (ever) {
      console.log(`     ✓ ${ever.slug}.md`);
      console.log(`        ${ever.title.slice(0, 60)}`);
      success++;
      results.push(ever);
    }
  } catch (e) {
    console.log(`     ✗ 에버그린 실패: ${e.message.slice(0, 100)}`);
    failures.push({ index: 'evergreen', cat: 'evergreen', error: e.message.slice(0, 200) });
  }

  console.log('[7/8] published-links.json 갱신');
  savePublished(published);

  console.log('[8/8] git commit + push');
  let pushed = false;
  if (success > 0) {
    pushed = gitCommitAndPush(success, today);
    if (pushed) console.log(`     ✓ ${success}편 push 완료 → CF Workers 자동 빌드`);
  } else {
    console.log('     ✗ 생성된 글 0편. git 작업 스킵');
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('');
  console.log(`✓ 완료 ${success}/${picks.length}편 (${elapsed}초)`);

  saveStatus({
    phase: 'completed',
    success, total: picks.length, failed: failures.length,
    pushed, elapsed_sec: elapsed,
    posts: results,
    failures,
  });
}

main().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
