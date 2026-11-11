import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LICENSES = /^(CC0|CC BY(-SA)? [0-9.]+|Public domain)$/i;

for (const site of ['lucciola']) {
  describe(`${site} photos`, () => {
    const picks: Record<string, string> = JSON.parse(readFileSync(`${site}/photos.json`, 'utf8'));
    const credits = existsSync(`${site}/public/photos/credits.json`) ? JSON.parse(readFileSync(`${site}/public/photos/credits.json`, 'utf8')) : {};

    for (const key of Object.keys(picks)) {
      it(`${key} is downloaded, small and credited`, () => {
        const file = `${site}/public/photos/${key}.webp`;
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeLessThanOrEqual(200 * 1024);
        expect(credits[key]?.author).toBeTruthy();
        expect(credits[key]?.author).not.toBe('Unknown');
        expect(credits[key]?.author).not.toMatch(/\[\d+\]/);
        expect(credits[key]?.license).toMatch(LICENSES);
        expect(credits[key]?.url).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      });
    }
  });
}
