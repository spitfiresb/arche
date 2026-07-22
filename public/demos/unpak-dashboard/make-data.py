#!/usr/bin/env python3
"""Build the demo payload the unpak dashboard reads at /api/engagement.

The shipped dashboard is a pure client of one JSON document. In production a
Cloudflare Pages Function serves it from Postgres; here it is baked into
`demo-data.js` and handed to the app by a fetch shim, so the whole thing runs
as flat files with no backend.

The tenant is Calloway Freight, the fictional freight brokerage the dashboard
was designed against — no real customer's data appears anywhere in this demo.

Everything is derived rather than typed in, because the dashboard renders the
relationships and not just the numbers: hours must equal runs x median, the
run-shape rows must add up to the aligned-run count, the two AI arms must
recombine into the family's overall median. Hand-written numbers drift apart
on the first edit; derived ones can't.

    python3 make-data.py > demo-data.js
"""
import json

WINDOW = {"start": "2026-05-12", "through": "2026-07-09", "days": 42}

# ── the procedure catalogue ───────────────────────────────────────────────
# inst/ppl/median/aiPct/ppl-split are the authored facts; every other number
# on the family is computed from them below.
#
# aiFactor is the AI arm's median as a multiple of the family median. The
# plain arm is then solved for, so the two arms recombine to the median the
# table shows. Values above 1.0 are deliberate: the product's own design doc
# insists these reads are descriptive, so some procedures have to come out
# slower with AI, because in real capture some do.
PROCS = [
    dict(
        id="load-building", name="Load building and carrier assignment",
        domain="internal-ops", inst=312, ppl=12, median=78, aiPct=3,
        aiPpl=2, disc="2026-05-12", aiFactor=1.09,
        summary="Dispatch turns each tendered load into a covered one: vetting carriers on DAT One, negotiating the rate by email, and assigning the carrier in McLeod. The highest-hours procedure in operations.",
        cadence=[8, 9, 8, 9, 8, 2, 1],
        appMix=[("McLeod TMS", 38), ("DAT One", 27), ("Outlook", 24), ("Chrome", 7)],
        trunk=[
            ("review-tenders", "Review Tendered Loads", ["McLeod TMS"]),
            ("search-capacity", "Search Available Capacity", ["DAT One", "Chrome"]),
            ("negotiate-rate", "Negotiate the Rate", ["Outlook", "DAT One"]),
            ("assign-dispatch", "Assign and Dispatch", ["McLeod TMS"]),
        ],
        aiSteps={"negotiate-rate": ("chatgpt", "Two dispatchers draft carrier rate emails with ChatGPT, then edit the number by hand before sending.")},
    ),
    dict(
        id="spot-quoting", name="Spot rate quoting",
        domain="quoting", inst=426, ppl=11, median=55, aiPct=14,
        aiPpl=4, disc="2026-05-12", aiFactor=0.81,
        summary="Analysts answer inbound lane quote requests: checking market rate in DAT One, building the number in the rate workbook, and replying by hand. The highest-volume procedure in the company.",
        cadence=[14, 12, 5, 4, 4, 1, 0],
        appMix=[("Outlook", 31), ("DAT One", 26), ("Excel", 24), ("McLeod TMS", 13)],
        trunk=[
            ("pull-request", "Pull the Lane Request", ["Outlook"]),
            ("check-market", "Check Lane History and Market Rate", ["DAT One", "McLeod TMS"]),
            ("build-quote", "Build the Quote", ["Excel"]),
            ("send-log", "Send and Log the Quote", ["Outlook", "McLeod TMS"]),
        ],
        aiSteps={"send-log": ("chatgpt", "ChatGPT drafts the quote email around the finished number for four analysts, which is where most of the time on this step used to go.")},
    ),
    dict(
        id="invoice-audit", name="Customer invoice audit and dispute",
        domain="finance", inst=187, ppl=7, median=100, aiPct=17,
        aiPpl=3, disc="2026-05-15", aiFactor=0.88,
        summary="Billing reconciles flagged invoices line by line against the order and accessorials in McLeod, works the dispute with the customer, and posts the correction in QuickBooks.",
        cadence=[3, 4, 5, 8, 11, 2, 0],
        appMix=[("QuickBooks", 32), ("McLeod TMS", 29), ("Outlook", 22), ("Excel", 12)],
        trunk=[
            ("pull-flagged", "Pull Flagged Invoices", ["QuickBooks"]),
            ("compare-order", "Compare Lines to the Order", ["McLeod TMS", "Excel"]),
            ("work-dispute", "Work the Dispute", ["Outlook"]),
            ("post-correction", "Post the Correction", ["QuickBooks"]),
        ],
        aiSteps={"work-dispute": ("chatgpt", "Three specialists paste the dispute thread into ChatGPT for a history summary before replying, rather than rereading the whole chain.")},
    ),
    dict(
        id="pod-collection", name="Proof-of-delivery collection and billing release",
        domain="documentation", inst=298, ppl=8, median=50, aiPct=0,
        aiPpl=0, disc="2026-05-13", aiFactor=None,
        summary="Operations sweeps carrier portals and the POD inbox for delivery documents, matches each to its order in McLeod, chases what is missing, and releases the order to billing.",
        cadence=[7, 8, 7, 8, 7, 1, 1],
        appMix=[("Chrome", 41), ("McLeod TMS", 33), ("Outlook", 21)],
        trunk=[
            ("sweep-portals", "Sweep Portals and the POD Inbox", ["Chrome", "Outlook"]),
            ("match-order", "Match Each Document to Its Order", ["McLeod TMS"]),
            ("chase-missing", "Chase Missing Documents", ["Outlook"]),
            ("release-billing", "Verify and Release to Billing", ["McLeod TMS"]),
        ],
        aiSteps={},
    ),
    dict(
        id="carrier-invoice-recon", name="Carrier invoice reconciliation",
        domain="finance", inst=143, ppl=5, median=84, aiPct=8,
        aiPpl=2, disc="2026-05-19", aiFactor=0.86,
        summary="Accounts payable matches each incoming carrier invoice to its load and rate confirmation in McLeod, resolves mismatches with the carrier, and stages payment in QuickBooks.",
        cadence=[3, 4, 5, 12, 4, 0, 0],
        appMix=[("Outlook", 29), ("McLeod TMS", 27), ("Excel", 23), ("QuickBooks", 21)],
        trunk=[
            ("pull-invoices", "Pull the Week's Carrier Invoices", ["Outlook"]),
            ("match-rate-con", "Match to Load and Rate Confirmation", ["McLeod TMS"]),
            ("resolve-mismatch", "Resolve Mismatches", ["Outlook", "Excel"]),
            ("stage-payment", "Approve and Stage Payment", ["QuickBooks"]),
        ],
        aiSteps={"resolve-mismatch": ("copilot", "Copilot in Excel writes the mismatch summary two people send back to the carrier.")},
    ),
    dict(
        id="carrier-onboarding", name="Carrier onboarding and compliance check",
        domain="procurement", inst=41, ppl=9, median=140, aiPct=59,
        aiPpl=6, disc="2026-06-02", aiFactor=0.71,
        summary="Onboarding a carrier means collecting the authority, insurance and W-9 packet, verifying safety on FMCSA SAFER, summarizing the documents, and building the profile in McLeod. The most AI-touched procedure in the company.",
        cadence=[2, 0, 4, 1, 3, 0, 1],
        appMix=[("Chrome", 44), ("Outlook", 28), ("McLeod TMS", 22)],
        trunk=[
            ("collect-packet", "Collect the Carrier Packet", ["Outlook"]),
            ("verify-safer", "Verify Authority on FMCSA SAFER", ["Chrome"]),
            ("summarize-docs", "Summarize the Compliance Documents", ["Chrome"]),
            ("build-profile", "Create the Carrier Profile", ["McLeod TMS"]),
            ("activate", "Activate the Carrier", ["McLeod TMS", "Outlook"]),
        ],
        aiSteps={
            "summarize-docs": ("chatgpt", "Six people paste insurance certificates and authority letters into ChatGPT and file the summary it returns. This step is now almost entirely AI-run."),
            "verify-safer": ("chatgpt", "Two people also ask ChatGPT to read the SAFER snapshot back to them rather than scanning the table themselves."),
        },
    ),
    dict(
        id="claims-intake", name="Claims intake and OS&D",
        domain="customer-service", inst=38, ppl=4, median=133, aiPct=50,
        aiPpl=3, disc="2026-06-05", aiFactor=0.79,
        summary="Claims takes in an OS&D or damage report, flags the order in McLeod, gathers photos, PODs and carrier statements by email, and logs the case for resolution.",
        cadence=[1, 3, 0, 2, 4, 1, 0],
        appMix=[("Outlook", 43), ("McLeod TMS", 34), ("Excel", 16), ("Chrome", 7)],
        trunk=[
            ("take-report", "Take the Damage Report In", ["Outlook"]),
            ("flag-order", "Flag the Order and Document It", ["McLeod TMS"]),
            ("gather-proof", "Gather Photos and Statements", ["Outlook", "Chrome"]),
            ("log-case", "Log the Case for Resolution", ["Excel", "McLeod TMS"]),
        ],
        aiSteps={"take-report": ("chatgpt", "Three specialists draft the claim acknowledgement with ChatGPT, which is the part of intake the customer sees first.")},
    ),
    dict(
        id="credit-setup", name="New customer credit setup",
        domain="finance", inst=22, ppl=3, median=112, aiPct=0,
        aiPpl=0, disc="2026-06-16", aiFactor=None,
        summary="Billing receives a credit application from sales, pulls the credit report and trade references, sets terms and a limit in QuickBooks, and activates the customer in McLeod.",
        cadence=[0, 2, 1, 0, 2, 0, 1],
        appMix=[("Chrome", 34), ("QuickBooks", 30), ("Outlook", 24), ("McLeod TMS", 12)],
        trunk=[
            ("receive-app", "Receive the Credit Application", ["Outlook"]),
            ("pull-report", "Pull the Credit Report", ["Chrome"]),
            ("set-terms", "Set Terms and the Credit Limit", ["QuickBooks"]),
            ("activate-customer", "Notify Sales and Activate", ["McLeod TMS", "Outlook"]),
        ],
        aiSteps={},
    ),
    dict(
        id="margin-report", name="Weekly margin report assembly",
        domain="reporting", inst=14, ppl=2, median=207, aiPct=86,
        aiPpl=2, disc="2026-06-09", aiFactor=1.0,
        summary="Pricing exports the week's revenue and cost data from McLeod, loads it into the margin workbook, builds the summary and variance notes, and distributes the report to leadership.",
        cadence=[0, 0, 1, 1, 12, 0, 0],
        appMix=[("Excel", 58), ("McLeod TMS", 27), ("Outlook", 15)],
        trunk=[
            ("export-data", "Export the Week's Revenue Data", ["McLeod TMS"]),
            ("load-workbook", "Load the Extract into the Workbook", ["Excel"]),
            ("build-summary", "Build the Summary and Variance Notes", ["Excel"]),
            ("distribute", "Distribute to Leadership", ["Outlook"]),
        ],
        aiSteps={"build-summary": ("copilot", "Copilot assembles the summary tabs and writes the variance notes. Both people who run this report have used it every week since it was mapped, so there is no meaningful comparison left to draw.")},
    ),
    dict(
        id="track-and-trace", name="Load track-and-trace and status updates",
        domain="customer-service", inst=540, ppl=12, median=22, aiPct=6,
        aiPpl=3, disc="2026-05-12", aiFactor=0.84,
        summary="Dispatch runs check-calls and tracking updates through the day: pulling status from carrier portals and ELD links, updating each load in McLeod, and notifying the customer on exceptions.",
        cadence=[12, 11, 12, 11, 12, 3, 1],
        appMix=[("Chrome", 39), ("McLeod TMS", 34), ("Outlook", 27)],
        trunk=[
            ("pull-status", "Pull Status from Portals and ELD", ["Chrome"]),
            ("update-load", "Update the Load Status and ETA", ["McLeod TMS"]),
            ("flag-exception", "Flag Any Exception or Delay", ["McLeod TMS"]),
            ("notify-customer", "Send the Status Update", ["Outlook"]),
        ],
        aiSteps={"notify-customer": ("copilot", "Copilot in Outlook drafts the exception notice for three dispatchers, who send dozens of these a day.")},
    ),
    dict(
        id="appointment-scheduling", name="Pickup and delivery appointment scheduling",
        domain="communication", inst=318, ppl=9, median=30, aiPct=4,
        aiPpl=2, disc="2026-05-14", aiFactor=0.93,
        summary="Operations books pickup and delivery appointments with shippers and receivers: checking facility hours and dock availability, securing a slot, and writing it back to the load in McLeod.",
        cadence=[9, 8, 9, 8, 8, 2, 0],
        appMix=[("Outlook", 36), ("McLeod TMS", 33), ("Chrome", 31)],
        trunk=[
            ("identify-loads", "Identify Loads Needing Appointments", ["McLeod TMS"]),
            ("check-facility", "Check Hours and Dock Availability", ["Chrome", "Outlook"]),
            ("secure-slot", "Secure the Appointment Window", ["Outlook"]),
            ("record-appt", "Record It Against the Load", ["McLeod TMS"]),
        ],
        aiSteps={"secure-slot": ("copilot", "Copilot drafts the scheduling request for two schedulers when the facility only takes email.")},
    ),
    dict(
        id="rfp-bid", name="Customer RFP and lane bid response",
        domain="quoting", inst=28, ppl=5, median=304, aiPct=22,
        aiPpl=2, disc="2026-06-11", aiFactor=0.9,
        summary="Pricing responds to customer RFP and bid packages: pulling historical lane costs, modeling target rates across dozens of lanes in the bid workbook, and returning the completed pricing file.",
        cadence=[3, 5, 4, 6, 4, 1, 0],
        appMix=[("Excel", 47), ("DAT One", 22), ("McLeod TMS", 18), ("Outlook", 13)],
        trunk=[
            ("parse-rfp", "Parse the Lane List", ["Outlook", "Excel"]),
            ("pull-history", "Pull Historical Cost and Market Rate", ["DAT One", "McLeod TMS"]),
            ("model-rates", "Model Target Rates and Margins", ["Excel"]),
            ("return-file", "Return the Completed Bid File", ["Outlook"]),
        ],
        aiSteps={"parse-rfp": ("claude", "Two analysts hand the RFP attachment to Claude to pull the lane list into a table instead of retyping it.")},
    ),
    dict(
        id="payment-application", name="Customer payment application and collections",
        domain="finance", inst=164, ppl=5, median=69, aiPct=5,
        aiPpl=2, disc="2026-05-21", aiFactor=0.95,
        summary="Billing applies incoming customer payments against open invoices in QuickBooks, researches short-pays and remittance mismatches, and works aging receivables with customers by email.",
        cadence=[4, 5, 6, 7, 5, 1, 0],
        appMix=[("QuickBooks", 41), ("Outlook", 28), ("Excel", 20), ("McLeod TMS", 11)],
        trunk=[
            ("match-remittance", "Match Payments to Open Invoices", ["QuickBooks", "Excel"]),
            ("apply-payments", "Apply Payments and Resolve Short-Pays", ["QuickBooks"]),
            ("research-mismatch", "Research Remittance Mismatches", ["Excel", "McLeod TMS"]),
            ("chase-aging", "Chase Aging Receivables", ["Outlook"]),
        ],
        aiSteps={"chase-aging": ("chatgpt", "Two collectors draft the aging follow-up with ChatGPT rather than rewriting the same note per customer.")},
    ),
    dict(
        id="quick-pay", name="Carrier quick-pay processing",
        domain="finance", inst=96, ppl=4, median=40, aiPct=0,
        aiPpl=0, disc="2026-05-27", aiFactor=None,
        summary="Accounts payable processes carrier quick-pay requests: verifying the load and proof-of-delivery, calculating the quick-pay discount, and staging the accelerated payment in QuickBooks.",
        cadence=[3, 3, 4, 3, 3, 0, 0],
        appMix=[("QuickBooks", 38), ("McLeod TMS", 32), ("Outlook", 30)],
        trunk=[
            ("receive-request", "Receive the Quick-Pay Request", ["Outlook"]),
            ("verify-pod", "Verify the Load and POD", ["McLeod TMS"]),
            ("calc-discount", "Calculate the Discount and Net", ["QuickBooks"]),
            ("stage-accelerated", "Stage the Accelerated Payment", ["QuickBooks"]),
        ],
        aiSteps={},
    ),
    dict(
        id="insurance-renewal", name="Insurance certificate renewal tracking",
        domain="procurement", inst=34, ppl=3, median=67, aiPct=31,
        aiPpl=2, disc="2026-06-13", aiFactor=0.76,
        summary="Compliance tracks expiring carrier insurance certificates, requests renewals before they lapse, and verifies the new certificate meets coverage requirements before reactivating the carrier.",
        cadence=[2, 1, 3, 2, 2, 0, 0],
        appMix=[("Outlook", 40), ("Chrome", 33), ("McLeod TMS", 27)],
        trunk=[
            ("find-expiring", "Identify Expiring Certificates", ["McLeod TMS"]),
            ("request-renewal", "Request the Renewed Certificate", ["Outlook"]),
            ("verify-coverage", "Verify Coverage Limits", ["Chrome"]),
            ("reactivate", "Update the Record and Reactivate", ["McLeod TMS"]),
        ],
        aiSteps={"verify-coverage": ("chatgpt", "Two people check the renewed certificate against the coverage requirement with ChatGPT instead of reading the policy schedule.")},
    ),
    dict(
        id="detention-capture", name="Detention and accessorial capture",
        domain="internal-ops", inst=73, ppl=8, median=58, aiPct=9,
        aiPpl=2, disc="2026-05-30", aiFactor=0.91,
        summary="Operations captures detention and accessorial charges: gathering arrival and departure times and supporting documents, validating the charge against the rate confirmation, and submitting it for billing.",
        cadence=[3, 3, 4, 3, 3, 1, 0],
        appMix=[("McLeod TMS", 37), ("Outlook", 31), ("Chrome", 20), ("Excel", 12)],
        trunk=[
            ("identify-exposure", "Identify Loads with Exposure", ["McLeod TMS"]),
            ("gather-times", "Gather Times and Documents", ["Chrome", "Outlook"]),
            ("validate-charge", "Validate Against the Rate Confirmation", ["McLeod TMS", "Excel"]),
            ("submit-billing", "Submit the Accessorial", ["McLeod TMS"]),
        ],
        aiSteps={"gather-times": ("chatgpt", "Two people summarize the driver and facility email chain with ChatGPT to pull the arrival and departure times out of it.")},
    ),
    dict(
        id="fuel-surcharge", name="Weekly fuel surcharge update",
        domain="reporting", inst=6, ppl=2, median=140, aiPct=33,
        aiPpl=1, disc="2026-06-18", aiFactor=0.85,
        summary="Pricing updates the fuel surcharge schedule each week: pulling the published DOE diesel index, recalculating the table, and publishing the new rates to the team and customers.",
        cadence=[0, 1, 0, 5, 0, 0, 0],
        appMix=[("Excel", 52), ("Chrome", 26), ("Outlook", 22)],
        trunk=[
            ("pull-index", "Pull the DOE Diesel Index", ["Chrome"]),
            ("recalc-table", "Recalculate the Surcharge Table", ["Excel"]),
            ("publish-rates", "Publish the New Rates", ["Outlook"]),
        ],
        aiSteps={},
    ),
]

