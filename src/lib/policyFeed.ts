import { XMLParser } from 'fast-xml-parser';
import type { CategorySlug } from '../consts';

const RSS_URL = 'https://www.korea.kr/rss/pressrelease.xml';

export interface PolicyItem {
	title: string;
	ministry: string;
	link: string;
	pubDate: Date;
	summary: string;
	category: CategorySlug | 'misc';
}

const MINISTRY_TO_CATEGORY: Record<string, CategorySlug> = {
	국토교통부: 'realestate',
	한국부동산원: 'realestate',
	LH: 'realestate',
	한국토지주택공사: 'realestate',
	주택도시보증공사: 'realestate',
	국세청: 'tax',
	기획재정부: 'tax',
	금융위원회: 'loan',
	금융감독원: 'loan',
	한국은행: 'loan',
	한국주택금융공사: 'loan',
	보건복지부: 'subsidy',
	여성가족부: 'subsidy',
	행정안전부: 'subsidy',
	고용노동부: 'business',
	중소벤처기업부: 'business',
	소상공인시장진흥공단: 'business',
	창업진흥원: 'business',
};

const KEYWORD_TO_CATEGORY: Array<[RegExp, CategorySlug]> = [
	[/양도세|취득세|종합부동산세|종부세|증여세|상속세|소득세|법인세|부가세|세법|세무|연말정산/, 'tax'],
	[/디딤돌|보금자리|대출|금리|DSR|LTV|DTI|예적금|예금|적금|주택담보|COFIX/, 'loan'],
	[/청약|분양|실거래|전세|월세|임대주택|매매|부동산|아파트|오피스텔|단독주택|다세대|연립|토지|공시가격|재건축|재개발/, 'realestate'],
	[/청년|신혼|소상공인|보조금|복지|지원금|바우처|장려금|기초생활|차상위/, 'subsidy'],
	[/창업|사업자등록|임대차|자영업|폐업|간이과세|소상공인/, 'business'],
];

function classify(
	rawTitle: string,
	ministry: string,
	summary: string,
): PolicyItem['category'] {
	const m = MINISTRY_TO_CATEGORY[ministry];
	if (m) return m;
	const haystack = `${rawTitle} ${summary}`;
	for (const [re, cat] of KEYWORD_TO_CATEGORY) {
		if (re.test(haystack)) return cat;
	}
	return 'misc';
}

function looksLikeMinistry(s: string): boolean {
	if (!s) return false;
	return /^[가-힣()\s·\/]{2,20}$/.test(s);
}

function stripHTML(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&ndash;/g, '–')
		.replace(/&middot;/g, '·')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseTitle(rawTitle: string): { title: string; ministry: string } {
	const cleaned = rawTitle.trim();
	const m1 = cleaned.match(/^\[([^\]]+)\]\[([^\]]+)\]\s*(.+)$/);
	if (m1) return { ministry: m1[1].trim(), title: m1[3].trim() };
	const m2 = cleaned.match(/^\[([^\]]+)\]\s*(.+)$/);
	if (m2) return { ministry: m2[1].trim(), title: m2[2].trim() };
	return { ministry: '미상', title: cleaned };
}

function readCData(v: unknown): string {
	if (typeof v === 'string') return v;
	if (v && typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if (typeof o['#text'] === 'string') return o['#text'] as string;
		if (typeof o['__cdata'] === 'string') return o['__cdata'] as string;
	}
	return '';
}

export async function getPolicyFeed(): Promise<PolicyItem[]> {
	try {
		const res = await fetch(RSS_URL, {
			headers: { 'User-Agent': 'Mozilla/5.0 (infomoa policy-feed)' },
		});
		if (!res.ok) {
			console.warn('[policyFeed] non-ok status', res.status);
			return [];
		}
		const xml = await res.text();
		const parser = new XMLParser({
			ignoreAttributes: false,
			cdataPropName: '__cdata',
			textNodeName: '#text',
		});
		const data = parser.parse(xml);
		const items = data?.rss?.channel?.item ?? [];
		const list = Array.isArray(items) ? items : [items];

		return list
			.map((it: Record<string, unknown>): PolicyItem | null => {
				const rawTitle = readCData(it.title);
				const link = readCData(it.link);
				const desc = readCData(it.description);
				const pubDateStr = readCData(it.pubDate);
				const dcCreator = readCData(it['dc:creator']);

				if (!rawTitle || !link) return null;

				const parsed = parseTitle(rawTitle);
				// dc:creator 가 한글 부처명이면 우선, 아니면 title 에서 추출한 ministry
				const ministry = looksLikeMinistry(dcCreator) ? dcCreator : parsed.ministry;
				const summary = stripHTML(desc).slice(0, 220);
				const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

				return {
					title: parsed.title,
					ministry,
					link,
					pubDate,
					summary,
					category: classify(rawTitle, ministry, summary),
				};
			})
			.filter((x): x is PolicyItem => x !== null);
	} catch (err) {
		console.warn('[policyFeed] fetch/parse failed', err);
		return [];
	}
}
