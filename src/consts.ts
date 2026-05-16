// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = '인포모아';
export const SITE_DESCRIPTION = '부동산·세금·대출·정부지원금·창업까지 — 실생활에 바로 쓰는 정보 모음';

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