# ── derivation ────────────────────────────────────────────────────────────


def spread_for(median, i):
    """A run-time distribution around the median.

    Right-skewed, because work is: a run can take four times as long as usual
    but never a quarter as long. The per-family jitter keeps the "how run
    times vary" panel from rendering seventeen identical strips.
    """
    j = 1 + ((i * 7) % 5 - 2) * 0.06
    return {
        "lo": round(median * 0.17, 1),
        "p10": round(median * 0.38 / j, 1),
        "q1": round(median * 0.64, 1),
        "q3": round(median * 1.52 * j, 1),
        "p90": round(median * 2.35 * j, 1),
        "hi": round(median * 4.1 * j, 1),
    }


def scale_cadence(shape, inst):
    """Turn the authored weekday shape into counts that sum to `inst`."""
    total = sum(shape) or 1
    out = [round(v * inst / total) for v in shape]
    # Push the rounding drift onto the busiest weekday, not a quiet one.
    out[out.index(max(out))] += inst - sum(out)
    return out


def app_mix(pairs):
    """Normalize to 100 and fold whatever is left into a single "Other"."""
    total = sum(p for _, p in pairs)
    mix = [{"name": n, "pct": p} for n, p in pairs]
    rest = 100 - total
    if rest >= 2:
        mix.append({"name": "Other", "pct": rest, "other": True})
    elif rest:
        mix[0]["pct"] += rest
    return mix


