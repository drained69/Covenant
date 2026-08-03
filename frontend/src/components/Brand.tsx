/**
 * Covenant logotype: a bold, geometric arc ("C") capped by a solid rectangle. The stroke inherits
 * currentColor so the mark tints with its context; the cap uses the teal accent (--brand-400 in the
 * theme) as a fixed brand color.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <svg width="26" height="26" viewBox="0 0 100 100" fill="none" aria-hidden>
        {/* the C arc */}
        <path
          d="M86.14,61.74 A38,38 0 1 1 86.14,38.26"
          stroke="currentColor" strokeWidth="16" strokeLinecap="butt" fill="none"
        />
        {/* the cap — teal to match the brand palette */}
        <rect x="79" y="38.26" width="18" height="23.48" rx="1.5" fill="#22d3c2" />
      </svg>
      <span className="text-[13px] font-bold tracking-[0.28em]">COVENANT</span>
    </div>
  );
}
