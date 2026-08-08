import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, usePublicClient } from "wagmi";
import { ADDRESSES, LADDER, EXPLORER, CHAIN } from "../config/chain";
import { CLEANVERSE_VALIDATOR_ABI } from "../config/abis";
import { apiUrl } from "../config/api";
import { useCompliance } from "../hooks/useCompliance";
import { useLadder } from "../hooks/useLadder";
import { IconExternal, IconCheck, IconAlert, IconWallet } from "../components/icons";

type Tab = "status" | "register" | "check" | "verify";

const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "My status" },
  { id: "register", label: "Get verified" },
  { id: "check", label: "Check any wallet" },
  { id: "verify", label: "How to verify" },
];

const isTab = (v: string | null): v is Tab =>
  v === "status" || v === "register" || v === "check" || v === "verify";

export function Compliance() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  // `?tab=register` lets other pages deep-link straight to the intake form
  // (How it works does). Validated rather than cast, so a hand-typed value
  // falls back to the status tab instead of rendering nothing.
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requested) ? requested : "status");

  return (
    <section className="shell py-12 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <span className="text-micro font-semibold uppercase text-muted">Eligibility</span>
        <h1 className="text-h1 text-slate-50">Compliance</h1>
        <p className="text-body text-muted">
          Covenant markets are compliance-gated. Every participant needs a valid{" "}
          <span className="text-brand-300 font-medium">A-Pass</span> credential issued by
          Cleanverse before they can lend, borrow, or trade.
        </p>
      </header>

      <div className="border-b border-line">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={tab === id ? "tab-btn-active" : "tab-btn"}
              aria-current={tab === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "status" && (
        <StatusTab
          address={address}
          isConnected={isConnected}
          onGetVerified={() => setTab("register")}
        />
      )}
      {tab === "register" && <RegisterTab onViewStatus={() => setTab("status")} />}
      {tab === "check" && <CheckTab address={address} client={client} />}
      {tab === "verify" && <VerifyTab address={address} />}
    </section>
  );
}

/* ── My status ────────────────────────────────────────────────────────── */