def run_shapes(p, aligned):
    """The distinct paths runs actually took through the trunk.

    Shipped as counts that visibly add up to the aligned-run total: the
    diagram's whole argument is that the shapes account for every run, so a
    remainder that doesn't reconcile would undercut it.
    """
    ids = [t[0] for t in p["trunk"]]
    names = [t[1] for t in p["trunk"]]
    n = len(ids)
    cand = [
        list(range(n)),                                   # the full path
        list(range(n - 1)),                               # stopped short
        [0] + list(range(2, n)),                          # skipped a step
        [0, n - 1],                                       # straight through
    ]
    weights = [0.38, 0.19, 0.13, 0.09]
    out = []
    for picks, w in zip(cand, weights):
        runs = round(aligned * w)
        if runs < 2 or len(picks) < 2:
            continue
        out.append({
            "steps": [names[k] for k in picks],
            "stepIds": [ids[k] for k in picks],
            "runs": runs,
        })
    return out, aligned - sum(s["runs"] for s in out)


def build(p, i):
    inst, median = p["inst"], p["median"]
    ai_runs = round(inst * p["aiPct"] / 100)
    plain_runs = inst - ai_runs
    has_ai = ai_runs > 0

    # Solve the plain arm so the two arms recombine to the family median.
    # Without this the drill-in would contradict the table one row above it.
    if has_ai and plain_runs > 0 and p["aiFactor"]:
        ai_med = median * p["aiFactor"]
        plain_med = (inst * median - ai_runs * ai_med) / plain_runs
    elif has_ai and p["aiFactor"]:
        ai_med, plain_med = median * p["aiFactor"], None
    else:
        ai_med = plain_med = None

    hours = round(inst * median / 60, 1)
    trunk_ids = [t[0] for t in p["trunk"]]
    shapes, remainder = run_shapes(p, inst)

    # Spread the family's AI runs over the steps that actually show AI. The
    # first listed step is the primary one and takes nearly all of them; a
    # second step is a minority habit. These overlap by design, since one run
    # can reach for AI twice.
    ai_steps = {}
    for k, (sid, (tool, usage)) in enumerate(p["aiSteps"].items()):
        share = 1.0 if k == 0 else 0.35
        ai_steps[sid] = {"runs": max(2, round(ai_runs * share)), "tool": tool,
                         "usage": usage}

    # Time is not spread evenly across a procedure: the middle of a workflow
    # is where the work is, so weight the interior steps and let the bookends
    # be short. Weights are normalized against the family median.
    n = len(p["trunk"])
    weights = [1.0 if k in (0, n - 1) else 1.9 for k in range(n)]
    wsum = sum(weights)

    phases = []
    for k, (sid, name, systems) in enumerate(p["trunk"]):
        step_med = median * weights[k] / wsum
        st = ai_steps.get(sid)
        step_ai_n = st["runs"] if st else 0
        step_plain_n = inst - step_ai_n
        ph = {
            "text": name,
            "sec": round(step_med * 60, 1),
            "runs": inst if k < n - 1 else round(inst * 0.93),
            "aiPct": round(step_ai_n / inst * 100) if inst else 0,
            "promptN": round(step_ai_n * 2.4) if st else 0,
            "aiMin": round(step_med * p["aiFactor"], 1) if st and p["aiFactor"] else None,
            "plainMin": round(step_med, 1) if st else None,
            "aiToolMin": round(step_med * 0.34, 1) if st else None,
            "aiN": step_ai_n or None,
            "plainN": step_plain_n if st else None,
            "aiPpl": p["aiPpl"] if st else None,
            "plainPpl": p["ppl"] - (p["aiPpl"] if plain_runs else 0) if st else None,
            "systems": systems,
            "aiHow": {"usage": st["usage"]} if st else None,
        }
        phases.append(ph)

    return {
        "id": p["id"], "name": p["name"], "summary": p["summary"],
        "inst": inst, "ppl": p["ppl"], "median": round(median, 1), "hours": hours,
        "ai": p["aiPct"], "hasAi": has_ai, "aiPpl": p["aiPpl"],
        "domain": p["domain"], "steps": n, "trunked": True, "disc": p["disc"],
        "cadence": scale_cadence(p["cadence"], inst),
        "spread": spread_for(median, i),
        "apps": [m["name"] for m in app_mix(p["appMix"]) if not m.get("other")],
        "appMix": app_mix(p["appMix"]),
        "aiMedMin": round(ai_med, 1) if ai_med else None,
        "plainMedMin": round(plain_med, 1) if plain_med else None,
        "aiRunN": ai_runs, "plainRunN": plain_runs,
        "aiPplN": p["aiPpl"] or None,
        "plainPplN": (p["ppl"] - p["aiPpl"] + (1 if p["aiPpl"] else 0)) if plain_runs else None,
        "aiToolMedMin": round(median * 0.28, 1) if has_ai else None,
        "aiHours": round(ai_runs * (ai_med or 0) / 60, 1) if has_ai else 0,
        "totalHours": hours,
        "phases": phases,
        "trunk": [{"id": s, "name": nm, "systems": sy, "core": k < 3}
                  for k, (s, nm, sy) in enumerate(p["trunk"])],
        "alignedRuns": inst,
        "coverage": {sid: 100 - (k * 7) % 26 for k, sid in enumerate(trunk_ids)},
        "branches": [],
        "shapes": shapes, "shapesRemainder": remainder,
        "aiSteps": ai_steps or None,
    }


