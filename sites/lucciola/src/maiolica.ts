// One square maiolica tile drawn in code: a four-petal flower, corner quarter-rosettes
// and a lemon centre. Repeated as a CSS background to frame sections.
export function tileSvg(cobalt = '#1f3fa8', lemon = '#f2cf2e', paper = '#fbfaf5'): string {
  const petal = (r: number) => `<path transform="rotate(${r} 40 40)" d="M40 40 C 30 26, 32 12, 40 6 C 48 12, 50 26, 40 40 Z" fill="${cobalt}"/>`;
  const corner = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${cobalt}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="6" fill="${cobalt}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <rect width="80" height="80" fill="${paper}"/>
    ${[0, 90, 180, 270].map(petal).join('')}
    ${[45, 135, 225, 315].map(r => `<path transform="rotate(${r} 40 40)" d="M40 40 L 40 22" stroke="${cobalt}" stroke-width="2"/>`).join('')}
    <circle cx="40" cy="40" r="7" fill="${lemon}" stroke="${cobalt}" stroke-width="2"/>
    ${corner(0, 0)}${corner(80, 0)}${corner(0, 80)}${corner(80, 80)}
  </svg>`;
}

export const tileUrl = () => `url("data:image/svg+xml,${encodeURIComponent(tileSvg().replace(/\s+/g, ' '))}")`;
