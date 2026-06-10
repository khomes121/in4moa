// KST(Asia/Seoul) 단일 시간 유틸.
//
// 배경: 기존 파이프라인이 UTC(toISOString)와 로컬 시간을 혼용해서
// 새벽~오전 9시(KST) 실행 시 슬러그·대상일이 전날로 찍히는 버그가 있었다
// (2026-06-10 발행 글이 auto-*-2026-06-09 로 생성된 사고).
// 이 모듈을 통해서만 날짜·시각을 만들면 그 계급의 버그가 사라진다.

const KST_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

function parts(d = new Date()) {
  const p = {};
  for (const { type, value } of KST_FMT.formatToParts(d)) p[type] = value;
  // en-CA 의 hour 가 24로 나오는 케이스(자정) 방어
  if (p.hour === '24') p.hour = '00';
  return p;
}

/** KST 기준 'YYYY-MM-DD' */
export function kstDate(d = new Date()) {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** KST 기준 'YYYY-MM-DD HH:mm:ss' (로그·status 표기용) */
export function kstDateTime(d = new Date()) {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** KST 기준 'YYYY-MM-DDTHH-mm-ss' (RUN_ID·파일명용) */
export function kstStamp(d = new Date()) {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}`;
}

/** KST 요일 ('월'~'일') */
export function kstWeekday(d = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(d);
}

/** KST 기준 어제 'YYYY-MM-DD' */
export function kstYesterday(d = new Date()) {
  return kstDate(new Date(d.getTime() - 24 * 3600 * 1000));
}

/**
 * 발행 시각 분산: 실행 시각부터 글마다 랜덤 간격(기본 2~9분)으로 n개의 ISO 문자열.
 * 과거·미래 가짜 시각 없이 "실제 발행 시각"을 정직하게 기록하되,
 * 간격을 불규칙하게 해서 기계적 패턴을 없앤다.
 */
export function spreadPubDates(n, { minGapMin = 2, maxGapMin = 9, from = new Date() } = {}) {
  const out = [];
  let t = from.getTime();
  for (let i = 0; i < n; i++) {
    out.push(new Date(t).toISOString());
    t += (minGapMin + Math.random() * (maxGapMin - minGapMin)) * 60 * 1000;
  }
  return out;
}