# ── the long tail ─────────────────────────────────────────────────────────
# The dashboard splits families at 0.9 hours: above the line is a mapped
# procedure with a dossier, below it is an activity that happened a couple of
# times and is reported as such. Leaving the tail out would misrepresent the
# pipeline, which finds far more one-offs than procedures, and would leave the
# "infrequent activities" panel with nothing to open.
TAIL = [
    ("Setting up a new user in McLeod", "it-operations", 3, 2, 12),
    ("Filing a cargo insurance claim with the underwriter", "customer-service", 2, 1, 21),
    ("Reconciling the corporate card statement", "finance", 2, 1, 18),
    ("Updating the customer contact list", "documentation", 4, 3, 7),
    ("Onboarding a new dispatcher", "hr", 2, 2, 16),
    ("Running the quarterly carrier scorecard", "reporting", 1, 1, 33),
    ("Renewing a lane contract with a shipper", "quoting", 3, 2, 11),
    ("Registering a new customer in the load board", "internal-ops", 3, 2, 9),
    ("Correcting a mis-keyed bill of lading", "documentation", 4, 3, 6),
    ("Requesting a W-9 from a new vendor", "procurement", 2, 2, 8),
    ("Escalating a stuck load to the account manager", "communication", 5, 4, 5),
    ("Pulling a driver history for a safety review", "internal-ops", 2, 1, 14),
    ("Archiving closed claim files", "documentation", 2, 1, 13),
    ("Adjusting a customer's credit hold", "finance", 3, 2, 8),
    ("Booking a hotel for a driver on a stranded load", "internal-ops", 1, 1, 19),
]


