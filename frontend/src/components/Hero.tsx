export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-line bg-white/5 text-xs font-semibold tracking-widest uppercase text-brand-400">
            <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            Sepolia · Live
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Compliance-native institutional credit,{" "}
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
              enforced in the settlement path.
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl">
            Fixed-rate, fixed-maturity credit markets that check compliance in the same transaction as
            the trade — not once at onboarding, not from a cached flag, not off-chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/markets" className="btn-primary">Browse markets</a>
            <a href="https://sepolia.etherscan.io/address/0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4"
               target="_blank" rel="noreferrer" className="btn-secondary">
              View on Etherscan
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
