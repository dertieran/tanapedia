import wtf from 'wtf_wikipedia';
import fetch from 'isomorphic-unfetch';

// escape a string like 'fun*2.Co' for a regExpr
export function escapeRegExp(str) {
	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

// sometimes text-replacements can be ambiguous - words used multiple times..
export function smartReplace(all, text, result) {
	if (!text || !all) {
		return all;
	}

	if (typeof all === 'number') {
		all = String(all);
	}

	text = escapeRegExp(text);
	// try a word-boundary replace
	const reg = new RegExp(`\\b${text}\\b`);
	if (reg.test(all) === true) {
		all = all.replace(reg, result);
	} else {
		// otherwise, fall-back to a much messier, dangerous replacement
		// console.warn('missing \'' + text + '\'');
		all = all.replace(text, result);
	}

	return all;
}

export function parsePageLinks(page) {
	const pages = page.paragraphs().flatMap(paragraph =>
		paragraph
			.links()
			.filter(link => link.type !== 'external' && link.type !== 'interwiki' && link.page())
			.map(link => link.page()),
	);

	return new Set(pages);
}

export async function query(input, options = {}) {
	const {lang = 'en'} = options;
	const result = await wtf.fetch(input, {lang});
	if (!result) {
		return [];
	}

	if (Array.isArray(result)) {
		return result;
	}

	return [result];
}

export async function random(options) {
	const result = await wtf.random(options);
	return result;
}

export async function featured(options = {}) {
	const date = options.date || new Date();
	const lang = options.lang || 'en';

	if (isNaN(date.valueOf())) {
		throw new Error('Invalid date');
	}

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`;

	const response = await fetch(url);
	if (response.ok) {
		return response.json();
	}

	throw new Error(`${response.status} - ${response.statusText}`);
}
