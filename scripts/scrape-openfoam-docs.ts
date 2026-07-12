/**
 * Scrape the OpenFOAM 13 user guide (https://doc.cfd.direct/openfoam/user-guide-v13/)
 * into local markdown under docs/openfoam-v13/. Run once, commit the output:
 *
 *     npm run scrape:docs
 *
 * Re-run only when bumping the OpenFOAM version (or refreshing upstream changes).
 *
 * Strategy: fetch the site sitemap (https://doc.cfd.direct/sitemap.xml), pick
 * every URL under /openfoam/user-guide-v13/, fetch the page HTML, extract the
 * main content, convert to markdown via Turndown, and write to
 * docs/openfoam-v13/<slug>.md with YAML front-matter.
 *
 * Network failures are non-fatal — we log and skip. Already-scraped pages are
 * skipped unless OFS_FORCE_RESCRAPE=1.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import TurndownService from 'turndown'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'docs', 'openfoam-v13')

const SITEMAP_URL = 'https://doc.cfd.direct/sitemap.xml'
const URL_PREFIX = 'https://doc.cfd.direct/openfoam/user-guide-v13/'
const FORCE = process.env.OFS_FORCE_RESCRAPE === '1'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.remove(['script', 'style', 'nav', 'footer', 'header'])

function slugifyUrl(url: string): string {
  const tail = url
    .replace(URL_PREFIX, '')
    .replace(/\/+$/, '')
    .replace(/\//g, '_')
    .replace(/[^a-z0-9_-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .toLowerCase()
  return tail || 'index'
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'openfoam-studio-docs-scraper/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return await res.text()
}

function extractMain(html: string): string {
  // Try semantic containers first; fall back to <body>.
  const patterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class=["'][^"']*(?:entry-content|post-content|page-content|content)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/(?:article|div|main)>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m && m[1]) return m[1]
  }
  return html
}

function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = []
  const re = /<loc>([^<]+)<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1]!.trim())
  }
  return urls
}

async function scrapePage(url: string): Promise<{ slug: string; bytes: number } | null> {
  const slug = slugifyUrl(url)
  const outPath = path.join(OUT_DIR, `${slug}.md`)
  if (!FORCE && fs.existsSync(outPath)) {
    return { slug, bytes: fs.statSync(outPath).size }
  }

  let html: string
  try {
    html = await fetchText(url)
  } catch (err) {
    console.warn(`  skip ${url}: ${(err as Error).message}`)
    return null
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? slug

  const main = extractMain(html)
  const md = turndown.turndown(main).replace(/\n{3,}/g, '\n\n').trim()
  if (!md || md.length < 80) {
    // Likely an empty / error page — don't write empty stubs.
    return null
  }

  const front = [
    '---',
    `source: ${url}`,
    `title: ${title.replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
    `slug: ${slug}`,
    '---',
    '',
  ].join('\n')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(outPath, front + md + '\n', 'utf8')
  return { slug, bytes: front.length + md.length }
}

async function main() {
  console.log(`[scrape-openfoam-docs] Output dir: ${OUT_DIR}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  let sitemap: string
  try {
    sitemap = await fetchText(SITEMAP_URL)
  } catch (err) {
    console.error(`Failed to fetch sitemap ${SITEMAP_URL}: ${(err as Error).message}`)
    process.exit(1)
  }

  const allUrls = parseSitemapUrls(sitemap)
  const v13Urls = allUrls
    .filter((u) => u.startsWith(URL_PREFIX))
    // Drop the bare prefix (no slug) — the per-page hub is just navigation.
    .filter((u) => u !== URL_PREFIX)
    .sort()

  console.log(`[scrape-openfoam-docs] Sitemap has ${v13Urls.length} v13 user-guide pages`)
  if (v13Urls.length === 0) {
    console.error('No v13 URLs found in sitemap. Has the upstream URL scheme changed?')
    process.exit(1)
  }

  const MAX = Number(process.env.OFS_MAX_PAGES ?? String(v13Urls.length))
  let ok = 0
  let skipped = 0
  for (let i = 0; i < Math.min(v13Urls.length, MAX); i++) {
    const url = v13Urls[i]!
    process.stdout.write(`  [${i + 1}/${v13Urls.length}] ${url} … `)
    const result = await scrapePage(url)
    if (result) {
      console.log(`ok (${result.bytes} bytes → ${result.slug}.md)`)
      ok++
    } else {
      console.log('skip')
      skipped++
    }
  }

  console.log(`[scrape-openfoam-docs] Wrote ${ok} pages, skipped ${skipped}, into ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
