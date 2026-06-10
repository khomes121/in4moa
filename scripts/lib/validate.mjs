// frontmatter 결정적 검증·정규화기.
//
// Claude 출력의 frontmatter 를 파싱해 content.config.ts 스키마(zod)와 같은 규칙으로
// 검증하고, **항상 안전한 YAML 로 재조립**해서 돌려준다.
// → 숫자 태그(1366), 따옴표 미스, enum 밖 카테고리 같은 "빌드 전체를 깨뜨리는"
//   사고를 LLM 운에 맡기지 않고 코드로 차단한다 (2026-06-10 CF 빌드 장애 교훈).

export const CATEGORY_SLUGS = [
  'realestate', 'tax', 'loan', 'subsidy', 'business', 'calculator', 'news',
];

/** YAML 단일따옴표 문자열 이스케이프 */
function yq(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const [, fmRaw, body] = m;
  const fm = {};
  let curKey = null;
  for (const line of fmRaw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (kv) {
      curKey = kv[1];
      fm[curKey] = kv[2].trim();
    } else if (curKey && /^\s+-\s+/.test(line)) {
      // 블록 리스트 형태 태그 지원
      fm[curKey] = (Array.isArray(fm[curKey]) ? fm[curKey] : [])
        .concat(line.replace(/^\s+-\s+/, '').trim());
    }
  }
  return { fm, body };
}

function stripQuotes(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function parseTags(v) {
  if (Array.isArray(v)) return v.map(t => stripQuotes(String(t))).filter(Boolean);
  if (typeof v !== 'string' || !v) return [];
  const m = v.match(/^\[([\s\S]*)\]$/);
  if (!m) return [stripQuotes(v)].filter(Boolean);
  return m[1].split(',').map(t => stripQuotes(t.trim())).filter(Boolean);
}

/**
 * 검증 + 정규화.
 * @returns {ok, md, issues[]} — ok=false 면 md 는 null (발행 불가 수준 결함).
 */
export function normalizePost(raw, { pubDateISO, category }) {
  const issues = [];
  const parsed = parseFrontmatter(String(raw).trim());
  if (!parsed) return { ok: false, md: null, issues: ['frontmatter 블록 없음'] };

  const { fm, body } = parsed;

  const title = stripQuotes(fm.title || '');
  const description = stripQuotes(fm.description || '');
  if (!title) return { ok: false, md: null, issues: ['title 누락'] };
  if (!description) issues.push('description 누락 → title 로 대체');

  // 카테고리: 호출자가 지정한 값을 신뢰 (enum 밖이면 news 로 강등)
  let cat = category || stripQuotes(fm.category || '');
  if (!CATEGORY_SLUGS.includes(cat)) {
    issues.push(`category '${cat}' enum 밖 → news 로 교정`);
    cat = 'news';
  }

  // 태그: 문자열 강제 + 중복 제거 + 최대 6개
  let tags = [...new Set(parseTags(fm.tags))].slice(0, 6);
  if (tags.some(t => /^\d+(\.\d+)?$/.test(t))) issues.push('숫자형 태그 → 문자열로 인용');

  // pubDate: 호출자 지정 ISO 강제 (LLM 출력 무시 — 미래/과거 날조 차단)
  const pub = pubDateISO;

  // 본문 위생: 남은 코드펜스 래핑·frontmatter 중복 제거
  let cleanBody = body.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n```\s*$/, '').trim();
  if (cleanBody.startsWith('---')) {
    issues.push('본문에 frontmatter 잔재 → 제거');
    const again = parseFrontmatter(cleanBody);
    if (again) cleanBody = again.body.trim();
  }
  if (cleanBody.length < 300) return { ok: false, md: null, issues: [...issues, `본문 ${cleanBody.length}자 — 너무 짧음`] };

  const fmOut = [
    '---',
    `title: ${yq(title)}`,
    `description: ${yq(description || title)}`,
    `pubDate: ${pub}`,
    `category: ${cat}`,
    tags.length ? `tags: [${tags.map(yq).join(', ')}]` : null,
    '---',
  ].filter(Boolean).join('\n');

  return { ok: true, md: `${fmOut}\n\n${cleanBody}\n`, issues, title, category: cat };
}
