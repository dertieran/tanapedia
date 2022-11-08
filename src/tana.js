import {randomUUID} from 'crypto';
import {smartReplace} from './wikipedia.js';

const WIKI_PAGE_SUPER_TAG_UID = 'wiki-page';

function isEmptyNode(node) {
	if (!node) {
		return true;
	}

	if (node.children && node.children.length) {
		return false;
	}

	return !node.name && !node.mediaUrl;
}

function convertImage({image}) {
	const uid = randomUUID();
	const url = image.thumbnail();
	const name = image.caption() || image.alt() || 'image';
	return {type: 'image', uid, name, mediaUrl: url};
}

function convertLink({link, references}) {
	if (link.type() === 'external') {
		const text = `[${link.text()}](${link.site()}`;
		return {text};
	}

	if (link.type() === 'interwiki') {
		const text = `[${link.text() || link.page()}](${link.href()})`;
		return {text};
	}

	const page = references.get(link.page());
	if (!page) {
		const slug = encodeURIComponent(link.page().replace(/ /g, '_'));
		const href = `https://en.wikipedia.org/wiki/${slug}`;
		const text = `[${link.text() || link.page()}](${href})`;
		return {text};
	}

	const alias = link.text();
	const ref = String(page.pageID());
	const text = alias && alias !== page.title() ? `[${alias}]([[${ref}]])` : `[[${ref}]]`;
	return {ref, text};
}

function convertSentence({sentence, references}) {
	const refs = [];
	let text = sentence.text();
	for (const bold of sentence.bolds()) {
		text = smartReplace(text, bold, `**${bold}**`);
	}

	for (const italic of sentence.italics()) {
		text = smartReplace(text, italic, `__${italic}__`);
	}

	for (const link of sentence.links()) {
		const converted = convertLink({link, references});
		const str = link.text() || link.page();
		text = smartReplace(text, str, converted.text);
		if (converted.ref) {
			refs.push(converted.ref);
		}
	}

	return {text, refs};
}

function convertParagraph({paragraph, references}) {
	const uid = randomUUID();
	const images = paragraph.images().map(image => convertImage({image}));

	const sentences = [];
	const refs = new Set();
	for (const sentence of paragraph.sentences()) {
		const converted = convertSentence({sentence, references});
		if (converted.text) {
			sentences.push(converted.text);
			for (const ref of converted.refs) {
				refs.add(ref);
			}
		}
	}

	if (!sentences.length && images.length === 1) {
		return images[0];
	}

	const name = sentences.join('\n');
	return {type: 'node', uid, name, children: images, refs: [...refs]};
}

function convertSection({section, page, references}) {
	const indentation = section.indentation();
	const uid = `${page.pageID()}-${section.index()}-${indentation}`;
	const paragraphs = section.paragraphs().map(paragraph => convertParagraph({paragraph, references}));

	const sections = section
		.children()
		.filter(child => child.indentation() === indentation + 1)
		.map(child => convertSection({section: child, page, references}));

	const title = section.title();
	const children = [...paragraphs, ...sections].filter(node => isEmptyNode(node) === false);

	if (!title) {
		return children;
	}

	return [{type: 'node', uid, name: `**${title}**`, children}];
}

function convertPage({page, references}) {
	const sections = page
		.sections()
		.filter(section => section.indentation() === 0)
		.flatMap(section => convertSection({section, page, references}));

	return {
		type: 'node',
		uid: String(page.pageID()),
		name: `**${page.title()}**`,
		supertags: [WIKI_PAGE_SUPER_TAG_UID],
		children: sections,
	};
}

function countChildren(node) {
	const children = node.children || [];

	let count = children.length;
	for (const child of children) {
		count += countChildren(child);
	}

	return count;
}

function buildSummary({nodes}) {
	let leafNodes = 0;
	for (const node of nodes) {
		leafNodes += countChildren(node);
	}

	const topLevelNodes = nodes.length;
	const totalNodes = topLevelNodes + leafNodes;
	return {leafNodes, topLevelNodes, totalNodes, fields: 0, calendarNodes: 0, brokenRefs: 0};
}

export function convert({pages, references}) {
	const nodes = [...pages.values()].map(page => convertPage({page, references}));
	const supertags = [{uid: WIKI_PAGE_SUPER_TAG_UID, name: 'Wikipedia'}];
	const summary = buildSummary({nodes});

	return {version: 'TanaIntermediateFile V0.1', summary, supertags, nodes};
}
