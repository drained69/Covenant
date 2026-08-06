/**
 * Covenant logotype: a bold, geometric arc ("C") capped by a solid rectangle.
 * The arc inherits `currentColor` so the mark tints with its context; the cap
 * uses the brand accent.
 *
 * The cap was previously hardcoded to `#22d3c2` with a comment claiming it was
 * "--brand-400 in the theme". It was not — brand-400 is `#3dc9b3`. The logo was
 * rendering in a cyan that appears nowhere else in the palette, so the one
 * element that has to feel most deliberate was subtly off-brand. It now reads
 * the token via `currentColor` on a wrapper, which means the brand colour can
 * never drift from the theme again.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg width="24" height="24" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        {/* the C arc — inherits the surrounding text colour */}
        <path
          d="M86.14,61.74 A38,38 0 1 1 86.14,38.26"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="butt"
          fill="none"
        />
        {/* the cap — brand-400 via the theme, not a literal */}
        <rect
          x="79"
          y="38.26"
          width="18"
          height="23.48"
          rx="1.5"
          className="fill-brand-400"
        />
      </svg>
      {/*
        Tracking was `0.28em` — nearly a third of an em between letters. At that
        spacing a wordmark stops reading as a word and starts reading as spaced
        capitals, which is a 2015-startup tell. `0.14em` keeps the institutional
        feel while the word stays a single unit. Weight drops from bold to
        semibold because letterspaced caps already carry visual weight.
      */}
      <span className="text-body-sm font-semibold tracking-[0.14em]">COVENANT</span>
    </div>
  );
}
