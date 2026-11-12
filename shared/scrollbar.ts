// The site's own scrollbar: the browser's bar is hidden and a thin rail in the site's colours
// takes its place. Wheel, keys and touch keep scrolling the page as usual.

const MIN_THUMB = 36;

export function thumbGeometry(viewport: number, page: number, scroll: number, track: number): { size: number; offset: number } {
  if (page <= viewport || track <= 0) return { size: 0, offset: 0 };
  const size = Math.max(MIN_THUMB, Math.round((viewport / page) * track));
  const ratio = Math.min(1, Math.max(0, scroll / (page - viewport)));
  return { size, offset: ratio * (track - size) };
}

/** Scroll position for a pointer at clientY, keeping the thumb centred under it. */
export function scrollForPointer(clientY: number, rail: { top: number; height: number }, size: number, viewport: number, page: number): number {
  const free = rail.height - size;
  if (free <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientY - rail.top - size / 2) / free));
  return ratio * (page - viewport);
}

export function mountScrollbar(): void {
  const root = document.documentElement;
  root.classList.add('own-scroll');
  const rail = document.createElement('div');
  rail.className = 'sb-rail';
  rail.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'sb-thumb';
  rail.append(thumb);
  document.body.append(rail);

  let size = 0;
  const update = () => {
    const g = thumbGeometry(innerHeight, root.scrollHeight, scrollY, rail.clientHeight);
    size = g.size;
    rail.hidden = g.size === 0;
    thumb.style.height = `${g.size}px`;
    thumb.style.transform = `translateY(${g.offset.toFixed(1)}px)`;
  };
  const jump = (e: PointerEvent) => {
    const r = rail.getBoundingClientRect();
    scrollTo({ top: scrollForPointer(e.clientY, r, size, innerHeight, root.scrollHeight), behavior: 'instant' as ScrollBehavior });
  };
  rail.addEventListener('pointerdown', e => { rail.setPointerCapture(e.pointerId); rail.classList.add('drag'); jump(e); });
  rail.addEventListener('pointermove', e => { if (rail.hasPointerCapture(e.pointerId)) jump(e); });
  rail.addEventListener('pointerup', () => rail.classList.remove('drag'));
  rail.addEventListener('pointercancel', () => rail.classList.remove('drag'));

  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  if ('ResizeObserver' in window) new ResizeObserver(onScroll).observe(document.body);
  update();
}
