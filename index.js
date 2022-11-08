import meow from 'meow';
import path from 'path';
import fs from 'fs/promises';
import TaskTree from 'tasktree-cli';
import * as tana from './src/tana.js';
import * as wikipedia from './src/wikipedia.js';

async function load(title) {
	try {
		const results = await wikipedia.query(title);
		if (!results.length) {
			return null;
		}

		if (results.length > 1) {
			console.warn(`Found ${results.length} pages for title "${title}".`);
		}

		return results[0];
	} catch (_) {
		return null;
	}
}

function taskBar({tree, title, total, current = 0}) {
	const task = tree.add(title);
	const bar = task.bar(':bar {cyan.bold :current/:total} :percent', {total, current});

	return {
		tick() {
			current += 1;
			bar.tick();
		},
		finish() {
			if (current >= total) {
				task.complete();
			} else {
				task.skip();
			}
		},
	};
}

async function crawl({task, page, maxDepth, maxSize}) {
	const pages = new Map([[page.pageID(), page]]);
	const references = new Map([[page.title(), page]]);

	let depth = 0;
	let links = wikipedia.parsePageLinks(page);

	const sizeBar = taskBar({tree: task, title: 'crawled pages', total: maxSize, current: pages.size});
	const depthBar = taskBar({tree: task, title: 'crawl depth', total: maxDepth, current: depth});

	while (links.size && depth < maxDepth && pages.size < maxSize) {
		const next = new Set([]);

		for (const title of links) {
			if (pages.size >= maxSize) {
				break;
			}

			if (references.has(title)) {
				continue;
			}

			const page = await load(title);
			references.set(title, page || null);
			if (!page || pages.has(page.pageID())) {
				continue;
			}

			sizeBar.tick();
			pages.set(page.pageID(), page);
			for (const ref of wikipedia.parsePageLinks(page)) {
				if (!references.has(ref)) {
					next.add(ref);
				}
			}
		}

		if (pages.size >= maxSize) {
			break;
		}

		depth += 1;
		links = next;
		depthBar.tick();
	}

	sizeBar.finish();
	depthBar.finish();

	return {pages, references};
}

async function fromTitle({tree, title, maxDepth, maxSize}) {
	const results = await wikipedia.query(title);
	if (!results.length) {
		throw new Error(`Couldn't find page "${title}"`);
	}

	if (results.length > 1) {
		throw new Error(`Found ${results.length} pages for "${title}"`);
	}

	const [page] = results;
	const crawlTask = tree.add(`crawl "${page.title()}" (${page.pageID()})`);
	const {pages, references} = await crawl({task: crawlTask, page, maxDepth, maxSize});
	crawlTask.complete();

	const convertTask = tree.add(`convert ${pages.size} pages to tana nodes`);
	const content = await tana.convert({pages, references});
	convertTask.complete();

	return {title: page.title(), content};
}

async function todaysFeaturedArticle({language, date, ...options}) {
	const featured = await wikipedia.featured({language, date});
	const title = featured && featured.tfa && featured.tfa.title;
	if (!title) {
		throw new Error('Could not get todays featured article');
	}

	return fromTitle({...options, title});
}

const cli = meow(
	`
	Usage
	$ node index.js [options] [title]

	[title]
	The title or slug of a wikipedia page.
	if no title is provided the (todays) featured article is used.

	[options]
	--help  Show this help message
	--file, -f <path/to/file>  A path to output the json data to
	--depth, -d <number>  The maximum depth to craw (default 1)
	--size, -s <number>  The maximum size of pages to crawl (default 1000)

	--language, -l <language>  The language of the featured article (default en)
	--date <date>  The date of the featured article (default today)
`,
	{
		importMeta: import.meta,
		flags: {
			file: {type: 'string', alias: 'f'},
			depth: {type: 'number', alias: 'd', default: 1},
			size: {type: 'number', alias: 's', default: 1000},
			language: {type: 'string', alias: 'l', default: 'en'},
			date: {type: 'string'},
		},
	},
);

async function generate({tree}) {
	const maxSize = cli.flags.size;
	const maxDepth = cli.flags.depth;
	if (cli.input.length) {
		const title = cli.input.join(' ');
		return fromTitle({tree, title, maxDepth, maxSize});
	}

	const {language} = cli.flags;
	const date = cli.flags.date ? new Date(cli.flags.date) : new Date();
	return todaysFeaturedArticle({tree, maxDepth, maxSize, language, date});
}

const tree = TaskTree.tree();
try {
	tree.start();
	const {content} = await generate({tree});

	const {file} = cli.flags;
	if (file) {
		const task = tree.add(`write tana file to "${file}"`);
		await fs.writeFile(file, JSON.stringify(content, null, 2));
		task.complete();
	} else {
		console.log(content);
	}

	tree.stop();
} catch (error) {
	tree.fail(error);
}
