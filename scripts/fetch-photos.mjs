// Downloads the photos picked in sites/<site>/photos.json from Wikimedia Commons,
// shrinks each to a 1200px WebP of at most 200 KB and records author and license.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const site = process.argv[2];
const picks = JSON.parse(readFileSync(`sites/${site}/photos.json`, 'utf8'));
const dir = `sites/${site}/public/photos`;
const MAX = 200 * 1024;
const UA = { 'user-agent': 'restaurant-demo-portfolio/1.0' };
// Commons often links the author as "[2]"; take the name from the link's address instead
const strip = s => (s ?? '')
  .replace(/<a [^>]*href="([^"]*)"[^>]*>\s*\[\d+\]\s*<\/a>/g, (_, href) => decodeURIComponent(href.replace(/\/+$/, '').split('/').pop()))
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Commons answers 429 with plain text when hurried; wait and retry
async function get(url, as) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
    await sleep(5000 * (i + 1));
  }
  throw new Error(`failed: ${url}`);
}

const creditsFile = `${dir}/credits.json`;
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : {};
for (const [key, title] of Object.entries(picks)) {
  if (credits[key]?.title === title.replace(/^File:/, '') && existsSync(`${dir}/${key}.webp`)) continue;
  await sleep(1500);
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|Credit', iiurlwidth: '1600', format: 'json' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const page = Object.values((await get(u, 'json')).query.pages)[0];
  const ii = page.imageinfo[0];
  const src = await get(ii.thumburl, 'buf');
  let quality = 80, out;
  do {
    out = await sharp(src).resize({ width: 1200, withoutEnlargement: true }).webp({ quality }).toBuffer();
    quality -= 8;
  } while (out.length > MAX && quality > 30);
  writeFileSync(`${dir}/${key}.webp`, out);
  credits[key] = { title: title.replace(/^File:/, ''), author: strip(ii.extmetadata.Artist?.value) || strip(ii.extmetadata.Credit?.value) || 'Unknown', license: ii.extmetadata.LicenseShortName.value, url: ii.descriptionurl };
  console.log(key, Math.round(out.length / 1024), 'KB', credits[key].license);
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');
}
