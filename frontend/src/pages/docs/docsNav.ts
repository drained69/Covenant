
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
          "Connect on Mezo, fund BTC, borrow MUSD on your Ethos market, supply as a lender, then repay and withdraw from Positions.",
      },
      {
        to: "/docs/how-it-works",
        label: "How it works",
        blurb:
          "How a signed MUSD offer becomes a BTC-backed loan: the tier gate, the health check, repayment, and liquidation.",
      },
      {
        to: "/docs/architecture",
        label: "Architecture",
        blurb:
          "The app, the credit service, the Covenant core, and why a market's gate is part of its id.",
      },
      {
        to: "/docs/credit-ladder",
        label: "Credit tiers",
        blurb:
          "Open, Established, and Reputable: the score each market requires and the max LTV it lends at.",
      },
      {
        to: "/docs/math",
        label: "Core math",
        blurb:
          "How posted BTC becomes a MUSD borrow limit, how the Skip price is scaled, and when a loan is healthy.",
      },
      {
        to: "/docs/reference",
        label: "Reference",
        blurb:
          "Mezo testnet, MUSD, BTC, the three markets, and the contract addresses this app calls.",
      },
    ];
