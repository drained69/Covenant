# Covenant — Tweet Thread

1/ Currently working on @trycovenant.

Real-world institutions are sitting on trillions in capital, yet they won't touch on-chain credit. 

Why? It's not the math, the oracle models, or fixed-rate technology—those have been solid for years. 

The blocker is much simpler: compliance theatre.

2/ The problem? Today's "compliant" DeFi only checks your wallet once—when you sign up. 

You fill out a form off-chain, get a green checkmark, and the protocol assumes you're good forever. 

But rules and users change. 

3/ If a trader gets blacklisted, loses their license, or moves to a restricted country on a Tuesday, the pool has no idea. They just keep trading.

Institutional compliance teams see this massive legal risk and stay away. 

To solve this, we looked at how DeFi lending evolved.


4/ DeFi credit architecture has run through three major generations:

• Gen 1: @Aave and @Compound — Shared-pool, variable-rate models. Great for retail liquidity, but systemic risk and rate volatility are tough for institutional balance sheets.
• Gen 2: Morpho Blue — Isolated-risk markets, custom LLTVs, and extreme gas efficiency.

5/ Covenant inherits Gen 2 (Morpho Blue) DNA:
• Isolated credit markets (no shared risk across pools)
• Strictly enforced LLTV tiers (copied directly from Morpho Blue's enabled tiers)
• Lazy bad-debt socialization via a `lossFactor`
• Highly optimized singleton architecture

6/ But we evolved this design for institutional realities:

1. Multi-Collateral Isolation: Unlike Morpho's single-collateral limits, Covenant supports sorted multi-collateral arrays (`collateralParams`) to match real portfolio backing.
2. Fixed-Rate Term: Trade credit at a fixed tick price via off-chain signed offers.

7/ Most importantly, we built a compliance-native gate layer powered by @TheCleanverse.

Every time a position is opened or liquidated, it runs through a gate that queries @TheCleanverse's live compliance pool inside the *same* transaction. 

No stale, cached flags.

8/ Some key design choices we made in the Covenant gate layer:

• Always fail-closed: If the @TheCleanverse compliance pool goes down or returns garbage, the answer is "no". It won't brick the market, but it won't wave someone through either.

9/ • Exposure-only gating: We only gate actions that *increase* exposure (opening a position, taking debt). Withdrawals and repays stay open. If your credentials expire mid-loan, you can still exit. The goal is compliance, not trapping capital.

10/ • Gating binds to Market ID: The gate address is part of the immutable Market struct. A gated market and an open market for the same asset pair are completely different pools by design. No admin can quietly toggle compliance off.

11/ • Transparency on flash loans: Protocol-wide `flashLoan` sits outside market gates. Instead of pretending it's fully gated, we document it: this surface closes at the token layer (via compliance-aware A-Tokens) or through custom governance deployments.

12/ Where we are: 458 tests passing, core engine live on Monad testnet, and a custom BTC/USD oracle built for the liquidation math.

The future of compliant DeFi isn't a checkbox before you connect a wallet. It's a system where invalid compliance states literally cannot transact.

Building on @TheCleanverse.