function StatusTab({
  address,
  isConnected,
  onGetVerified,
}: {
  address: string | undefined;
  isConnected: boolean;
  onGetVerified: () => void;
}) {
  const status = useCompliance(address as `0x${string}` | undefined);
  // Zero borrow amount: on this tab the ladder is read for *registration state*,
  // not for a sizing decision, so `collateralRequired` is irrelevant and a 0
  // keeps the lens call free of an arbitrary notional the user never entered.
  const ladder = useLadder(address as `0x${string}` | undefined, 0n);

  if (!isConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconWallet className="w-5 h-5" />
          </div>
          <p className="empty-state-title">Wallet not connected</p>
          <p className="empty-state-body">
            Connect a wallet to run the gate's eligibility checks against your address.
          </p>
        </div>
      </div>
    );
  }

  if (status.loading) {
    return (
      <div className="card">
        <div className="card-body space-y-4">
          <div className="skeleton h-5 w-52" />
          <div className="skeleton h-4 w-full max-w-lg" />
          <div className="skeleton h-4 w-3/5" />
        </div>
      </div>
    );
  }

  const eligible = status.eligible;

  return (
    <div className="space-y-5">
      <div className={`card ${eligible ? "border-ok/35" : "border-warn/35"}`}>
        <div className="card-body flex items-start gap-4">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              eligible ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
            }`}
          >
            {eligible ? (
              <IconCheck className="w-5 h-5" />
            ) : (
              <IconAlert className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1.5 min-w-0">
            <p className={`text-h3 ${eligible ? "text-ok" : "text-warn"}`}>
              {eligible ? "Eligible to trade" : "Not yet eligible"}
            </p>
            <p className="text-body-sm text-muted">
              {eligible
                ? "This wallet holds a valid A-Pass and satisfies the gate's compliance rules. It can lend, borrow, and settle on every gated market."
                : status.registered === false
                  ? "The compliance pool is not registered with the validator. Contact the protocol team."
                  : "This wallet has no valid A-Pass on this chain, or it does not satisfy the pool's compliance rules."}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Gate evaluation · primary market</span>
          <span className={eligible ? "badge-ok" : "badge-warn"}>
            <span className={eligible ? "status-dot-ok" : "status-dot-warn"} />
            {eligible ? "Eligible" : "Denied"}
          </span>
        </div>
        <div className="card-body space-y-3.5">
          <Row label="Wallet" value={address ?? ""} mono />
          <AddressRow label="Validator (CCP V2)" value={ADDRESSES.validator} />
          <AddressRow label="Pool / gate" value={ADDRESSES.gate} />
          <div className="divider pt-3.5">
            <div className="space-y-3.5">
              <Row
                label="isRegistered(pool)"
                value={status.registered ? "true" : "false"}
                ok={status.registered ?? undefined}
                mono
              />
              <Row
                label="complianceVerify(pool, wallet)"
                value={status.verified ? "true" : "false"}
                ok={status.verified ?? undefined}
                mono
              />
            </div>
          </div>
          <div className="divider pt-3.5">
            <Row label="Gate verdict" value={eligible ? "ELIGIBLE" : "DENIED"} ok={eligible} bold />
          </div>
        </div>
      </div>

      {/* Ladder rungs. Each rung is its own market with its own gate, so a wallet
          that clears the primary gate can still be denied here — and right now
          every wallet is, because no rung gate has finished registration. The
          per-rung verdict is the lens's `accessible`, not this page's own read:
          the lens asks the gate the same question the market asks it. */}
      <LadderGateCard ladder={ladder} isConnected={isConnected} />

      {!eligible && (
        <div className="card border-brand-500/25">
          <div className="card-body flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[16rem] space-y-1">
              <p className="text-body font-semibold text-slate-100">Need an A-Pass?</p>
              <p className="text-body-sm text-muted">
                Complete Cleanverse identity verification to receive your credential. Once
                issued, this wallet passes the gate automatically.
              </p>
            </div>
            <button className="btn-primary whitespace-nowrap" onClick={onGetVerified}>
              Get verified
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * An address with an explorer deep-link. Same row geometry as `Row` so the two
 * interleave without a visible seam, but the value is an anchor rather than a
 * string — a reader who wants to confirm a gate's source or its proxy
 * implementation should not have to copy the hex out by hand.
 */
function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-6">
      <span className="text-body-sm text-muted flex-shrink-0">{label}</span>
      <a
        href={`${EXPLORER}/address/${value}`}
        target="_blank"
        rel="noreferrer noopener"
        className="group inline-flex items-center gap-1.5 min-w-0"
      >
        <span className="text-body-sm font-mono truncate text-slate-100 group-hover:text-brand-300 transition-colors">
          {value}
        </span>
        <IconExternal className="w-3.5 h-3.5 shrink-0 text-muted group-hover:text-brand-300 transition-colors" />
      </a>
    </div>
  );
}

/**
 * The three credit-ladder gates, each with its own registration state.
 *
 * This exists because the page previously knew about exactly one gate. A wallet
 * could read "ELIGIBLE" here, open the ladder, and be denied on every rung with
 * no explanation of which gate said no — the compliance page named a verdict it
 * did not fully own.
 *
 * Registration state is read from the lens's `minSubTier`, where 0 is the
 * unregistered sentinel and not a real bar of zero: an unregistered gate carries
 * an empty rule list and denies every wallet, credentialed or not. Reporting
 * that as "you do not qualify" would blame the visitor's credentials for the
 * protocol's own pending step.
 */
function LadderGateCard({
  ladder,
  isConnected,
}: {
  ladder: ReturnType<typeof useLadder>;
  isConnected: boolean;
}) {
  const { deployed, resolved, rungs } = ladder;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Gate evaluation · credit ladder rungs</span>
        {ladder.loading ? (
          <span className="badge-neutral" role="status">
            Resolving…
          </span>
        ) : (
          <span className="badge-neutral">{rungs.length} gates</span>
        )}
      </div>
      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          Each rung is a separate market with its own gate and its own credential bar. Clearing the
          primary gate above does not clear these — the gate address is hashed into the market id,
          so a rung's terms and its policy are one object.
        </p>

        <div className="space-y-3.5">
          {LADDER.rungs.map((config, i) => {
            const rung = rungs[i];
            const bar = deployed && rung?.minSubTier ? rung.minSubTier : null;
            const unregistered = deployed && rung?.minSubTier === 0;
            const accessible = rung?.accessible === true;

            return (
              <div
                key={config.key}
                className="rounded-lg border border-line bg-ink-950/40 p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-body-sm font-semibold text-slate-100">{config.label}</span>
                  {!deployed ? (
                    <span className="badge-neutral">Not deployed</span>
                  ) : accessible ? (
                    <span className="badge-ok">
                      <span className="status-dot-ok" />
                      Eligible
                    </span>
                  ) : unregistered ? (
                    <span className="badge-warn">Awaiting registration</span>
                  ) : !isConnected || !resolved ? (
                    <span className="badge-neutral">Not evaluated</span>
                  ) : (
                    <span className="badge-neutral">Denied</span>
                  )}
                </div>
                <AddressRow label="Gate" value={rung?.gate ?? config.gate ?? "—"} />
                <Row
                  label="Credential bar"
                  value={
                    bar
                      ? `Sub-tier ${bar}`
                      : unregistered
                        ? `Sub-tier ${config.minSubTier} (rule list empty)`
                        : `Sub-tier ${config.minSubTier} (intended)`
                  }
                />
              </div>
            );
          })}
        </div>

        {deployed && rungs.some((r) => r.minSubTier === 0) && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warn/35 bg-warn/[0.06] p-3.5 text-body-sm text-warn">
            <IconAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              These gates are deployed and whitelisted but have not completed Cleanverse
              registration, so their rule lists are empty and they deny every wallet — including
              wallets holding a valid A-Pass. Nothing on this card reflects your credentials until
              registration lands.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Get verified ─────────────────────────────────────────────────────── */

type VerificationStep = 1 | 2 | 3;
type DocumentType = "passport" | "national_id" | "drivers_license" | "";

interface VerificationData {
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  issuingCountry: string;
}

const DOC_LABELS: Record<Exclude<DocumentType, "">, string> = {
  passport: "Passport",
  national_id: "National ID card",
  drivers_license: "Driver's license",
};

const STEP_LABELS = ["Personal info", "Document", "Review"];

function RegisterTab({ onViewStatus }: { onViewStatus: () => void }) {
  const { address, isConnected } = useAccount();
  const compliance = useCompliance(address);
  const [step, setStep] = useState<VerificationStep>(1);
  const [data, setData] = useState<VerificationData>({
    fullName: "",
    documentType: "",
    documentNumber: "",
    issuingCountry: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submitVerification() {
    if (!address) return;
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(apiUrl("/api/generate-apass"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          fullName: data.fullName.trim(),
          documentType: data.documentType,
          documentNumber: data.documentNumber.trim(),
          issuingCountry: data.issuingCountry.toUpperCase(),
        }),
      });
      const responseData = await resp.json();
      if (responseData.ok) {
        setResult({
          ok: true,
          message: "A-Pass issued. Open the My status tab to confirm the gate now passes.",
        });
        // Pull the credential back off-chain so this tab flips to the
        // already-verified state instead of leaving the spent form on screen.
        compliance.refetch();
      } else {
        setResult({
          ok: false,
          message: responseData.message || "Verification failed. Try again or contact support.",
        });
      }
    } catch {
      setResult({
        ok: false,
        message: "Could not reach the verification service. Please try again later.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const canProceedStep1 = data.fullName.trim().length >= 2;
  const canProceedStep2 =
    !!data.documentType &&
    data.documentNumber.trim().length >= 3 &&
    /^[A-Z]{2}$/.test(data.issuingCountry.trim().toUpperCase());

  // Don't flash the intake form while the gate read is still in flight — a
  // wallet that already holds an A-Pass would briefly be invited to request a
  // second one before the form is swapped out from under it.
  if (isConnected && compliance.loading) {
    return (
      <div className="card">
        <div className="card-body space-y-4">
          <div className="skeleton h-5 w-52" />
          <div className="skeleton h-4 w-full max-w-lg" />
          <div className="skeleton h-4 w-3/5" />
        </div>
      </div>
    );
  }

  // The A-Pass is a reusable credential bound to the wallet, so re-running
  // intake for a wallet that already has one issues nothing and just costs the
  // user a form. Report the credential instead of collecting documents again.
  if (compliance.verified) {
    return (
      <div className="space-y-5">
        <div className="card border-ok/35">
          <div className="card-body flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-ok/10 text-ok">
              <IconCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <p className="text-h3 text-ok">Already verified</p>
              <p className="text-body-sm text-muted">
                This wallet already holds a valid{" "}
                <span className="text-brand-300 font-medium">A-Pass</span>. The credential is
                reusable — there is nothing further to submit, and requesting another would not
                change the gate's verdict.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Credential</span>
            <span className="badge-ok">
              <span className="status-dot-ok" />
              Issued
            </span>
          </div>
          <div className="card-body space-y-3.5">
            <Row label="Wallet" value={address ?? ""} mono />
            <Row label="Issuer" value="Cleanverse" />
            <div className="divider pt-3.5">
              <Row
                label="complianceVerify(pool, wallet)"
                value="true"
                ok
                mono
              />
            </div>
          </div>
        </div>

        <div className="card border-brand-500/25">
          <div className="card-body flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[16rem] space-y-1">
              <p className="text-body font-semibold text-slate-100">Verify the full gate check</p>
              <p className="text-body-sm text-muted">
                Holding an A-Pass is one of two conditions. My status runs the pool registration
                check alongside it for the complete verdict.
              </p>
            </div>
            <button className="btn-primary whitespace-nowrap" onClick={onViewStatus}>
              View my status
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Identity verification</span>
          <span className="badge-info">Required</span>
        </div>
        <div className="card-body space-y-3 text-body-sm text-muted">
          <p>
            An <span className="text-brand-300 font-medium">A-Pass</span> is a reusable on-chain
            identity credential issued by{" "}
            <a
              href="https://www.cleanverse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Cleanverse
            </a>
            . It binds your wallet to verified identity data without publishing personal
            information on-chain.
          </p>
          <p>
            Only compliance-relevant attributes — credential tier and issuing country — are
            written on-chain. Document details stay with the issuer.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="step-row">
            {STEP_LABELS.map((_, i) => (
              <div key={i} className="contents">
                {i > 0 && <div className="step-connector" />}
                <StepDot n={i + 1} active={step === i + 1} done={step > i + 1} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3">
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={step === i + 1 ? "step-label-active" : "step-label"}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {step === 1 && "Personal information"}
            {step === 2 && "Identity document"}
            {step === 3 && "Review and submit"}
          </span>
          <span className="text-micro font-semibold uppercase text-subtle">Step {step} of 3</span>
        </div>
        <div className="card-body">
          {!isConnected ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <IconWallet className="w-5 h-5" />
              </div>
              <p className="empty-state-title">Wallet not connected</p>
              <p className="empty-state-body">
                The A-Pass is bound to a wallet address. Connect one to begin verification.
              </p>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-5">
                  <label className="field">
                    <span className="field-label">Wallet address</span>
                    <input className="field-input font-mono text-body-sm" value={address ?? ""} disabled />
                    <p className="text-body-sm text-subtle mt-1.5">
                      This wallet will receive the A-Pass credential.
                    </p>
                  </label>
                  <label className="field">
                    <span className="field-label">Full legal name</span>
                    <input
                      className="field-input"
                      placeholder="Jane Smith"
                      value={data.fullName}
                      onChange={(e) => setData({ ...data, fullName: e.target.value })}
                      autoFocus
                    />
                    <p className="text-body-sm text-subtle mt-1.5">
                      Exactly as it appears on your government-issued document.
                    </p>
                  </label>
                  <button
                    className="btn-primary w-full"
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                  >
                    Continue
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <label className="field">
                    <span className="field-label">Document type</span>
                    <select
                      className="field-input"
                      value={data.documentType}
                      onChange={(e) =>
                        setData({ ...data, documentType: e.target.value as DocumentType })
                      }
                      autoFocus
                    >
                      <option value="">Select a document type</option>
                      {(Object.keys(DOC_LABELS) as Exclude<DocumentType, "">[]).map((k) => (
                        <option key={k} value={k}>
                          {DOC_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Document number</span>
                    <input
                      className="field-input font-mono"
                      placeholder="AB1234567"
                      value={data.documentNumber}
                      onChange={(e) =>
                        setData({ ...data, documentNumber: e.target.value.toUpperCase() })
                      }
                    />
                    <p className="text-body-sm text-subtle mt-1.5">
                      Retained by the issuer for the verification record. Never written on-chain.
                    </p>
                  </label>
                  <label className="field">
                    <span className="field-label">Issuing country</span>
                    <input
                      className="field-input font-mono uppercase"
                      placeholder="US"
                      maxLength={2}
                      value={data.issuingCountry}
                      onChange={(e) =>
                        setData({ ...data, issuingCountry: e.target.value.toUpperCase() })
                      }
                    />
                    <p className="text-body-sm text-subtle mt-1.5">
                      Two-letter{" "}
                      <a
                        href="https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2"
                        target="_blank"
                        rel="noreferrer"
                        className="link"
                      >
                        ISO 3166-1 alpha-2
                      </a>{" "}
                      code. Required — the credential is not issued without it.
                    </p>
                  </label>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" onClick={() => setStep(1)}>
                      Back
                    </button>
                    <button
                      className="btn-primary flex-1"
                      onClick={() => setStep(3)}
                      disabled={!canProceedStep2}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-line bg-ink-900/50 divide-y divide-line">
                    <ReviewRow label="Wallet" value={address ?? ""} mono />
                    <ReviewRow label="Full name" value={data.fullName.trim()} />
                    <ReviewRow
                      label="Document type"
                      value={data.documentType ? DOC_LABELS[data.documentType] : "—"}
                    />
                    <ReviewRow label="Document number" value={data.documentNumber} mono />
                    <ReviewRow label="Issuing country" value={data.issuingCountry} mono />
                  </div>

                  <div className="rounded-lg border border-line bg-white/[0.02] p-3.5">
                    <p className="text-micro font-semibold uppercase text-muted mb-1.5">
                      Privacy notice
                    </p>
                    <p className="text-body-sm text-muted">
                      Cleanverse processes this information under applicable data protection law.
                      Only the credential tier and issuing country reach the chain — your name and
                      document number do not.
                    </p>
                  </div>

                  {result && (
                    <div
                      className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-body-sm ${
                        result.ok
                          ? "border-ok/35 bg-ok/[0.06] text-ok"
                          : "border-bad/35 bg-bad/[0.06] text-bad"
                      }`}
                    >
                      <span className={result.ok ? "status-dot-ok mt-1.5" : "status-dot-bad mt-1.5"} />
                      <span>{result.message}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => {
                        setStep(2);
                        setResult(null);
                      }}
                      disabled={submitting}
                    >
                      Back
                    </button>
                    <button
                      className="btn-primary flex-1"
                      onClick={submitVerification}
                      disabled={submitting || result?.ok}
                    >
                      {submitting ? "Submitting…" : "Submit verification"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Operator alternative</span>
          <span className="badge-neutral">CLI</span>
        </div>
        <div className="card-body space-y-3">
          <p className="text-body-sm text-muted">
            Protocol operators can issue A-Passes directly, without the web form:
          </p>
          <pre className="bg-ink-950/70 border border-line rounded-lg p-3 text-body-sm font-mono text-brand-300 overflow-x-auto">
            python3 offchain/cleanverse_client.py generate-apass \{"\n"}
            {"  "}--chain monad --wallet 0x… --country US --name "Jane Smith"
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ── Check any wallet ─────────────────────────────────────────────────── */

function CheckTab({
  address,
  client,
}: {
  address: string | undefined;
  client: ReturnType<typeof usePublicClient>;
}) {
  const [validator, setValidator] = useState<string>(ADDRESSES.validator);
  const [pool, setPool] = useState<string>(ADDRESSES.gate);
  const [wallet, setWallet] = useState(address ?? "");
  const [result, setResult] = useState<null | { reg: boolean; verified: boolean; error?: string }>(
    null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (address && !wallet) setWallet(address);
  }, [address]);

  async function check() {
    const isAddr = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
    if (!isAddr(validator))
      return setResult({ reg: false, verified: false, error: "Invalid validator address" });
    if (!isAddr(pool))
      return setResult({ reg: false, verified: false, error: "Invalid pool / gate address" });
    if (!isAddr(wallet))
      return setResult({ reg: false, verified: false, error: "Invalid wallet address" });

    setLoading(true);
    try {
      const [reg, verified] = await Promise.all([
        client!
          .readContract({
            address: validator as `0x${string}`,
            abi: CLEANVERSE_VALIDATOR_ABI,
            functionName: "isRegistered",
            args: [pool as `0x${string}`],
          })
          .catch(() => false),
        client!
          .readContract({
            address: validator as `0x${string}`,
            abi: CLEANVERSE_VALIDATOR_ABI,
            functionName: "complianceVerify",
            args: [pool as `0x${string}`, wallet as `0x${string}`],
          })
          .catch(() => false),
      ]);
      setResult({ reg: !!reg, verified: !!verified });
    } catch (e: any) {
      setResult({ reg: false, verified: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  const eligible = !!result && result.reg && result.verified;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Manual compliance check</span>
        <span className="badge-neutral">Read-only</span>
      </div>
      <div className="card-body space-y-5">
        <p className="text-body-sm text-muted">
          Runs the same two staticcalls the gate performs —{" "}
          <code className="font-mono text-brand-300">isRegistered(pool)</code> then{" "}
          <code className="font-mono text-brand-300">complianceVerify(pool, wallet)</code>. Any read
          failure fails closed.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-1">
            <span className="field-label">CVI validator address</span>
            <input
              className="field-input font-mono text-body-sm"
              placeholder="0x…"
              value={validator}
              onChange={(e) => setValidator(e.target.value)}
            />
          </label>
          <label className="field sm:col-span-1">
            <span className="field-label">Pool / gate address</span>
            <input
              className="field-input font-mono text-body-sm"
              placeholder="0x…"
              value={pool}
              onChange={(e) => setPool(e.target.value)}
            />
          </label>
          <label className="field sm:col-span-2">
            <span className="field-label">Wallet to check</span>
            <input
              className="field-input font-mono text-body-sm"
              placeholder="0x…"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
          </label>
        </div>

        <button className="btn-primary w-full" onClick={check} disabled={loading}>
          {loading ? "Checking…" : "Check eligibility"}
        </button>

        {result && (
          <div className="rounded-lg border border-line bg-ink-950/60 p-4 space-y-3">
            {result.error ? (
              <div className="flex items-center gap-2.5 text-body-sm text-bad">
                <span className="status-dot-bad" />
                {result.error}
              </div>
            ) : (
              <>
                <ResultRow label="isRegistered(pool)" ok={result.reg} />
                <ResultRow label="complianceVerify(pool, wallet)" ok={result.verified} />
                <div className="divider pt-3 flex items-center justify-between">
                  <span className="text-micro font-semibold uppercase text-muted">Gate verdict</span>
                  <span className={eligible ? "badge-ok" : "badge-bad"}>
                    <span className={eligible ? "status-dot-ok" : "status-dot-bad"} />
                    {eligible ? "Eligible" : "Denied"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── How to verify ────────────────────────────────────────────────────── */

/**
 * A copyable command. The copy affordance is a text button rather than an icon
 * because the shared icon set has no clipboard glyph, and inventing one here is
 * exactly the drift the icons module was consolidated to stop.
 *
 * `navigator.clipboard` is absent on plain-http origins, so the handler checks
 * for it instead of assuming a promise comes back — the command is selectable
 * either way, and a dead button that silently throws is worse than one that
 * simply never confirms.
 */
function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard denied by permissions policy. The text stays selectable. */
    }
  }

  return (
    <div className="rounded-lg border border-line bg-ink-950/70 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-3.5 py-2 border-b border-line">
        <span className="text-micro font-semibold uppercase text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="text-micro font-semibold uppercase text-muted hover:text-brand-300 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3.5 py-3 overflow-x-auto text-body-sm font-mono text-brand-300 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

/**
 * One verification step: the call, what a pass actually proves, and what a
 * failure actually means. Both halves are required — a check whose failure mode
 * is unexplained teaches a visitor to read `false` as "my credentials are bad",
 * which on this protocol is usually wrong.
 */
function VerifyStep({
  n,
  title,
  proves,
  fails,
  children,
}: {
  n: number;
  title: string;
  proves: string;
  fails: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {n}. {title}
        </span>
      </div>
      <div className="card-body space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink-950/40 p-3.5">
            <div className="text-micro font-semibold uppercase text-muted mb-1.5">
              What a pass proves
            </div>
            <p className="text-body-sm text-subtle">{proves}</p>
          </div>
          <div className="rounded-lg border border-line bg-ink-950/40 p-3.5">
            <div className="text-micro font-semibold uppercase text-muted mb-1.5">
              What a failure means
            </div>
            <p className="text-body-sm text-subtle">{fails}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The independent-verification tab.
 *
 * The other three tabs all ask the visitor to trust this frontend: `StatusTab`
 * renders a verdict, `CheckTab` runs the reads for you. Neither is evidence — a
 * compliance-gated protocol that can only be confirmed through its own UI has
 * not actually shown anyone anything. This tab exists so a visitor can reproduce
 * every gate decision from a terminal, against a public RPC, with no frontend in
 * the path.
 *
 * The steps mirror the exact order the gate evaluates in-transaction, so a
 * failure here localizes to the same step that would revert on-chain.
 */
function VerifyTab({ address }: { address: string | undefined }) {
  // Falls back to the zero address so the commands stay copy-pasteable while
  // disconnected. A placeholder like `<your address>` would paste as a shell
  // syntax error; the zero address returns a clean `false` instead, which is
  // the correct answer for a wallet that holds no credential.
  const wallet = address ?? "0x0000000000000000000000000000000000000000";
  const rpc = CHAIN.rpcUrls.default.http[0];

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-body space-y-3">
          <p className="text-body-sm text-muted">
            Every check below is a read-only <code className="font-mono text-brand-300">eth_call</code>{" "}
            against a public RPC. Nothing here needs this site — paste the commands into a terminal
            with{" "}
            <a
              href="https://getfoundry.sh"
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand-300 hover:underline"
            >
              Foundry
            </a>{" "}
            installed and you should reproduce the gate's verdict exactly.
          </p>
          <div className="divider pt-3 space-y-2.5">
            <AddressRow label="CVI validator" value={ADDRESSES.validator} />
            <AddressRow label="Pool gate" value={ADDRESSES.gate} />
            <AddressRow label="Wallet being checked" value={wallet} />
          </div>
        </div>
      </div>

      <VerifyStep
        n={1}
        title="Is the gate registered with Cleanverse?"
        proves="The gate carries a non-empty rule list, so it can evaluate credentials at all."
        fails="The gate is deployed but its Cleanverse registration is still pending. It denies every wallet — credentialed or not. This is a protocol-side step, not a problem with your credentials."
      >
        <CopyBlock
          label="cast call"
          code={`cast call ${ADDRESSES.validator} \\\n  "isRegistered(address)(bool)" \\\n  ${ADDRESSES.gate} \\\n  --rpc-url ${rpc}`}
        />
      </VerifyStep>

      <VerifyStep
        n={2}
        title="Does this wallet hold a valid A-Pass?"
        proves="Cleanverse has issued this wallet a credential that satisfies the gate's sub-tier bar."
        fails="Either the wallet holds no A-Pass, or it holds one below the sub-tier this gate requires. Step 3 tells you which."
      >
        <CopyBlock
          label="cast call"
          code={`cast call ${ADDRESSES.validator} \\\n  "complianceVerify(address,address)(bool)" \\\n  ${ADDRESSES.gate} ${wallet} \\\n  --rpc-url ${rpc}`}
        />
      </VerifyStep>

      <VerifyStep
        n={3}
        title="Which sub-tier does each ladder rung require?"
        proves="The bar each rung enforces, read from the gate itself rather than from this page's copy."
        fails="A rung returning 0 is unregistered, not open to everyone — 0 is the sentinel for an empty rule list, and an empty rule list denies all."
      >
        <CopyBlock
          label="cast call"
          code={LADDER.rungs
            .filter((r) => r.gate)
            .map(
              (r) =>
                `# ${r.label ?? "rung"}\ncast call ${r.gate} "minSubTier()(uint8)" --rpc-url ${rpc}`,
            )
            .join("\n\n")}
        />
      </VerifyStep>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Reading the results together</span>
        </div>
        <div className="card-body">
          <p className="text-body-sm text-muted">
            The gate admits a wallet only when step 1 and step 2 both return{" "}
            <code className="font-mono text-brand-300">true</code>. Both reads fail closed: if the
            validator call reverts or the RPC times out, the gate treats it as a denial rather than
            as an approval. A <code className="font-mono text-brand-300">false</code> from step 1
            therefore makes step 2 irrelevant — the gate never reaches it.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared pieces ────────────────────────────────────────────────────── */

function Row({
  label,
  value,
  ok,
  mono,
  bold,
}: {
  label: string;
  value: string;
  ok?: boolean;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-6">
      <span className="text-body-sm text-muted flex-shrink-0">{label}</span>
      <span
        className={`text-body-sm truncate ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""} ${
          ok === true ? "text-ok" : ok === false ? "text-bad" : "text-slate-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-6 px-4 py-3">
      <span className="text-body-sm text-muted flex-shrink-0">{label}</span>
      <span className={`text-body-sm text-slate-100 truncate ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function ResultRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-body-sm font-mono text-muted">{label}</span>
      <span className={`text-body-sm font-mono ${ok ? "text-ok" : "text-bad"}`}>{String(ok)}</span>
    </div>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={done ? "step-dot-done" : active ? "step-dot-active" : "step-dot"}>
      {done ? <IconCheckSmall /> : n}
    </div>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */

function IconCheckSmall() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
