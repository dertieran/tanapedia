# Tanapedia

> Wikipedia import for Tana

## Install

Install project dependencies with `pnpm`
```sh
pnpm install
```

## Usage

Copy the title of a wikipedia page *(or the slug)*  to co

```sh
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
```
