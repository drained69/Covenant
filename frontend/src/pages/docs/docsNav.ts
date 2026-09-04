/*
  The docs navigation, in one place.

  Two consumers read this array: the sidebar in `DocsLayout` and the card grid on
  the `/docs` index. Before this file existed they were two hand-maintained lists,
  which is a guaranteed drift — a page added to one and forgotten in the other is
  reachable only by typing the URL. One array, two renderings.

  `blurb` is written for the index cards, where it is the only thing a reader has
  to go on. The sidebar shows `label` alone; a one-line description under every
  sidebar item turns a scannable nav into a wall of prose.

  Order is reading order, not alphabetical. The task-oriented guide comes first
  for users who want to operate the product; "How it works" follows for readers
  who want the mechanism. Reference comes last because it is the page you return
  to. The entries in between move from concept to policy to math.
*/
export type DocsNavItem = {
  to: string;
  label: string;
  blurb: string;
};

/*
  The repository is public, so the docs link to it rather than to paths a reader
  cannot open from a browser. It lives here rather than in the two pages that
  cite it, because a URL duplicated across files is a URL that rots in one of
  them first.
*/
export const REPO_URL = "https://github.com/drained69/covenant";

export const DOCS_NAV: DocsNavItem[] = [
  {
    to: "/docs/how-to",
    label: "How to use Covenant",
    blurb:
      "A practical walkthrough: fund a wallet, check your tier, unlock capital, place an Event Contract order, manage the position, and exit safely.",
  },
  {
    to: "/docs/how-it-works",
    label: "How it works",
    blurb:
      "The lending lifecycle end to end — credit pricing, borrowing, collateral health, fees, repayment, liquidation, and settlement.",
  },
  {
    to: "/docs/architecture",
    label: "Architecture",
    blurb:
      "The four layers, how a market's identity is derived from its terms, and why swapping a gate produces a different market.",
  },
  {
    to: "/docs/credit-ladder",
    label: "Credit tiers",
    blurb:
      "Three reputation tiers binding an Ethos score threshold to transparent collateralized trading terms.",
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