def build_tail(name, domain, inst, ppl, median, i):
    """A tail family: counted honestly, but never claimed to be a procedure.

    No trunk and `trunked: false`, so nothing downstream tries to draw a
    diagram of two observations.
    """
    return {
        "id": "tail-%02d" % i, "name": name, "summary": "", "domain": domain,
        "inst": inst, "ppl": ppl, "median": float(median),
        "hours": round(inst * median / 60, 1),
        "ai": 0, "hasAi": False, "aiPpl": 0, "steps": 0, "trunked": False,
        "disc": "2026-06-2%d" % (i % 10),
        "cadence": scale_cadence([2, 2, 2, 2, 2, 0, 0], inst),
        "spread": spread_for(median, i), "apps": [], "appMix": [],
        "aiMedMin": None, "plainMedMin": None, "aiRunN": 0, "plainRunN": inst,
        "aiPplN": None, "plainPplN": ppl, "aiToolMedMin": None,
        "aiHours": 0, "totalHours": round(inst * median / 60, 1),
        "phases": [], "trunk": None, "alignedRuns": 0, "coverage": None,
        "branches": [], "shapes": [], "shapesRemainder": 0, "aiSteps": None,
    }


WORKFLOWS = sorted(
    [build(p, i) for i, p in enumerate(PROCS)]
    + [build_tail(*t, i) for i, t in enumerate(TAIL)],
    key=lambda w: -w["hours"])

