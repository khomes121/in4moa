// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = '인포모아';
export const SITE_DESCRIPTION =
	'부동산·세금·대출·지원금 — 복잡한 돈 문제를 계산기와 가이드로 바로 풀어드립니다';
export const SITE_TAGLINE = '돈 되는 생활정보';

// ─── 수익화·측정 ───────────────────────────────────────────────
// 애드센스 승인 후 발급받은 ca-pub-XXXXXXXXXXXXXXXX 를 넣으면
// 사이트 전체에 광고 스크립트·광고 슬롯이 자동 활성화된다.
// 빈 문자열이면 광고 관련 코드가 일절 출력되지 않는다 (심사 전 상태).
export const ADSENSE_CLIENT = '';
// GA4 측정 ID (속성: 인포모아 / 스트림: 인포모아 웹, 2026-06-10 생성)
export const GA_MEASUREMENT_ID = 'G-Q504SE1NT9';

// ─── 계산기 목록 (허브·내부링크 공용) ─────────────────────────
export interface CalculatorMeta {
	slug: string;
	name: string;
	short: string;
	emoji: string;
}

export const CALCULATORS: CalculatorMeta[] = [
	{
		slug: 'acquisition-tax',
		name: '취득세 계산기',
		short: '주택 매수 시 취득세·지방교육세·농특세를 한 번에',
		emoji: '🏠',
	},
	{
		slug: 'brokerage-fee',
		name: '중개보수(복비) 계산기',
		short: '매매·전세·월세 중개수수료 상한 요율 적용',
		emoji: '🤝',
	},
	{
		slug: 'dsr',
		name: 'DSR·원리금 계산기',
		short: '월 상환액과 DSR 비율로 대출 한도 가늠',
		emoji: '💳',
	},
	{
		slug: 'subscription-score',
		name: '청약 가점 계산기',
		short: '무주택 기간·부양가족·통장 가입기간 84점 만점',
		emoji: '🎯',
	},
	{
		slug: 'jeonse-conversion',
		name: '전월세 전환 계산기',
		short: '전세↔월세 전환율로 보증금·월세 환산',
		emoji: '🔄',
	},
];

export type CategorySlug =
	| 'realestate'
	| 'tax'
	| 'loan'
	| 'subsidy'
	| 'business'
	| 'calculator'
	| 'news';

export interface CategoryMeta {
	slug: CategorySlug;
	label: string;
	description: string;
	emoji: string;
}

export const CATEGORIES: CategoryMeta[] = [
	{
		slug: 'realestate',
		label: '부동산',
		description: '청약·분양·매매·전월세 — 시장이 바뀌면 가장 먼저',
		emoji: '🏠',
	},
	{
		slug: 'tax',
		label: '세금',
		description: '취득세·양도세·종부세·증여세 — 내야 할 돈 정확히',
		emoji: '🧾',
	},
	{
		slug: 'loan',
		label: '대출·금융',
		description: '디딤돌·버팀목·DSR — 한도와 금리의 모든 것',
		emoji: '🏦',
	},
	{
		slug: 'subsidy',
		label: '지원금·복지',
		description: '근로장려금·주거급여·청년 지원 — 놓치면 손해',
		emoji: '💰',
	},
	{
		slug: 'calculator',
		label: '계산기·가이드',
		description: '취득세·복비·DSR·청약가점 — 내 케이스로 직접 계산',
		emoji: '🧮',
	},
	{
		slug: 'business',
		label: '창업·자영업',
		description: '사업자등록·부가세·정책자금 실무',
		emoji: '🏪',
	},
	{
		slug: 'news',
		label: '정책 뉴스',
		description: '오늘 나온 정책이 내 생활에 미치는 영향',
		emoji: '📌',
	},
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

// ─── 제휴(어필리에이트) ─────────────────────────────────────
// 링크프라이스 제휴 링크. 추적 ID(a=A100705184)가 박혀 있어야 수익이 인정된다.
// 더 맞는 제휴(예: 쿠팡)가 승인되면 아래 url 만 갈아끼우면 전 글에 자동 반영된다.
// 전체 끄려면 AFFILIATE_ENABLED = false.
export const AFFILIATE_ENABLED = true;
export const AFFILIATE_DISCLOSURE =
	'제휴 링크 — 위 링크로 가입·구매 시 인포모아가 일정 수수료를 받을 수 있으며, 구매가는 동일합니다.';

export interface AffiliateOffer {
	id: string;
	name: string; // 표기명
	desc: string; // 한 줄 설명(이득 중심)
	emoji: string;
	cta: string; // 버튼 문구(행동 동사)
	url: string; // 추적 링크 (a= 제휴ID 포함)
}

// 링크프라이스 클릭 링크 빌더 (a= 는 사용자 제휴 ID)
const lp = (code: string) => `https://newtip.net/click.php?m=${code}&a=A100705184&l=0000`;

export const AFFILIATES: Record<string, AffiliateOffer> = {
	credit: {
		id: 'credit',
		name: '내 신용점수, 무료로 확인하기',
		desc: '대출·전세 앞두고 있다면 — 올크레딧 30초 무료조회',
		emoji: '📊',
		cta: '무료조회',
		url: lp('allcredit'),
	},
	taxbill: {
		id: 'taxbill',
		name: '전자세금계산서 간편 발행',
		desc: '사업자라면 — 바로빌로 세금계산서·세무신고 자동화',
		emoji: '🧾',
		cta: '바로가기',
		url: lp('barobill'),
	},
	cert: {
		id: 'cert',
		name: '공동인증서 발급받기',
		desc: '정부지원금·세금 신청에 꼭 필요한 인증서 (한국정보인증)',
		emoji: '🔐',
		cta: '발급하기',
		url: lp('signgate'),
	},
	course: {
		id: 'course',
		name: '창업·실무 온라인 강의',
		desc: 'Udemy 인기 강의 수시 최대 할인',
		emoji: '🎓',
		cta: '강의 보기',
		url: lp('udemy'),
	},
	book: {
		id: 'book',
		name: '이 주제, 책으로 더 깊이',
		desc: '교보문고에서 관련 도서 찾아보기',
		emoji: '📚',
		cta: '보러가기',
		url: lp('kbbook'),
	},
};

// 카테고리별 노출 제휴 (관련도 순). 빈 배열이면 그 카테고리는 미노출.
export const AFFILIATE_BY_CAT: Record<CategorySlug, string[]> = {
	realestate: ['credit', 'book'],
	tax: ['taxbill', 'credit'],
	loan: ['credit'],
	subsidy: ['cert', 'credit'],
	business: ['taxbill', 'course'],
	calculator: ['credit'],
	news: ['credit'],
};

// 계산기 페이지별 노출 제휴 (slug 기준). 대출·세금·부동산 계산 직후라 신용조회가 자연스럽다.
export const AFFILIATE_BY_CALC: Record<string, string[]> = {
	dsr: ['credit'],
	'acquisition-tax': ['credit'],
	'brokerage-fee': ['credit'],
	'jeonse-conversion': ['credit'],
	'subscription-score': ['credit'],
};
