// ============================================================================
// How a liked (or passed) profile leaves the screen
//
//   - Liked: the card or the open profile pops, shrinks and fades, and bursts
//     into glittering yellow sparkles (about 0.6 s; the sparkles 1–1.3 s)
//   - Passed: it drops and fades (about 0.3 s)
//
// Web Animations on the element itself, so no CSS is needed. The sparkles are
// added to the page, not the card, so they outlive the card when the list
// drops it, and remove themselves. With "reduce motion" on (phone or computer
// setting) the card only fades, and there are no sparkles.
// ============================================================================

export type ExitKind = 'like' | 'pass';

// Yellows only: deep gold to pale lemon
const COLORS = ['#FFC400', '#FFD60A', '#FFE45C', '#F5B301', '#FFEB80'];
const EDGE = '#FFF8D6';
// A four-pointed sparkle
const STAR = 'M12 0C12.9 6.6 17.4 11.1 24 12C17.4 12.9 12.9 17.4 12 24C11.1 17.4 6.6 12.9 0 12C6.6 11.1 11.1 6.6 12 0Z';

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const canAnimate = (el: Element | null): el is HTMLElement =>
  !!el && typeof (el as HTMLElement).animate === 'function';

/** A burst of sparkles at a point on the screen; `reach` is how far they fly (px) */
export function sparkleBurst(x: number, y: number, reach = 110): void {
  if (reducedMotion() || typeof document === 'undefined') return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.testid = 'sparkles';
  Object.assign(layer.style, {
    position: 'fixed', left: `${x}px`, top: `${y}px`, width: '0', height: '0',
    pointerEvents: 'none', zIndex: '450',
  });
  document.body.appendChild(layer);
  if (typeof layer.animate !== 'function') { layer.remove(); return; }

  // A soft yellow glow where it started
  const glow = document.createElement('div');
  const size = reach * 1.2;
  Object.assign(glow.style, {
    position: 'absolute', left: `${-size / 2}px`, top: `${-size / 2}px`, width: `${size}px`, height: `${size}px`,
    borderRadius: '9999px', background: 'radial-gradient(circle, rgba(255,214,10,0.55) 0%, rgba(255,196,0,0.2) 45%, rgba(255,196,0,0) 70%)',
  });
  layer.appendChild(glow);
  const animations: Animation[] = [
    glow.animate(
      [{ transform: 'scale(0.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }],
      { duration: 650, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    ),
  ];

  const count = 18;
  for (let i = 0; i < count; i++) {
    const star = i % 3 !== 2;   // two sparkles to every dot
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = reach * (0.5 + Math.random() * 0.55);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const s = star ? 13 + Math.random() * 13 : 5 + Math.random() * 4;
    const color = COLORS[i % COLORS.length];
    const spin = (Math.random() - 0.5) * 240;

    const p = document.createElement('div');
    Object.assign(p.style, {
      position: 'absolute', left: `${-s / 2}px`, top: `${-s / 2}px`, width: `${s}px`, height: `${s}px`,
    });
    if (star) {
      // A pale yellow edge and glow: glitter, and visible on any photo
      p.innerHTML = `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:block;overflow:visible;filter:drop-shadow(0 0 3px ${color})"><path d="${STAR}" fill="${color}" stroke="${EDGE}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    } else {
      Object.assign(p.style, { borderRadius: '9999px', background: color, boxShadow: `0 0 0 1px ${EDGE}, 0 0 6px ${color}` });
    }
    layer.appendChild(p);
    // Out, a glittering twinkle on the way, then fading
    animations.push(p.animate(
      [
        { transform: 'translate(0, 0) scale(0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1.15) rotate(${spin * 0.4}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx * 0.75}px, ${dy * 0.75 + 4}px) scale(0.9) rotate(${spin * 0.6}deg)`, opacity: 0.55, offset: 0.48 },
        { transform: `translate(${dx * 0.85}px, ${dy * 0.85 + 8}px) scale(1.05) rotate(${spin * 0.8}deg)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${dx}px, ${dy + 14}px) scale(0.2) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1000 + Math.random() * 300, delay: Math.random() * 90, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    ));
  }
  Promise.all(animations.map((a) => a.finished)).catch(() => {}).finally(() => layer.remove());
}

/** Plays the exit on `el` (a liked one also bursts into sparkles); returns the ms until it's gone */
export function playExit(el: HTMLElement | null, kind: ExitKind): number {
  if (!canAnimate(el)) return 0;
  if (reducedMotion()) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    return 150;
  }
  if (kind === 'like') {
    const r = el.getBoundingClientRect();
    sparkleBurst(r.left + r.width / 2, r.top + r.height / 2, Math.min(170, Math.max(80, Math.min(r.width, r.height) * 0.55)));
    el.animate(
      [
        { transform: 'scale(1)', opacity: 1, easing: 'ease-out' },                                  // a little pop…
        { transform: 'scale(1.03)', opacity: 1, offset: 0.25, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' }, // …then gone
        { transform: 'scale(0.8) translateY(-6px)', opacity: 0 },
      ],
      { duration: 600, fill: 'forwards' },
    );
    return 600;
  }
  el.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: 'translateY(24px) rotate(-3deg) scale(0.92)', opacity: 0 },
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
  return 300;
}
