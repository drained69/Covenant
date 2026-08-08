"""
Covenant — Business Plan PDF generator.

Standard business plan structure. Output: business_plan.pdf in the same directory.
Also copied to ~/Downloads.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether, NextPageTemplate,
)
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ── Brand colors ─────────────────────────────────────────────────────────────
NAVY    = colors.HexColor("#081C3A")
ROYAL   = colors.HexColor("#1E5EFF")
EMERALD = colors.HexColor("#10B981")
GOLD    = colors.HexColor("#C8A24C")
INK     = colors.HexColor("#1A2540")
MUTED   = colors.HexColor("#6B7280")
RULE    = colors.HexColor("#E5E7EB")
BG      = colors.HexColor("#F7F8FA")

PAGE_W, PAGE_H = LETTER

# ── Styles ───────────────────────────────────────────────────────────────────
def build_styles():
    ss = getSampleStyleSheet()

    body = ParagraphStyle(
        "Body", parent=ss["BodyText"],
        fontName="Helvetica", fontSize=10.5, leading=16,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=8,
    )
    body_left = ParagraphStyle(
        "BodyLeft", parent=body, alignment=TA_LEFT,
    )
    h1 = ParagraphStyle(
        "H1", parent=ss["Heading1"],
        fontName="Helvetica-Bold", fontSize=22, leading=28,
        textColor=NAVY, spaceBefore=0, spaceAfter=6, alignment=TA_LEFT,
    )
    h2 = ParagraphStyle(
        "H2", parent=ss["Heading2"],
        fontName="Helvetica-Bold", fontSize=14, leading=20,
        textColor=NAVY, spaceBefore=18, spaceAfter=6, alignment=TA_LEFT,
    )
    h3 = ParagraphStyle(
        "H3", parent=ss["Heading3"],
        fontName="Helvetica-Bold", fontSize=11, leading=15,
        textColor=ROYAL, spaceBefore=10, spaceAfter=3, alignment=TA_LEFT,
    )
    eyebrow = ParagraphStyle(
        "Eyebrow", parent=body,
        fontName="Helvetica-Bold", fontSize=8, leading=11,
        textColor=ROYAL, spaceAfter=6, alignment=TA_LEFT,
    )
    muted = ParagraphStyle(
        "Muted", parent=body,
        fontSize=9, leading=13, textColor=MUTED, alignment=TA_LEFT,
    )
    bullet = ParagraphStyle(
        "Bullet", parent=body,
        leftIndent=14, bulletIndent=2, spaceAfter=4, alignment=TA_LEFT,
    )
    cover_title = ParagraphStyle(
        "CoverTitle", parent=body,
        fontName="Helvetica-Bold", fontSize=48, leading=54,
        textColor=NAVY, spaceAfter=8, alignment=TA_LEFT,
    )
    cover_sub = ParagraphStyle(
        "CoverSub", parent=body,
        fontName="Helvetica", fontSize=13, leading=19,
        textColor=INK, spaceAfter=4, alignment=TA_LEFT,
    )
    cover_meta = ParagraphStyle(
        "CoverMeta", parent=body,
        fontName="Helvetica", fontSize=9, leading=13,
        textColor=MUTED, alignment=TA_LEFT,
    )
    return {
        "body": body, "body_left": body_left,
        "h1": h1, "h2": h2, "h3": h3,
        "eyebrow": eyebrow, "muted": muted, "bullet": bullet,
        "cover_title": cover_title, "cover_sub": cover_sub, "cover_meta": cover_meta,
    }


# ── Icon glyph (the ring-with-latch mark) ────────────────────────────────────
def draw_icon(c: Canvas, x: float, y: float, size: float, ring_color=NAVY, latch_color=ROYAL):
    """
    Draw the Covenant mark: an open ring closed by a rectangular latch.
    Sized relative to `size` (drawn inside a size x size box, origin bottom-left).
    """
    c.saveState()
    c.translate(x, y)
    scale = size / 100.0
    c.scale(scale, scale)

    # Ring — open arc from angle -35deg to 215deg (leaves a gap on the right)
    c.setStrokeColor(ring_color)
    c.setLineWidth(16)
    c.setLineCap(0)  # butt

    # Path for the open arc
    p = c.beginPath()
    import math
    cx, cy, r = 50.0, 50.0, 38.0
    # start angle
    start_deg = -35.0
    end_deg = 215.0
    # ReportLab draws arcs via bezier or arcs; use arc()
    p.moveTo(cx + r * math.cos(math.radians(start_deg)),
             cy + r * math.sin(math.radians(start_deg)))
    # Approximate arc with many segments
    steps = 60
    for i in range(1, steps + 1):
        t = start_deg + (end_deg - start_deg) * i / steps
        px = cx + r * math.cos(math.radians(t))
        py = cy + r * math.sin(math.radians(t))
        p.lineTo(px, py)
    c.drawPath(p, stroke=1, fill=0)

    # Latch — rectangle covering the gap
    c.setFillColor(latch_color)
    c.setStrokeColor(latch_color)
    c.roundRect(79, 38.26, 18, 23.48, 2, stroke=0, fill=1)

    c.restoreState()


# ── Page decorations ─────────────────────────────────────────────────────────
def cover_page_deco(c: Canvas, doc):
    c.saveState()

    # Left navy accent bar
    c.setFillColor(NAVY)
    c.rect(0, 0, 0.35 * inch, PAGE_H, stroke=0, fill=1)

    # Emerald tick near bottom of bar
    c.setFillColor(EMERALD)
    c.rect(0, 1.4 * inch, 0.35 * inch, 0.12 * inch, stroke=0, fill=1)

    # Icon in top-right area
    draw_icon(c, PAGE_W - 1.4 * inch, PAGE_H - 1.35 * inch, 0.9 * inch)

    # Footer wordmark
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(1.0 * inch, 0.55 * inch, "COVENANT")
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(1.0 * inch, 0.4 * inch, "Compliance-Native Institutional Credit Infrastructure")

    c.restoreState()


def content_page_deco(c: Canvas, doc):
    c.saveState()

    # Top-left small mark
    draw_icon(c, 0.75 * inch, PAGE_H - 0.85 * inch, 0.3 * inch)

    # Wordmark next to mark
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(1.2 * inch, PAGE_H - 0.72 * inch, "COVENANT")

    # Top rule
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(0.75 * inch, PAGE_H - 0.95 * inch, PAGE_W - 0.75 * inch, PAGE_H - 0.95 * inch)

    # Footer: page number + tagline
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(0.75 * inch, 0.5 * inch, "Covenant · Business Plan · 2026")
    c.drawRightString(PAGE_W - 0.75 * inch, 0.5 * inch, f"{doc.page - 1}")

    c.restoreState()


# ── Content helpers ──────────────────────────────────────────────────────────
def eyebrow(styles, text):
    return Paragraph(text.upper(), styles["eyebrow"])

def h2(styles, text):
    return Paragraph(text, styles["h2"])

def h3(styles, text):
    return Paragraph(text, styles["h3"])

def p(styles, text, style="body"):
    return Paragraph(text, styles[style])

def bullet_list(styles, items):
    return [Paragraph(f"•&nbsp;&nbsp;{item}", styles["bullet"]) for item in items]

def divider():
    from reportlab.platypus import HRFlowable
    return HRFlowable(width="100%", thickness=0.6, color=RULE, spaceBefore=6, spaceAfter=10)

def kv_table(rows, col_widths=None):
    tbl = Table(rows, colWidths=col_widths or [1.6 * inch, 4.6 * inch])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9),
        ("FONT", (1, 0), (1, -1), "Helvetica", 10),
        ("TEXTCOLOR", (0, 0), (0, -1), ROYAL),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]))
    return tbl

def data_table(rows, col_widths=None, header=True):
    tbl = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("BOX", (0, 0), (-1, -1), 0.3, RULE),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
        ]
    tbl.setStyle(TableStyle(style))
    return tbl


# ── Build the story ──────────────────────────────────────────────────────────
def build_story(styles):
    s = []

    # ── COVER ─────────────────────────────────────────────────────────
    s.append(Spacer(1, 2.6 * inch))
    s.append(Paragraph("COVENANT", styles["cover_title"]))
    s.append(Spacer(1, 0.15 * inch))
    s.append(Paragraph(
        "Compliance-native institutional credit infrastructure "
        "for fixed-rate, fixed-maturity on-chain lending.",
        styles["cover_sub"],
    ))
    s.append(Spacer(1, 0.6 * inch))
    s.append(Paragraph("BUSINESS PLAN &nbsp;·&nbsp; 2026", styles["cover_meta"]))
    s.append(Paragraph("Prepared for institutional partners, "
                       "regulatory reviewers, and prospective investors.",
                       styles["cover_meta"]))
    s.append(NextPageTemplate("content"))
    s.append(PageBreak())

    # ── EXECUTIVE SUMMARY ─────────────────────────────────────────────
    s.append(eyebrow(styles, "01 · Executive Summary"))
    s.append(h2(styles, "The company at a glance"))
    s.append(p(styles,
        "Covenant is a compliance-native infrastructure layer for institutional "
        "on-chain credit. We combine a fixed-rate, fixed-maturity lending engine "
        "with a native gate layer purpose-built to carry real compliance logic — "
        "identity verification, jurisdictional policy enforcement, sanctions "
        "screening, and audit-trail generation — enforced at the smart-contract "
        "level, not bolted on off-chain."))
    s.append(p(styles,
        "The $130 trillion global fixed-income market has almost no on-chain "
        "presence, and the reason isn't technical. The infrastructure exists. "
        "What's missing is a compliance layer institutions can legally use. "
        "Covenant is that layer."))
    s.append(p(styles,
        "Our differentiator is the <b>Tiered Credit Ladder</b>: verified identity "
        "does not merely grant access to a market — it prices the loan. A "
        "bank-verified counterparty and an anonymous-but-credentialed wallet "
        "borrow the same asset, in the same block, on the same engine, and post "
        "materially different collateral, because the credential each carries "
        "sets the loan-to-value they receive. Compliance stops being a cost "
        "centre and becomes the thing institutions are paid for. That is the "
        "commercial argument for choosing a regulated venue over a permissionless "
        "one, and it is enforced in settlement rather than asserted in a policy "
        "document."))
    s.append(divider())

    s.append(h3(styles, "Snapshot"))
    s.append(kv_table([
        ["Company",         "Covenant"],
        ["Sector",          "Institutional DeFi · On-chain fixed income · RWA infrastructure"],
        ["Product",         "Compliance-gated fixed-maturity credit markets"],
        ["Stage",           "Hackathon MVP · Design-partner pilot planned"],
        ["Key partnership", "Cleanverse (identity, policy, audit primitives)"],
        ["Model",           "Origination fees · Integration licensing · Compliance-as-a-Service"],
        ["Founding target", "Q4 2026 testnet pilot · Q2 2027 mainnet launch"],
    ]))

    s.append(PageBreak())

    # ── COMPANY DESCRIPTION ───────────────────────────────────────────
    s.append(eyebrow(styles, "02 · Company Description"))
    s.append(h2(styles, "What Covenant is, and why it exists"))

    s.append(h3(styles, "Mission"))
    s.append(p(styles,
        "Give regulated institutions — banks, tokenized-deposit providers, RWA "
        "issuers, and licensed lenders — a way to originate, hold, and settle "
        "on-chain credit under the same compliance obligations they meet in "
        "traditional markets, without sacrificing the settlement guarantees, "
        "transparency, or programmability that make on-chain infrastructure "
        "attractive in the first place."))

    s.append(h3(styles, "Problem"))
    s.append(p(styles,
        "DeFi lending today is either variable-rate (Aave, Compound) or "
        "permissionless fixed-rate. Neither works for institutional counterparties. "
        "Banks and RWA issuers cannot legally extend credit to anonymous wallets, "
        "cannot participate without jurisdiction-aware transfer rules, and cannot "
        "operate without audit trails regulators can extract on demand."))
    s.append(p(styles,
        "The standard industry response — bolt KYC onto a protocol as an "
        "off-chain side process — creates a permanent gap between “who passed KYC” "
        "and “who actually holds the position.” That gap is a regulatory liability "
        "and, in practice, has kept institutional capital off-chain."))

    s.append(h3(styles, "Solution"))
    s.append(p(styles,
        "Covenant embeds compliance primitives — non-transferable identity "
        "tokens, an on-chain policy engine, and audit-ready extractable data — "
        "directly into the lending market's own access-control layer. Every "
        "lend, borrow, and liquidation call is gated. Compliance becomes a "
        "mechanical property of the market, not an external process."))

    s.append(h3(styles, "Legal & Regulatory Positioning"))
    s.append(p(styles,
        "Covenant is infrastructure, not a licensed financial institution. "
        "We do not custody assets, issue tokens, or act as counterparty to any "
        "loan. Licensed institutions using Covenant markets remain the "
        "regulated actors; Covenant supplies the technical rails and the "
        "compliance-enforcement layer that make those markets viable for them."))

    s.append(PageBreak())

    # ── MARKET ANALYSIS ───────────────────────────────────────────────
    s.append(eyebrow(styles, "03 · Market Analysis"))
    s.append(h2(styles, "Institutional on-chain credit is a category, not a niche."))

    s.append(h3(styles, "Market size"))
    s.append(p(styles,
        "The global fixed-income market exceeds $130 trillion. On-chain fixed "
        "income sits at a fraction of a fraction of one percent of that. The "
        "bottleneck is not investor demand — tokenized U.S. Treasury products "
        "alone have grown past $2 billion in under two years with almost no "
        "institutional marketing behind them. The bottleneck is that most "
        "institutions cannot legally use the venues that exist."))

    s.append(h3(styles, "Segments we serve"))
    s.append(data_table([
        ["Segment", "Need", "Why Covenant"],
        ["RWA Issuers", "Compliant fixed-income rails for tokenized debt",
         "Gated markets from origination through maturity"],
        ["Tokenized-Deposit Banks", "On-chain settlement for regulated stablecoin liabilities",
         "Jurisdiction-aware transfer rules enforced on-chain"],
        ["Institutional Stablecoin Issuers", "Compliant venues that don't reintroduce custody risk",
         "Non-custodial gate; audit trail by construction"],
        ["Licensed Lenders", "Fixed-rate term facilities with regulated counterparties",
         "Verified counterparty pool; policy-engine-cleared trades"],
    ], col_widths=[1.5 * inch, 2.4 * inch, 2.4 * inch]))

    s.append(h3(styles, "Competitive landscape"))
    s.append(p(styles,
        "Existing venues either sacrifice compliance for openness (permissionless "
        "lending markets) or sacrifice on-chain guarantees for compliance (KYC-wrapped "
        "gateways operating alongside protocols they don't control). Institutional "
        "custody providers offer compliance for asset holding but no primitive for "
        "fixed-rate credit. Covenant occupies the missing quadrant: on-chain "
        "settlement guarantees and enforceable compliance in the same venue."))

    s.append(h3(styles, "Trend tailwinds"))
    s.extend(bullet_list(styles, [
        "Growing regulatory clarity on tokenized deposits and RWA issuance in "
        "the EU (MiCA), Singapore (MAS), and the UAE (VARA).",
        "Major banks piloting tokenized-deposit rails; regulated stablecoins "
        "moving from experiment to standard settlement asset.",
        "Institutional appetite for compliant on-chain yield rising as "
        "traditional fixed-income duration compresses.",
    ]))

    s.append(PageBreak())

    # ── PRODUCT ───────────────────────────────────────────────────────
    s.append(eyebrow(styles, "04 · Product"))
    s.append(h2(styles, "What we build"))

    s.append(h3(styles, "The gate layer"))
    s.append(p(styles,
        "The core product is <b>CovenantGate</b>, a smart contract implementing "
        "the market's native gate hooks (canIncreaseCredit, canIncreaseDebt, "
        "canLiquidate). Every position change is intercepted and cleared against "
        "Cleanverse's on-chain identity and policy engine before it executes."))

    s.append(h3(styles, "The Tiered Credit Ladder"))
    s.append(p(styles,
        "Covenant's differentiator: <b>verified identity prices the loan</b>. "
        "The credit ladder deploys multiple markets for the same asset pair, "
        "each with its own compliance gate and loan-to-value ratio. A verified "
        "institution posts 109k collateral to borrow 100k (91.5% LLTV) at the "
        "top rung. A verified retail wallet posts 260k for the same loan (38.5% "
        "LLTV) at the bottom rung. The credential tier each wallet carries "
        "determines which rung they access — and capital efficiency becomes "
        "the economic reward for verified identity, not just a regulatory cost. "
        "The gate address that checks the credential is cryptographically bound "
        "to the market id that sets the LLTV, so the policy and the price are "
        "the same immutable object."))
    s.append(Spacer(1, 4))
    s.append(data_table([
        ["Rung", "Credential bar", "LLTV", "Collateral for $100k", "Who qualifies"],
        ["3 — Institutional",  "Sub-tier 30", "91.5%", "$109k", "Bank-verified entity"],
        ["2 — Professional",   "Sub-tier 20", "77.0%", "$130k", "Verified individual"],
        ["1 — Retail",         "Sub-tier 10", "38.5%", "$260k", "Any valid credential"],
        ["0 — No credential",  "—",           "—",     "Cannot open", "Denied at the gate"],
    ], col_widths=[1.35 * inch, 1.1 * inch, 0.65 * inch, 1.2 * inch, 1.9 * inch]))
    s.append(Spacer(1, 4))
    s.append(p(styles,
        "Critically, the ladder required <b>no changes to the credit engine</b>. "
        "It is expressed entirely through invariants the protocol already had: "
        "per-collateral LLTV, gate addresses inside the market identity hash, "
        "and increase-only gating. Adding a rung — a fund-only tranche, a "
        "jurisdiction-scoped tranche — is a deployment, not an upgrade. That is "
        "what makes the model extensible without reintroducing protocol risk.",
        style="muted"))

    s.append(h3(styles, "The market factory"))
    s.append(p(styles,
        "A periphery contract lets a Cleanverse-onboarded institution deploy "
        "a fixed-maturity credit market with the gate pre-installed and asset "
        "eligibility pre-restricted to Cleanverse-approved instruments — "
        "compliance is a property of the market from creation, not something "
        "added later."))

    s.append(h3(styles, "Identity lifecycle handling"))
    s.append(p(styles,
        "The gate is aware of identity state: fresh, expired, revoked, "
        "re-verified. Position increases can be blocked mid-life while allowing "
        "in-flight positions to settle at maturity — you cannot strand an "
        "institution's capital because of an expired credential, but you also "
        "cannot let a revoked party open new exposure."))
    s.append(p(styles,
        "This asymmetry is what makes the ladder safe to deploy against real "
        "money. A counterparty whose credential is downgraded or frozen loses "
        "access to new borrowing at the rung they previously cleared, but their "
        "open position remains repayable and their collateral remains "
        "withdrawable. Compliance revocation halts new risk without stranding "
        "committed capital — the property an institutional credit committee "
        "asks about first, and the reason a compliance event here does not "
        "trigger a forced liquidation."))

    s.append(h3(styles, "The regulator report"))
    s.append(p(styles,
        "A read-side product that resolves on-chain events against Cleanverse "
        "identity data and produces a human-readable compliance report: who "
        "lent to whom, in what jurisdiction, at what rate, against what "
        "collateral, settled when. Zero manual reconciliation. This is what "
        "turns Covenant from a compliance mechanism into an audit product."))

    s.append(h3(styles, "Roadmap"))
    s.append(data_table([
        ["Phase",             "Timeline",  "Deliverable"],
        ["Hackathon MVP",     "Now",       "CovenantGate + Tiered Credit Ladder (3 rungs, lens router, deployment script) + tests + demo"],
        ["Design Partner",    "Q4 2026",   "Testnet pilot with one RWA issuer or licensed lender; ladder tuned to partner's credential tiers"],
        ["Multi-Jurisdiction","Q1 2027",   "Per-market policy profiles; 3+ jurisdictions supported; jurisdiction-scoped ladder rungs"],
        ["Mainnet Launch",    "Q2 2027",   "Production deployment; reference integration published; audited ladder"],
        ["Scale",             "Q3 2027+",  "SDK for other protocols; multiple gated market types; fund-only and sector-scoped rungs"],
    ], col_widths=[1.6 * inch, 1.4 * inch, 3.3 * inch]))

    s.append(PageBreak())

    # ── MARKETING & SALES ─────────────────────────────────────────────
    s.append(eyebrow(styles, "05 · Marketing & Sales Strategy"))
    s.append(h2(styles, "Go-to-market"))

    s.append(h3(styles, "Positioning"))
    s.append(p(styles,
        "Covenant is not a “DeFi protocol.” It's <i>infrastructure a regulated "
        "institution can approve</i>. Our positioning, materials, and outbound "
        "language avoid the retail crypto lexicon entirely. Comparable brands "
        "in tone: Fireblocks, Chainalysis, Modern Treasury, Plaid — enterprise "
        "financial infrastructure, quietly confident, technically precise."))

    s.append(h3(styles, "Acquisition — three channels"))
    s.extend(bullet_list(styles, [
        "<b>Cleanverse ecosystem.</b> Every institution onboarded to Cleanverse "
        "is a candidate market creator. We build the launch and pipeline motion "
        "as a joint offering.",
        "<b>Design-partner marquee.</b> One anchor issuer (RWA or tokenized "
        "deposit) running a real fixed-maturity facility on Covenant becomes "
        "the reference case for the next ten.",
        "<b>Regulator-facing content.</b> The audit-trail product is the "
        "wedge that gets Covenant into the room with supervisors, not just "
        "with counterparties.",
    ]))

    s.append(h3(styles, "Sales motion"))
    s.append(p(styles,
        "Enterprise. Long cycle. Small number of high-value contracts. We "
        "expect first-touch → signed pilot to run 3–6 months for design "
        "partners and 6–12 months for post-pilot institutional adoption. "
        "Deals are structured around a specific market template (jurisdiction, "
        "asset pair, policy profile), not a generic platform license."))

    s.append(PageBreak())

    # ── ORGANIZATION & MANAGEMENT ─────────────────────────────────────
    s.append(eyebrow(styles, "06 · Organization & Management"))
    s.append(h2(styles, "Team & structure"))

    s.append(h3(styles, "Founding structure"))
    s.append(p(styles,
        "Covenant is founder-led at the hackathon stage. Immediate hires post-pilot "
        "will target three functions: protocol engineering (Solidity + formal "
        "verification), institutional partnerships (banking / RWA background), "
        "and regulatory affairs. Ownership and cap-table structure will be "
        "established at incorporation, with founder equity, an employee pool, "
        "and reserved allocation for a design-partner strategic round."))

    s.append(h3(styles, "Advisors we intend to recruit"))
    s.extend(bullet_list(styles, [
        "One advisor from an existing tokenized-deposit programme at a G-SIB or "
        "national regulator.",
        "One advisor with securities or banking supervisory experience in the EU, "
        "UAE, or Singapore.",
        "One advisor from Cleanverse or a comparable identity/policy protocol.",
    ]))

    s.append(h3(styles, "Operating principles"))
    s.extend(bullet_list(styles, [
        "Formal verification of the gate and factory contracts before any "
        "mainnet deployment.",
        "Public audit reports from at least two independent security firms "
        "before design-partner mainnet activation.",
        "No custody, no counterparty exposure, no protocol treasury of user assets.",
    ]))

    s.append(PageBreak())

    # ── FINANCIAL PROJECTIONS ─────────────────────────────────────────
    s.append(eyebrow(styles, "07 · Financial Projections"))
    s.append(h2(styles, "Model"))

    s.append(p(styles,
        "Covenant's revenue derives from three streams. Numbers below are "
        "planning targets under a base-case adoption path — one anchor design "
        "partner in Year 1, five active institutional counterparties in Year 2, "
        "and mid-teens counterparties supporting multiple market templates by "
        "Year 3. They assume conservative fee capture (single-digit basis "
        "points on notional) and no equity-token or speculative revenue."))

    s.append(h3(styles, "Revenue streams"))
    s.append(data_table([
        ["Stream",                       "How it's earned",                                              "Base assumption"],
        ["Origination fees",             "Bps on notional credit issued in gated markets",               "~3–8 bps blended"],
        ["Integration licensing",        "Fee for pre-configured market templates per jurisdiction",     "Annual, per template"],
        ["Compliance-as-a-Service",      "Ongoing per-market policy management and sync",                "Recurring, per market"],
    ], col_widths=[1.7 * inch, 3.0 * inch, 1.6 * inch]))

    s.append(h3(styles, "3-year projection (illustrative)"))
    s.append(data_table([
        ["Year",   "Active Markets", "Notional Issued (USD)", "Blended Revenue (USD)"],
        ["Y1",     "1 pilot",        "$50M – $150M",          "$0.2M – $0.6M"],
        ["Y2",     "5 markets",      "$500M – $1.2B",         "$2M – $6M"],
        ["Y3",     "15 markets",     "$2B – $5B",             "$8M – $25M"],
    ], col_widths=[0.9 * inch, 1.6 * inch, 1.9 * inch, 1.9 * inch]))

    s.append(Spacer(1, 6))
    s.append(p(styles,
        "These are planning ranges, not forecasts; they exist to size the "
        "opportunity and the capital requirement, not to promise outcomes. "
        "Actuals will depend on regulatory posture in each target jurisdiction, "
        "design-partner throughput, and Cleanverse adoption velocity.",
        style="muted"))

    s.append(h3(styles, "Capital plan"))
    s.append(p(styles,
        "We plan a seed round following the hackathon and design-partner "
        "commitments, sized to cover 18–24 months of protocol engineering, "
        "audits, formal verification, regulatory affairs, and institutional "
        "sales. Follow-on capital timed to mainnet launch and second-jurisdiction "
        "expansion."))

    s.append(PageBreak())

    # ── FUNDING REQUEST ───────────────────────────────────────────────
    s.append(eyebrow(styles, "08 · Funding Request"))
    s.append(h2(styles, "What we need to get to mainnet"))

    s.append(kv_table([
        ["Round",           "Seed"],
        ["Target",          "USD 2.5M – 4.0M"],
        ["Runway",          "18–24 months to mainnet + first two design partners live"],
        ["Instrument",      "SAFE or priced equity round, standard institutional terms"],
        ["Use of proceeds", "Protocol engineering (45%) · Audits & formal verification (20%) · "
                            "Regulatory affairs (15%) · Institutional partnerships (15%) · Operations (5%)"],
        ["Ideal investors", "Institutional-DeFi-focused funds; strategic partners with regulated finance reach"],
    ]))

    s.append(h3(styles, "What the round buys"))
    s.extend(bullet_list(styles, [
        "A production-hardened, independently audited, formally verified gate "
        "and market-factory suite.",
        "Two live design-partner facilities on testnet, one on mainnet by end "
        "of runway.",
        "Regulatory sign-off relationships in at least two priority "
        "jurisdictions.",
        "The reference integration published to both the underlying credit "
        "protocol and the Cleanverse ecosystem — a distribution lever for the "
        "next round.",
    ]))

    s.append(PageBreak())

    # ── APPENDIX ──────────────────────────────────────────────────────
    s.append(eyebrow(styles, "Appendix"))
    s.append(h2(styles, "Risks & mitigations"))

    s.append(data_table([
        ["Risk",                                     "Mitigation"],
        ["Regulatory divergence across jurisdictions",
         "Per-market policy profiles; jurisdiction-scoped market templates."],
        ["Cleanverse adoption slower than modeled",
         "Gate abstraction supports additional identity/policy providers over time."],
        ["Smart-contract risk (gate, factory)",
         "Multiple independent audits; formal verification; conservative launch cadence."],
        ["Institutional sales cycle length",
         "Design-partner anchor before broad go-to-market; long capital runway."],
        ["Compliance drift (sanctions, rules updates)",
         "Policy engine reads live; no cached snapshots; Compliance-as-a-Service line covers sync."],
    ], col_widths=[2.5 * inch, 3.7 * inch]))

    s.append(h2(styles, "Glossary"))
    s.extend([
        p(styles, "<b>CovenantGate</b> — the smart contract implementing the market's "
                  "native gate hooks, backed by Cleanverse's identity and policy engine."),
        p(styles, "<b>Fixed-rate, fixed-maturity credit</b> — on-chain lending in which "
                  "rate and settlement date are fixed at origination, analogous to a "
                  "zero-coupon obligation."),
        p(styles, "<b>Cleanverse</b> — compliance-infrastructure partner providing "
                  "non-transferable identity tokens, an on-chain policy/rules engine, "
                  "and audit-ready extractable data."),
        p(styles, "<b>RWA (Real-World Assets)</b> — off-chain financial assets "
                  "represented on-chain as programmable tokens."),
        p(styles, "<b>Travel Rule</b> — a regulatory requirement that value transfers "
                  "above a threshold carry originator/beneficiary information between "
                  "financial institutions."),
    ])

    s.append(Spacer(1, 0.4 * inch))
    s.append(p(styles,
        "Covenant is a work in progress. This document reflects intent and plan "
        "as of the date on the cover. Numbers are planning targets, not forecasts. "
        "Nothing herein constitutes an offer of securities or investment advice.",
        style="muted"))

    return s


# ── Doc build ────────────────────────────────────────────────────────────────
def build(out_path):
    doc = BaseDocTemplate(
        out_path,
        pagesize=LETTER,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=1.15 * inch,
        bottomMargin=0.85 * inch,
        title="Covenant — Business Plan",
        author="Covenant",
        subject="Business Plan",
    )

    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="normal", showBoundary=0,
    )
    cover_frame = Frame(
        0.9 * inch, 0.85 * inch,
        PAGE_W - 1.8 * inch, PAGE_H - 1.7 * inch,
        id="cover", showBoundary=0,
    )

    doc.addPageTemplates([
        PageTemplate(id="cover",   frames=[cover_frame], onPage=cover_page_deco),
        PageTemplate(id="content", frames=[frame],       onPage=content_page_deco),
    ])

    styles = build_styles()
    story = build_story(styles)
    doc.build(story)


if __name__ == "__main__":
    import os, shutil
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "business_plan.pdf")
    build(out)
    downloads = os.path.expanduser("~/Downloads/Covenant-Business-Plan.pdf")
    shutil.copy(out, downloads)
    print(f"Wrote: {out}")
    print(f"Copied to: {downloads}")