TOTAL_RUNS = sum(w["inst"] for w in WORKFLOWS)
TOTAL_AI_RUNS = sum(w["aiRunN"] for w in WORKFLOWS)
TOTAL_HOURS = round(sum(w["hours"] for w in WORKFLOWS))

# ── the AI registry ───────────────────────────────────────────────────────
# Hours are the observed time inside each tool, which is a fraction of the
# procedure time those runs occupy: people work in their systems and step
# into the AI tool for one part of a step.
AI_TOOLS = [
    {"key": "chatgpt", "name": "ChatGPT", "via": "OpenAI · in the browser",
     "people": 11, "moments": 1842, "hours": 27.4,
     "apps": ["Chrome", "Edge"], "lastSeen": "2026-07-09"},
    {"key": "copilot", "name": "Microsoft Copilot", "via": "Built into Microsoft 365",
     "people": 7, "moments": 946, "hours": 14.8,
     "apps": ["Outlook", "Excel", "Word"], "lastSeen": "2026-07-09"},
    {"key": "claude", "name": "Claude", "via": "Anthropic · in the browser",
     "people": 3, "moments": 214, "hours": 4.6,
     "apps": ["Chrome"], "lastSeen": "2026-07-08"},
    {"key": "gemini", "name": "Gemini", "via": "Google · in the browser",
     "people": 2, "moments": 71, "hours": 1.3,
     "apps": ["Chrome"], "lastSeen": "2026-07-01"},
]


