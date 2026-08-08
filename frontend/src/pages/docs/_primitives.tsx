import type { ReactNode } from "react";

/*
  Shared docs primitives.

  These four were file-local to the old `HowItWorks.tsx`. Every docs page now
  needs the same step numbering, the same section headers, and the same page
  header, so they move here rather than being copied six times — a copy is a
  place for the styling to diverge, and a docs section whose cards do not match
  each other reads as six pages rather than one document.

  Nothing here introduces new visual language. `StepCard` and `LayerCard` are
  unchanged from the page they came from; `SectionTitle` likewise. `DocPage` is
  new only in the sense that the eyebrow + h1 + lede pattern was previously
  written inline at the top of the one page that needed it.
*/

/* ── page header ────────────────────────────────────────────────────── */

/*
  Left-aligned, not centered. A centered header is a marketing pattern — it
  works when the page is one idea and a call to action. A document with a
  sidebar and six siblings is a reference, and references align left so the eye
  returns to a fixed margin on every scroll.

  `max-w-prose` on the lede: measure matters more here than on any other page,
  because this is the only text a reader is guaranteed to actually read.
*/
export function DocPage({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="space-y-16 pb-8">
      <header className="space-y-3">
        <div className="section-label">{eyebrow}</div>
        <h1 className="text-h1 text-slate-50">{title}</h1>
        <p className="max-w-prose text-body text-muted leading-relaxed">{lede}</p>
      </header>
      {children}
    </article>
  );
}

/* ── section header ─────────────────────────────────────────────────── */

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="max-w-2xl space-y-1.5">
      <h2 className="text-h3 text-slate-50">{title}</h2>
      <p className="text-body-sm text-muted leading-relaxed">{subtitle}</p>
    </div>
  );
}

/*
  A section is a header plus its content at a consistent rhythm. Wrapping it
  keeps the vertical spacing identical across six pages written at different
  times — the alternative is `space-y-6` remembered correctly forty times.
*/
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

/* ── cards ──────────────────────────────────────────────────────────── */

/*
  `emphasized` marks the step that carries the protocol's actual claim — the
  in-transaction gate check, the wrapped token, the sub-tier binding. It is a
  border tint and a filled number chip, not a glow: the surrounding cards stay
  legible and the emphasis reads as "this one matters" rather than "this one is
  lit up".
*/
export function StepCard({
  n,
  title,
  body,
  hint,
  emphasized,
}: {
  n: number;
  title: string;
  body: ReactNode;
  hint: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`card p-5 flex flex-col gap-3 ${emphasized ? "border-brand-500/30" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center
                      font-mono text-[10px] font-bold tabular-nums ${
                        emphasized ? "bg-brand-400 text-ink-950" : "bg-white/10 text-slate-300"
                      }`}
        >
          {String(n).padStart(2, "0")}
        </span>
        <div className="card-title">{title}</div>
      </div>
      <div className="text-body-sm text-slate-300 leading-relaxed flex-1">{body}</div>
      <div className="pt-3 border-t border-line text-micro font-mono text-subtle break-words">
        {hint}
      </div>
    </div>
  );
}

export function LayerCard({
  index,
  title,
  path,
  body,
  emphasized,
}: {
  index: string;
  title: string;
  path: string;
  body: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`card p-5 space-y-3 ${emphasized ? "border-brand-500/30" : ""}`}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-micro font-mono tabular-nums text-subtle">{index}</span>
          <div className="card-title truncate">{title}</div>
        </div>
        <span className="text-micro font-mono text-subtle flex-shrink-0">{path}</span>
      </div>
      <p className="text-body-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}

/* ── prose ──────────────────────────────────────────────────────────── */

/*
  Docs carry more running text than the rest of the app, which is almost
  entirely tables and forms. `Prose` fixes the measure once so no page has to
  remember `max-w-prose` on every paragraph.
*/
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-prose space-y-4 text-body-sm text-slate-300 leading-relaxed">
      {children}
    </div>
  );
}

/*
  A note is context that qualifies the surrounding claim — a testnet caveat, a
  deliberate omission, a thing that is true today and will not be. It is a card
  with a left rule rather than a tinted panel, because a coloured background
  reads as a warning and most of these are not warnings.
*/
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-5 border-l-2 border-l-brand-500/40 space-y-2">
      <div className="card-title">{title}</div>
      <div className="text-body-sm text-slate-300 leading-relaxed space-y-3">{children}</div>
    </div>
  );
}
