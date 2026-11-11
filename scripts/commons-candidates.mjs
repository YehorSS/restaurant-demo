// Finds freely licensed Commons photos for each key in sites/<site>/photo-queries.json
// and writes a contact sheet (HTML) plus candidates JSON to review and pick from.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const site = process.argv[2];
const out = process.argv[3] ?? '.superpowers';
const queries = JSON.parse(readFileSync(`sites/${site}/photo-queries.json`, 'utf8'));
const OK = /^(CC0|CC BY(-SA)? [0-9.]+|Public domain)$/i;
const strip = s => (s ?? '').replace(/<[^>]+>/g, '').trim();

async function search(q) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '24', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist', iiurlwidth: '480', format: 'json' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'user-agent': 'restaurant-demo-portfolio/1.0' } });
  const pages = Object.values((await r.json()).query?.pages ?? {});
  return pages.map(p => {
    const ii = p.imageinfo[0], m = ii.extmetadata ?? {};
    return { title: p.title, thumb: ii.thumburl, w: ii.width, h: ii.height, license: m.LicenseShortName?.value ?? '', author: strip(m.Artist?.value) };
  }).filter(c => OK.test(c.license) && c.w >= 1200 && c.w >= c.h);
}

const all = {};
for (const [key, q] of Object.entries(queries)) all[key] = (await search(q)).slice(0, 8);
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/candidates-${site}.json`, JSON.stringify(all, null, 2));
const html = `<style>body{font:12px sans-serif;margin:8px}h2{margin:12px 0 4px}.r{display:flex;gap:6px;flex-wrap:wrap}figure{margin:0;width:230px}img{width:230px;height:150px;object-fit:cover;display:block}</style>` +
  Object.entries(all).map(([k, cs]) => `<h2>${k}</h2><div class="r">${cs.map((c, i) => `<figure><img src="${c.thumb}"><figcaption>${i}: ${c.license}</figcaption></figure>`).join('')}</div>`).join('');
writeFileSync(`${out}/candidates-${site}.html`, html);
console.log(Object.entries(all).map(([k, cs]) => `${k}: ${cs.length}`).join(', '));
