const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCode(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}-${[...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')}`;
}
