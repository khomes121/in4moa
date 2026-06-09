// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = '인포모아';
export const SITE_DESCRIPTION = '부동산·세금·대출·정부지원금·창업까지 — 실생활에 바로 쓰는 정보 모음';

// ─── 수익화·측정 ───────────────────────────────────────────────
// 애드센스 승인 후 발급받은 ca-pub-XXXXXXXXXXXXXXXX 를 넣으면
// 사이트 전체에 광고 스크립트·광고 슬롯이 자동 활성화된다.
// 빈 문자열이면 광고 관련 코드가 일절 출력되지 않는다 (심사 전 상태).
export const ADSENSE_CLIENT = '';
// GA4 측정 ID (G-XXXXXXXXXX). 빈 문자열이면 비활성.
export const GA_MEASUREMENT_ID = '';

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
		description: '청약·분양·매매·전월세·실거래',
		emoji: '🏠',
	},
	{
		slug: 'tax',
		label: '세금',
		description: '양도세·취득세·종부세·증여세',
		emoji: '🧾',
	},
	{
		slug: 'loan',
		label: '대출·금융',
		description: '디딤돌·보금자리·생활자금',
		emoji: '💳',
	},
	{
		slug: 'subsidy',
		label: '정부지원금',
		description: '청년·신혼·소상공인·복지',
		emoji: '🎁',
	},
	{
		slug: 'business',
		label: '창업·자영업',
		description: '인허가·세무·임대차',
		emoji: '🚀',
	},
	{
		slug: 'calculator',
		label: '계산기',
		description: 'LTV·DTI·취득세·중개수수료·청약가점·임대수익률',
		emoji: '🧮',
	},
	{
		slug: 'news',
		label: '뉴스·정책',
		description: '시의성 있는 정책·시장 동향',
		emoji: '📰',
	},
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];
