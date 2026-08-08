/*
  The docs navigation, in one place.

  Two consumers read this array: the sidebar in `DocsLayout` and the card grid on
  the `/docs` index. Before this file existed they were two hand-maintained lists,
  which is a guaranteed drift — a page added to one and forgotten in the other is
  reachable only by typing the URL. One array, two renderings.

  `blurb` is written for the index cards, where it is the only thing a reader has
  to go on. The sidebar shows `label` alone; a one-line description under every
  sidebar item turns a scannable nav into a wall of prose.

  Order is reading order, not alphabetical. "How it works" comes first because it
  is the page a newcomer wants; Reference comes last because it is the page you
  return to. The three in between go concept → policy → math.
*/
export type DocsNavItem = {
  to: string;
  label: string;
  blurb: string;
};

export const DOCS_NAV: DocsNavItem[] = [
  {
    to: "/docs/how-it-works",
    label: "How it works",
    blurb:
      "The offer lifecycle end to end — signing off-chain, filling on-chain, and the compliance check that fires inside the fill.",
  },
  {
    to: "/docs/architecture",
    label: "Architecture",
    blurb:
      "The four layers, how a market's identity is derived from its terms, and why swapping a gate produces a different market.",
  },
  {
    to: "/docs/compliance",
    label: "Compliance",
    blurb:
      "The gate model, the two integration paths, which functions are gated and which are deliberately not, and the wrapped A-token.",
  },
  {
    to: "/docs/credit-ladder",
    label: "Credit ladder",
    blurb:
      "Three rungs binding a CVI sub-tier to an LLTV, cryptographically. Plus the current testnet registration state.",
  },
  {
    to: "/docs/math",
    label: "Core math",
    blurb:
      "Oracle scaling, the health check, settlement and continuous fees, liquidation, and what the contracts do not enforce.",
  },
  {
    to: "/docs/reference",
    label: "Reference",
    blurb:
      "Deployed addresses, chain metadata, token decimals, and links into the repository's own documentation.",
  },
];
