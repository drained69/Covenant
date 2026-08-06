/**
 * Single source of truth for iconography.
 *
 * Before this module, icons were defined in three places (Header, Hero, Compliance)
 * with different stroke widths and sizes, and several UI slots used raw Unicode
 * glyphs (₿, $, →, ←, ✓, ◇). Glyphs render in the text font, so their weight,
 * baseline, and optical size never match the surrounding UI — the single clearest
 * "amateur" tell in an otherwise disciplined interface.
 *
 * Every icon here shares one geometry contract: 24×24 viewBox, 1.75 stroke,
 * round caps/joins, `currentColor`. That means an icon inherits color from its
 * container and stays optically consistent at any size.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared geometry contract. Consumers override only `className`. */
function Svg({ children, className = "w-4 h-4", ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Navigation ──────────────────────────────────────────────────────── */

export const IconMarkets = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v18h18" />
    <rect x="7" y="12" width="3" height="6" />
    <rect x="12" y="8" width="3" height="10" />
    <rect x="17" y="5" width="3" height="13" />
  </Svg>
);

export const IconPositions = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 22a7 7 0 0 1 14 0" />
    <circle cx="17" cy="8" r="3" />
    <path d="M22 20a5 5 0 0 0-4-4.9" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);

/* ── Directional ─────────────────────────────────────────────────────── */

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </Svg>
);

/* ── Status ──────────────────────────────────────────────────────────── */

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

/* ── Domain ──────────────────────────────────────────────────────────── */

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
    <path d="M16 12h2.5" />
  </Svg>
);

export const IconCoins = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="6" />
    <path d="M15.5 4.2a6 6 0 0 1 0 11.6M13 21a6 6 0 0 0 6-6" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </Svg>
);

export const IconDocument = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

/**
 * Token mark. Replaces the `₿` / `$` text glyphs that were previously rendered
 * inside 32px circles at `text-[10px] font-bold`. A monospace initial at a fixed
 * optical size reads as a deliberate avatar rather than a stray character, and
 * it works for any symbol instead of only the two that happen to have glyphs.
 */
export function TokenMark({
  symbol,
  tone = "neutral",
  className = "",
}: {
  symbol: string;
  tone?: "neutral" | "brand" | "warn" | "ok";
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/[0.06] text-slate-300 ring-line-strong",
    brand: "bg-brand-500/10 text-brand-300 ring-brand-500/30",
    warn: "bg-warn/10 text-warn ring-warn/30",
    ok: "bg-ok/10 text-ok ring-ok/30",
  } as const;

  return (
    <span
      className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full
                  font-mono text-[11px] font-semibold uppercase leading-none ring-1
                  ${tones[tone]} ${className}`}
      aria-hidden="true"
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