def daily_series():
    """Minutes spent in AI tools per calendar day across the window.

    Weekends are zero and adoption trends up over the window, because both
    are true of the thing being drawn and a flat random walk would read as
    noise rather than as a workforce picking a tool up.
    """
    import datetime as dt
    d0 = dt.date.fromisoformat(WINDOW["start"])
    d1 = dt.date.fromisoformat(WINDOW["through"])
    out, d, i = [], d0, 0
    while d <= d1:
        if d.weekday() >= 5:
            v = 0
        else:
            # The weekend zeroes already comb the line, so day-to-day wobble
            # stays shallow: past about +/-12% the ramp disappears into the
            # teeth and the sparkline reads as noise instead of as adoption.
            ramp = 26 + i * 1.55
            wobble = [1.0, 1.09, 0.93, 1.05, 0.96, 1.11, 0.9][i % 7]
            v = round(ramp * wobble)
        out.append({"d": d.isoformat(), "v": v})
        d += dt.timedelta(days=1)
        i += 1
    return out


PAYLOAD = {
    "customer": "Calloway Freight",
    "window": WINDOW,
    "kpis": {
        "people": 29,
        "runs": TOTAL_RUNS,
        "aiRuns": TOTAL_AI_RUNS,
        "aiSharePct": round(TOTAL_AI_RUNS / TOTAL_RUNS * 100),
        "workflows": len(WORKFLOWS),
        "hoursObserved": TOTAL_HOURS,
        "devicesActive": 31,
        "devicesTotal": 34,
        "moments": 704318,
    },
    "teams": [{"name": "All employees", "people": 29}],
    "feed": {
        "day": "2026-07-09",
        "items": [
            {"cat": "Most active workflow", "dot": "good",
             "goto": "workflows", "wf": "track-and-trace",
             "html": "<b>Load track-and-trace and status updates</b> · 19 runs by 8 people · above its usual 9 to 15 a day"},
            {"cat": "New procedures", "dot": "good",
             "goto": "workflows", "wf": "fuel-surcharge",
             "html": "New procedure mapped: <b>Weekly fuel surcharge update</b> · 6 runs"},
            {"cat": "New procedures", "dot": "good",
             "goto": "workflows", "wf": "insurance-renewal",
             "html": "New procedure mapped: <b>Insurance certificate renewal tracking</b> · 34 runs"},
            {"cat": "AI firsts", "dot": "steel",
             "goto": "workflows", "wf": "rfp-bid",
             "html": "AI observed inside <b>Customer RFP and lane bid response</b> for the first time"},
            {"cat": "AI firsts", "dot": "steel",
             "goto": "workflows", "wf": "detention-capture",
             "html": "AI observed inside <b>Detention and accessorial capture</b> for the first time"},
            {"cat": "Activity", "dot": "warn",
             "goto": "workflows", "wf": "spot-quoting",
             "html": "<b>Spot rate quoting</b>: 4 runs, below its usual 8 to 16 a day · 2 days running"},
            {"cat": "Activity", "dot": "good",
             "goto": "workflows", "wf": "carrier-invoice-recon",
             "html": "<b>Carrier invoice reconciliation</b>: 14 runs, above its usual 2 to 6 a day"},
            {"cat": "Activity", "dot": "mist",
             "html": "Every other procedure ran within its usual daily range"},
        ],
    },
    "workflows": WORKFLOWS,
    "ai": {
        "people": 14,
        "devices": 16,
        "tools": AI_TOOLS,
        "categories": [
            {"name": "Document drafting & email", "pct": 36},
            {"name": "Lookup & verification", "pct": 24},
            {"name": "Summarizing records", "pct": 18},
            {"name": "Data & spreadsheet work", "pct": 14},
            {"name": "Other", "pct": 8},
        ],
        "prompts": [
            {"provider": "openai", "n": 1842, "people": 11},
            {"provider": "microsoft", "n": 946, "people": 7},
            {"provider": "anthropic", "n": 214, "people": 3},
            {"provider": "google", "n": 71, "people": 2},
        ],
        "daily": daily_series(),
    },
}

if __name__ == "__main__":
    print("/* Generated by make-data.py — do not edit by hand. */")
    print("window.__UNPAK_DEMO__ = " + json.dumps(PAYLOAD, indent=1) + ";")
