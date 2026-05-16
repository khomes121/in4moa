// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://in4moa.store',
	server: { port: 4331 },
	devToolbar: { enabled: false },
	integrations: [
		mdx(),
		sitemap({
			changefreq: 'weekly',
			priority: 0.7,
			lastmod: new Date(),
			i18n: {
				defaultLocale: 'ko',
				locales: { ko: 'ko-KR' },
			},
			serialize(item) {
				const url = item.url;
				if (/^https:\/\/in4moa\.store\/?$/.test(url)) {
					return { ...item, priority: 1.0, changefreq: 'daily' };
				}
				if (/\/category\//.test(url)) {
					return { ...item, priority: 0.8, changefreq: 'daily' };
				}
				if (/\/policy-feed\//.test(url)) {
					return { ...item, priority: 0.8, changefreq: 'daily' };
				}
				if (/\/blog\/[^/]+\/?$/.test(url)) {
					return { ...item, priority: 0.7, changefreq: 'monthly' };
				}
				if (/\/blog\/?$/.test(url)) {
					return { ...item, priority: 0.7, changefreq: 'weekly' };
				}
				if (/\/about/.test(url)) {
					return { ...item, priority: 0.4, changefreq: 'yearly' };
				}
				return item;
			},
		}),
	],
});
