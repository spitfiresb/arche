// Mock Electron backend for the static UI preview.
// Installs window.electronAPI with fake data so every page renders without
// an Electron main process / Supabase connection.

(() => {
    'use strict';

    // ────────────────────────────────────────────
    // Fixture data
    // ────────────────────────────────────────────

    const USER_PROFILE = {
        id: 'u_morgan',
        name: 'John Doe',
        full_name: 'John Doe',
        email: 'john@acme.co',
        role: 'admin',
        department: 'Engineering',
        department_id: 'd_eng',
        company_name: 'Acme Inc.',
    };

    const DEPARTMENTS = [
        { id: 'd_eng',    name: 'Engineering' },
        { id: 'd_prod',   name: 'Product' },
        { id: 'd_des',    name: 'Design' },
        { id: 'd_data',   name: 'Data Science' },
        { id: 'd_mkt',    name: 'Marketing' },
        { id: 'd_sales',  name: 'Sales' },
    ];

    // Deterministic "random" so charts stay stable between reloads
    function seeded(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 0xffffffff;
        };
    }
    const rand = seeded(42);

    function dailyHistoryFor(baseAvg, days = 30, seed = 1) {
        const r = seeded(seed);
        const out = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const jitter = (r() - 0.5) * baseAvg * 0.6;
            const value = Math.max(0, Math.round(baseAvg + jitter - (isWeekend ? baseAvg * 0.55 : 0)));
            out.push({ date: d.toISOString(), count: value, average: value });
        }
        return out;
    }

    const EMPLOYEES = [
        { id: 'u_priya',  name: 'Priya Raman',      email: 'priya@acme.co',  department: 'Engineering',   department_id: 'd_eng',   promptCount: 342, critical_count: 1, medium_count: 3, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_diego',  name: 'Diego Alvarez',    email: 'diego@acme.co',  department: 'Engineering',   department_id: 'd_eng',   promptCount: 287, critical_count: 0, medium_count: 2, topModel: 'chatgpt', topProvider: 'openai' },
        { id: 'u_noa',    name: 'Noa Bergman',      email: 'noa@acme.co',    department: 'Product',       department_id: 'd_prod',  promptCount: 218, critical_count: 0, medium_count: 1, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_kenji',  name: 'Kenji Watanabe',   email: 'kenji@acme.co',  department: 'Data Science',  department_id: 'd_data',  promptCount: 194, critical_count: 0, medium_count: 1, topModel: 'gemini',  topProvider: 'google' },
        { id: 'u_sara',   name: 'Sara Lindqvist',   email: 'sara@acme.co',   department: 'Design',        department_id: 'd_des',   promptCount: 176, critical_count: 0, medium_count: 1, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_malik',  name: 'Malik Johnson',    email: 'malik@acme.co',  department: 'Engineering',   department_id: 'd_eng',   promptCount: 158, critical_count: 1, medium_count: 0, topModel: 'chatgpt', topProvider: 'openai' },
        { id: 'u_aditi',  name: 'Aditi Chaudhary',  email: 'aditi@acme.co',  department: 'Marketing',     department_id: 'd_mkt',   promptCount: 142, critical_count: 0, medium_count: 1, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_leo',    name: 'Leo Schulte',      email: 'leo@acme.co',    department: 'Engineering',   department_id: 'd_eng',   promptCount: 131, critical_count: 0, medium_count: 0, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_hana',   name: 'Hana Park',        email: 'hana@acme.co',   department: 'Product',       department_id: 'd_prod',  promptCount: 118, critical_count: 0, medium_count: 0, topModel: 'gemini',  topProvider: 'google' },
        { id: 'u_tomas',  name: 'Tomás Ribeiro',    email: 'tomas@acme.co',  department: 'Sales',         department_id: 'd_sales', promptCount: 94,  critical_count: 0, medium_count: 0, topModel: 'chatgpt', topProvider: 'openai' },
        { id: 'u_emma',   name: 'Emma Novak',       email: 'emma@acme.co',   department: 'Design',        department_id: 'd_des',   promptCount: 82,  critical_count: 0, medium_count: 0, topModel: 'claude',  topProvider: 'anthropic' },
        { id: 'u_rashid', name: 'Rashid Haidari',   email: 'rashid@acme.co', department: 'Engineering',   department_id: 'd_eng',   promptCount: 76,  critical_count: 0, medium_count: 0, topModel: 'cursor',  topProvider: 'cursor' },
    ];
    // Sparse flag history: mostly quiet days with the occasional security event,
    // scaled so employees with more recorded flags produce more events.
    function dailyFlagHistoryFor(totalFlags, days = 30, seed = 1) {
        const r = seeded(seed);
        const out = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const chance = Math.min(0.4, (totalFlags + 1) * 0.06);
            const count = r() < chance ? (r() < 0.2 ? 2 : 1) : 0;
            out.push({ date: d.toISOString(), count });
        }
        return out;
    }

    EMPLOYEES.forEach((e, idx) => {
        e.dailyHistory = dailyHistoryFor(e.promptCount / 30, 30, idx + 11);
        e.dailyFlagHistory = dailyFlagHistoryFor((e.critical_count || 0) + (e.medium_count || 0), 30, idx + 51);
    });

    const CATEGORIES = {
        total: 1917,
        categories: [
            {
                name: 'Code Generation', percentage: 34,
                subcategories: [
                    { name: 'New features',   percentage: 38 },
                    { name: 'Boilerplate',    percentage: 22 },
                    { name: 'Tests',          percentage: 18 },
                    { name: 'Refactors',      percentage: 15 },
                    { name: 'Build scripts',  percentage: 7 },
                ]
            },
            {
                name: 'Research & Analysis', percentage: 22,
                subcategories: [
                    { name: 'Explain concept', percentage: 42 },
                    { name: 'Compare options', percentage: 28 },
                    { name: 'Summarize docs',  percentage: 20 },
                    { name: 'Market research', percentage: 10 },
                ]
            },
            {
                name: 'Writing & Editing', percentage: 18,
                subcategories: [
                    { name: 'Emails',     percentage: 35 },
                    { name: 'Docs',       percentage: 30 },
                    { name: 'Copy',       percentage: 20 },
                    { name: 'Specs',      percentage: 15 },
                ]
            },
            {
                name: 'Data & SQL', percentage: 14,
                subcategories: [
                    { name: 'SQL queries',   percentage: 50 },
                    { name: 'Transformations', percentage: 30 },
                    { name: 'Visualization', percentage: 20 },
                ]
            },
            {
                name: 'Debugging', percentage: 8,
                subcategories: [
                    { name: 'Stack traces', percentage: 55 },
                    { name: 'Reproduce bug', percentage: 30 },
                    { name: 'Fix proposal', percentage: 15 },
                ]
            },
            {
                name: 'Other', percentage: 4,
                subcategories: [
                    { name: 'General Q&A',   percentage: 60 },
                    { name: 'Brainstorming', percentage: 40 },
                ]
            },
        ]
    };

    const DASHBOARD_STATS = {
        totalPrompts: CATEGORIES.total,
        dailyAverage: 42,
        dailyHistory: dailyHistoryFor(42, 14, 7),
        riskEvents: 8,
        topProvider: 'anthropic',
        topProviderPct: 44,
        providerBreakdown: [
            { provider: 'anthropic', percentage: 44 },
            { provider: 'openai',    percentage: 31 },
            { provider: 'google',    percentage: 14 },
            { provider: 'cursor',    percentage: 7 },
            { provider: 'microsoft', percentage: 4 },
        ],
    };

    // Security flags
    const now = Date.now();
    const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();
    const SECURITY_FLAGS = [
        { id: 'f1',  type: 'PII Detected',        userName: 'Diego Alvarez',    userEmail: 'diego@acme.co',  department: 'Engineering', createdAt: hoursAgo(3),    filename: 'customer-list.csv',             source: 'chatgpt', model: 'gpt-5',             agentProvider: 'chatgpt', mainCategory: 'PII',      subcategory: 'Email',  hasFileContent: true,  description: '27 customer rows with emails pasted into ChatGPT' },
        { id: 'f2',  type: 'Source Code',         userName: 'Priya Raman',      userEmail: 'priya@acme.co',  department: 'Engineering', createdAt: hoursAgo(5),    filename: 'auth/session.ts',               source: 'claude',  model: 'claude-sonnet-4-6', agentProvider: 'claude',  mainCategory: 'Source',   subcategory: 'Auth',   hasFileContent: true,  description: 'Session handling module shared with external model' },
        { id: 'f3',  type: 'Internal Doc',        userName: 'Noa Bergman',      userEmail: 'noa@acme.co',    department: 'Product',     createdAt: hoursAgo(20),   filename: 'q2-roadmap-draft.md',           source: 'chatgpt', model: 'gpt-5',             agentProvider: 'chatgpt', mainCategory: 'Docs',     subcategory: 'Roadmap', hasFileContent: true, description: 'Draft roadmap shared for rewriting' },
        { id: 'f4',  type: 'PII Detected',        userName: 'Kenji Watanabe',   userEmail: 'kenji@acme.co',  department: 'Data Science',createdAt: hoursAgo(27),   filename: null,                             source: 'gemini',  model: 'gemini-2.5',        agentProvider: 'gemini',  mainCategory: 'PII',      subcategory: 'SSN-like', hasFileContent: false, description: '4 rows with SSN-looking patterns' },
        { id: 'f5',  type: 'Secret Detected',     userName: 'Malik Johnson',    userEmail: 'malik@acme.co',  department: 'Engineering', createdAt: hoursAgo(42),   filename: '.env',                           source: 'claude',  model: 'claude-opus-4-7',   agentProvider: 'claude',  mainCategory: 'Secret',   subcategory: 'API Key',  hasFileContent: true,  description: 'Local .env with Stripe + AWS keys' },
        { id: 'f6',  type: 'Source Code',         userName: 'Sara Lindqvist',   userEmail: 'sara@acme.co',   department: 'Design',      createdAt: hoursAgo(44),   filename: 'components/Billing.jsx',        source: 'chatgpt', model: 'gpt-5',             agentProvider: 'chatgpt', mainCategory: 'Source',   subcategory: 'Frontend', hasFileContent: true, description: 'Billing widget markup pasted for UI tweak' },
        { id: 'f7',  type: 'Internal Doc',        userName: 'Aditi Chaudhary',  userEmail: 'aditi@acme.co',  department: 'Marketing',   createdAt: hoursAgo(70),   filename: 'launch-brief-v3.md',            source: 'claude',  model: 'claude-sonnet-4-6', agentProvider: 'claude',  mainCategory: 'Docs',     subcategory: 'Launch',   hasFileContent: true, description: 'Draft brief for rewrites + tone edits' },
        { id: 'f8',  type: 'PII Detected',        userName: 'Leo Schulte',      userEmail: 'leo@acme.co',    department: 'Engineering', createdAt: hoursAgo(75),   filename: null,                             source: 'gemini',  model: 'gemini-2.5',        agentProvider: 'gemini',  mainCategory: 'PII',      subcategory: 'Phone',    hasFileContent: false, description: 'Phone numbers pasted from contact list' },
    ];

    // File contents behind flagged incidents (all values are obviously fake)
    const FLAG_FILES = {
        f1: {
            filename: 'customer-list.csv',
            text: [
                'customer_id,name,email,plan,mrr,signup_date',
                'C-1041,Harriet Blum,harriet.blum@example.com,Growth,499,2025-11-03',
                'C-1042,Owen Castillo,owen.c@example.com,Starter,99,2025-11-08',
                'C-1043,Mina Okafor,mina.okafor@example.com,Growth,499,2025-11-12',
                'C-1044,Jonas Feld,jonas.feld@example.com,Enterprise,2400,2025-12-01',
                'C-1045,Petra Novotna,petra.n@example.com,Starter,99,2025-12-04',
                'C-1046,Ravi Menon,ravi.menon@example.com,Growth,499,2026-01-15',
                'C-1047,Lucia Ferraro,lucia.f@example.com,Enterprise,1800,2026-01-22',
                'C-1048,Theo Brandt,theo.brandt@example.com,Starter,99,2026-02-02',
                'C-1049,Amara Diallo,amara.d@example.com,Growth,499,2026-02-10',
                'C-1050,Felix Wong,felix.wong@example.com,Enterprise,3200,2026-03-01',
            ].join('\n'),
        },
        f2: {
            filename: 'auth/session.ts',
            text: `import { randomBytes, createHmac } from 'crypto';
import { db } from '../db/client';

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

export interface Session {
    id: string;
    userId: string;
    issuedAt: number;
    expiresAt: number;
}

export async function createSession(userId: string): Promise<Session> {
    const id = randomBytes(32).toString('hex');
    const now = Date.now();
    const session: Session = { id, userId, issuedAt: now, expiresAt: now + SESSION_TTL_MS };
    await db.sessions.insert(session);
    return session;
}

export function signSessionCookie(sessionId: string, secret: string): string {
    const sig = createHmac('sha256', secret).update(sessionId).digest('base64url');
    return sessionId + '.' + sig;
}

export async function validateSession(cookie: string, secret: string): Promise<Session | null> {
    const [id, sig] = cookie.split('.');
    if (!id || !sig) return null;
    const expected = createHmac('sha256', secret).update(id).digest('base64url');
    if (sig !== expected) return null;
    const session = await db.sessions.findById(id);
    if (!session || session.expiresAt < Date.now()) return null;
    return session;
}
`,
        },
        f3: {
            filename: 'q2-roadmap-draft.md',
            text: `# Q2 Product Roadmap (DRAFT — internal only)

## Themes
1. **Enterprise readiness** — SSO/SAML, audit log export, data residency (EU)
2. **Insight depth** — conversation-level analytics, benchmark comparisons
3. **Time to value** — self-serve onboarding under 10 minutes

## Committed
- SAML SSO (Okta, Azure AD) — eng started, target May 15
- Audit log export API — design review Apr 28
- Departmental benchmarks — data model complete

## Stretch
- Slack digest of weekly usage highlights
- Custom risk-policy builder (currently behind sales-led setup)

## Not doing this quarter
- On-prem deployment (revisit Q4)
- Mobile app

_Last edited by Noa — do not circulate outside product._
`,
        },
        f5: {
            filename: '.env',
            text: `# local development — DO NOT COMMIT
DATABASE_URL=postgres://app:hunter2@localhost:5432/acme_dev
STRIPE_SECRET_KEY=sk_test_FAKEFAKEFAKE51Hb2mKxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_FAKE00000000000000000000000000
AWS_ACCESS_KEY_ID=AKIAFAKEFAKEFAKEFAKE
AWS_SECRET_ACCESS_KEY=FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake
SENDGRID_API_KEY=SG.FAKEFAKEFAKE.FAKEFAKEFAKEFAKEFAKEFAKE
JWT_SIGNING_SECRET=dev-only-not-for-prod-9f8e7d6c
REDIS_URL=redis://localhost:6379/0
`,
        },
        f6: {
            filename: 'components/Billing.jsx',
            text: `import { useState } from 'react';
import { usePlan } from '../hooks/usePlan';
import { formatCurrency } from '../utils/format';

export default function Billing() {
    const { plan, invoices, updateCard } = usePlan();
    const [editing, setEditing] = useState(false);

    return (
        <section className="billing-panel">
            <header>
                <h2>Billing</h2>
                <span className="plan-badge">{plan.name}</span>
            </header>

            <div className="plan-summary">
                <p>{formatCurrency(plan.priceMonthly)} / month</p>
                <p className="muted">Renews {plan.renewalDate}</p>
                <button onClick={() => setEditing(true)}>Update payment method</button>
            </div>

            <table className="invoice-table">
                <thead>
                    <tr><th>Date</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                    {invoices.map(inv => (
                        <tr key={inv.id}>
                            <td>{inv.date}</td>
                            <td>{formatCurrency(inv.amount)}</td>
                            <td>{inv.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
`,
        },
        f7: {
            filename: 'launch-brief-v3.md',
            text: `# Launch Brief — Insights 2.0 (v3)

**Launch date:** target June 4 (gated on enterprise beta feedback)
**Owner:** Aditi C. | **Status:** draft for tone review

## Positioning
One dashboard that shows leaders *how* their teams actually use AI —
not just how much. Depth over vanity metrics.

## Key messages
- See every AI tool in one place, sanctioned or shadow
- Understand engagement styles, not just prompt counts
- Catch risky data sharing before it becomes an incident

## Channels
| Channel | Asset | Owner |
|---|---|---|
| Blog | Launch post + customer story | Aditi |
| Email | 3-part nurture to trial signups | Marco |
| LinkedIn | Founder thread + product clips | Sam |

## Open questions
- Do we name the two lighthouse customers? (waiting on legal)
- Pricing page update ships same day or a week later?
`,
        },
    };

    // Build per-user prompt fixtures (for myUsage + employeeDetail)
    const CATEGORY_NAMES = ['debugging code', 'writing email', 'creating presentation', 'researching topic', 'explaining concept', 'analyzing data', 'writing content', 'refactoring code'];
    const SOURCES = ['claude', 'chatgpt', 'cursor', 'gemini'];

    function promptsForEmployee(emp, count) {
        const r = seeded(emp.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
        const prompts = [];
        for (let i = 0; i < count; i++) {
            const daysAgo = Math.floor(r() * 365);
            const d = new Date(); d.setDate(d.getDate() - daysAgo);
            const hours = Math.floor(r() * 9 + 8); // 8am-5pm
            d.setHours(hours, Math.floor(r() * 60), 0, 0);
            prompts.push({
                id: `${emp.id}_p${i}`,
                user_id: emp.id,
                category: CATEGORY_NAMES[Math.floor(r() * CATEGORY_NAMES.length)],
                source: SOURCES[Math.floor(r() * SOURCES.length)],
                model: emp.topModel,
                createdAt: d.toISOString(),
                timestamp: d.toISOString(),
                isSubmitted: r() > 0.25,
            });
        }
        return prompts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // getModelStats returns source × provider × model × count aggregated rows
    function buildModelStats() {
        const out = [];
        const samples = [
            { source: 'desktop',   agent_provider: 'claude',    model: 'Claude Sonnet 4.6',       count: 420 },
            { source: 'desktop',   agent_provider: 'claude',    model: 'Claude Opus 4.7',         count: 140 },
            { source: 'desktop',   agent_provider: 'claude',    model: 'Claude Haiku 4.5',        count: 70 },
            { source: 'desktop',   agent_provider: 'claude-code', model: 'Claude Sonnet 4.6',     count: 180 },
            { source: 'extension', agent_provider: 'chatgpt',   model: 'GPT-5',                   count: 380 },
            { source: 'extension', agent_provider: 'chatgpt',   model: 'GPT-5-mini',              count: 120 },
            { source: 'extension', agent_provider: 'chatgpt',   model: 'o3',                      count: 60 },
            { source: 'extension', agent_provider: 'gemini',    model: 'Gemini 2.5 Pro',          count: 180 },
            { source: 'extension', agent_provider: 'gemini',    model: 'Gemini 2.5 Flash',        count: 80 },
            { source: 'extension', agent_provider: 'perplexity', model: 'Sonar Large',            count: 55 },
            { source: 'extension', agent_provider: 'copilot',   model: 'GPT-5',                   count: 70 },
            { source: 'extension', agent_provider: 'copilot-word', model: 'GPT-5',                count: 25 },
            { source: 'extension', agent_provider: 'copilot-excel', model: 'GPT-5',               count: 18 },
            { source: 'cli',       agent_provider: 'cursor',    model: 'Claude Sonnet 4.6',       count: 130 },
            { source: 'cli',       agent_provider: 'cursor',    model: 'GPT-5',                   count: 45 },
            { source: 'desktop',   agent_provider: 'grok',      model: 'Grok 3',                  count: 15 },
        ];
        return samples;
    }
    const MODEL_STATS = buildModelStats();

    const SANCTIONED_APPS = [
        { name: 'claude',     display: 'Claude',     status: 'sanctioned' },
        { name: 'claude-code', display: 'Claude Code', status: 'sanctioned' },
        { name: 'chatgpt',    display: 'ChatGPT',    status: 'sanctioned' },
        { name: 'gemini',     display: 'Gemini',     status: 'sanctioned' },
        { name: 'copilot',    display: 'Copilot',    status: 'sanctioned' },
        { name: 'cursor',     display: 'Cursor',     status: 'sanctioned' },
        { name: 'perplexity', display: 'Perplexity', status: 'shadow' },
        { name: 'grok',       display: 'Grok',       status: 'shadow' },
        { name: 'deepseek',   display: 'DeepSeek',   status: 'blocked' },
    ];

    // ────────────────────────────────────────────
    // Date-range filtering helpers
    // Fixture histories span the last 30 days; a requested range selects the
    // matching slice and counts are derived from (or scaled to) that slice.
    // ────────────────────────────────────────────
    function parseDate(d) {
        if (!d) return null;
        const t = new Date(d);
        return isNaN(t.getTime()) ? null : t;
    }

    function filterHistory(hist, start, end) {
        if (!hist) return [];
        if (!start && !end) return hist;
        return hist.filter(pt => {
            const t = new Date(pt.date);
            return (!start || t >= start) && (!end || t <= end);
        });
    }

    // Fraction of the 30-day fixture window covered by the requested range
    function fracForRange(startDate, endDate) {
        const start = parseDate(startDate);
        const end = parseDate(endDate);
        if (!start && !end) return 1;
        const now = new Date();
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() - 29);
        windowStart.setHours(0, 0, 0, 0);
        const s = start && start > windowStart ? start : windowStart;
        const e = end && end < now ? end : now;
        const days = Math.max(0, (e - s) / 86400000);
        return Math.max(0, Math.min(1, days / 29));
    }

    function employeesForRange(startDate, endDate) {
        const start = parseDate(startDate);
        const end = parseDate(endDate);
        if (!start && !end) return EMPLOYEES;
        return EMPLOYEES.map(e => {
            const dh = filterHistory(e.dailyHistory, start, end);
            const dfh = filterHistory(e.dailyFlagHistory, start, end);
            const frac = e.dailyHistory.length ? dh.length / e.dailyHistory.length : 1;
            return {
                ...e,
                promptCount: dh.reduce((s, p) => s + (p.count || 0), 0),
                critical_count: Math.round((e.critical_count || 0) * frac),
                medium_count: Math.round((e.medium_count || 0) * frac),
                dailyHistory: dh,
                dailyFlagHistory: dfh,
            };
        });
    }

    function securityFlagsForRange(startDate, endDate) {
        const start = parseDate(startDate);
        const end = parseDate(endDate);
        if (!start && !end) return SECURITY_FLAGS;
        return SECURITY_FLAGS.filter(f => {
            const t = new Date(f.createdAt);
            return (!start || t >= start) && (!end || t <= end);
        });
    }

    function dashboardStatsForRange(startDate, endDate) {
        const start = parseDate(startDate);
        const end = parseDate(endDate);
        const frac = fracForRange(startDate, endDate);
        return {
            ...DASHBOARD_STATS,
            totalPrompts: Math.round(DASHBOARD_STATS.totalPrompts * frac),
            riskEvents: securityFlagsForRange(startDate, endDate).length,
            dailyHistory: filterHistory(DASHBOARD_STATS.dailyHistory, start, end),
        };
    }

    function categoriesForRange(startDate, endDate) {
        const frac = fracForRange(startDate, endDate);
        if (frac >= 1) return CATEGORIES;
        return { ...CATEGORIES, total: Math.round(CATEGORIES.total * frac) };
    }

    function modelStatsForRange(startDate, endDate) {
        const frac = fracForRange(startDate, endDate);
        if (frac >= 1) return MODEL_STATS;
        return MODEL_STATS
            .map(row => ({ ...row, count: Math.round(row.count * frac) }))
            .filter(row => row.count > 0);
    }

    // ────────────────────────────────────────────
    // Session-scoped selected employee (for drill-down)
    // ────────────────────────────────────────────
    function setSelectedEmployee(emp) {
        try { sessionStorage.setItem('__mockSelectedEmployee', JSON.stringify(emp)); } catch (e) {}
    }
    function getSelectedEmployee() {
        try { return JSON.parse(sessionStorage.getItem('__mockSelectedEmployee') || 'null'); }
        catch (e) { return null; }
    }

    // ────────────────────────────────────────────
    // Navigation map — IPC targets → HTML paths
    // ────────────────────────────────────────────
    const NAV_MAP = {
        dashboard:            '../dashboard/index.html',
        index:                '../dashboard/index.html',
        managerDashboard:     '../dashboard/index.html',
        teamOverview:         '../team/teamOverview.html',
        teamManagement:       '../team/teamManagement.html',
        securityCenter:       '../securityDashboard/securityCenter.html',
        myUsage:              '../employees/myUsage.html',
        employeeDetail:       '../employees/employeeDetail.html',
        modelBreakdown:       '../modelBreakdown/modelBreakdown.html',
        workflows:            '../workflows/index.html',
        adminDashboard:       '../admin/admin.html',
        adminTeamManagement:  '../admin/adminTeamManagement.html',
        managerOverview:      '../admin/managerOverview.html',
        invite:               '../invite/inviteWelcome.html',
        login:                '../auth/login.html',
    };

    function navigateTo(target) {
        const path = NAV_MAP[target];
        if (path) window.location.href = path;
        else console.warn('[mockBackend] Unknown nav target:', target);
    }

    // ────────────────────────────────────────────
    // Install window.electronAPI
    // ────────────────────────────────────────────

    const noopSubscriber = () => () => {};

    const api = {
        platform: 'darwin',

        // Profile
        getUserProfile:      async () => USER_PROFILE,
        refreshUserProfile:  async () => USER_PROFILE,

        // Dashboard / stats — all honor { startDate, endDate } (or positional dates)
        getDashboardSummary: async (opts = {}) => ({
            dashboardStats: dashboardStatsForRange(opts.startDate, opts.endDate),
            categories:     categoriesForRange(opts.startDate, opts.endDate),
            employees:      employeesForRange(opts.startDate, opts.endDate),
        }),
        getDashboardStats:   async (_deptId, startDate, endDate) => dashboardStatsForRange(startDate, endDate),
        getCategories:       async (opts = {}) => categoriesForRange(opts.startDate, opts.endDate),
        getEmployees:        async (opts) => {
            if (opts && typeof opts === 'object') return employeesForRange(opts.startDate, opts.endDate);
            return EMPLOYEES;
        },
        getModelStats:       async (_deptId, startDate, endDate) => modelStatsForRange(startDate, endDate),
        getWorkflowsCount:   async () => ({ count: 128 }),
        getWorkflowsList:    async () => [],
        getWorkflowInsights: async () => {
            // 8 weekly stream periods with per-category counts (deterministic)
            const catNames = ['Software Development', 'Data & Analytics', 'Communication', 'Marketing & Content', 'Operations', 'General Information'];
            const baseline = { 'Software Development': 62, 'Data & Analytics': 34, 'Communication': 26, 'Marketing & Content': 18, 'Operations': 12, 'General Information': 8 };
            const r = seeded(77);
            const streamPeriods = [];
            for (let w = 0; w < 8; w++) {
                const counts = {};
                let total = 0;
                for (const c of catNames) {
                    const trend = c === 'Software Development' ? 1 + w * 0.05
                        : c === 'Data & Analytics' ? 1 + w * 0.03 : 1;
                    const v = Math.max(2, Math.round(baseline[c] * trend * (0.8 + r() * 0.4)));
                    counts[c] = v;
                    total += v;
                }
                streamPeriods.push({ label: `W${w + 1}`, counts, total });
            }
            return {
                totalConversations: 1195,
                insights: [
                    { type: 'positive', icon: 'check_circle', headline: 'Strong collaboration on code', metric: '4.2', detail: 'Engineering teams average 4.2 back-and-forth turns per coding conversation — well above the org baseline of 2.8.' },
                    { type: 'positive', icon: 'trending_up', headline: 'Exploration rising in Research', metric: '+34%', detail: 'Research-mode conversations are up 34% this week as the team investigates the new observability stack.' },
                    { type: 'attention', icon: 'warning', headline: 'Copy-paste delegation spike', metric: '68%', detail: 'Marketing shows 68% delegation mode (goal: below 50%) — many single-turn "write X" prompts without iteration.' },
                    { type: 'attention', icon: 'schedule', headline: 'Long unresolved threads in Ops', metric: '11', detail: '11 operations conversations exceeded 20 turns without a clear resolution — possible tooling gap.' },
                    { type: 'info', icon: 'smart_toy', headline: 'Claude Sonnet dominant for code', metric: '62%', detail: '62% of all software development conversations go to Claude Sonnet across Engineering.' },
                    { type: 'info', icon: 'hub', headline: 'Cross-team prompt reuse', metric: '19', detail: '19 prompt patterns are now shared between Engineering and Data — up from 7 last month.' },
                    { type: 'info', icon: 'bolt', headline: 'Fastest growing category', metric: 'Data', detail: 'Data & Analytics conversations grew 28% over the last four weeks, driven by the SQL migration.' },
                ],
                categories: [
                    { main_category: 'Software Development', count: 412, pct: 34, avgDepth: 4.2,
                      cognitive: { delegation: 80, collaboration: 210, consultation: 78, exploration: 44 },
                      archetypes: [{ name: 'Iterative refactoring' }, { name: 'Test-first prompting' }, { name: 'Spec-to-code' }],
                      subcategories: [{ name: 'New features', count: 156 }, { name: 'Refactors', count: 98 }, { name: 'Tests', count: 74 }, { name: 'Debugging', count: 52 }, { name: 'Build scripts', count: 32 }] },
                    { main_category: 'Data & Analytics', count: 264, pct: 22, avgDepth: 3.6,
                      cognitive: { delegation: 62, collaboration: 96, consultation: 70, exploration: 36 },
                      archetypes: [{ name: 'Query iteration' }, { name: 'Result validation' }],
                      subcategories: [{ name: 'SQL queries', count: 132 }, { name: 'Transformations', count: 79 }, { name: 'Visualization', count: 53 }] },
                    { main_category: 'Communication', count: 216, pct: 18, avgDepth: 2.4,
                      cognitive: { delegation: 118, collaboration: 54, consultation: 30, exploration: 14 },
                      archetypes: [{ name: 'Draft-and-polish' }, { name: 'Tone adjustment' }],
                      subcategories: [{ name: 'Emails', count: 76 }, { name: 'Docs', count: 64 }, { name: 'Copy', count: 43 }, { name: 'Specs', count: 33 }] },
                    { main_category: 'Marketing & Content', count: 145, pct: 12, avgDepth: 2.9,
                      cognitive: { delegation: 74, collaboration: 38, consultation: 22, exploration: 11 },
                      archetypes: [{ name: 'Campaign brainstorm' }, { name: 'A/B copy variants' }],
                      subcategories: [{ name: 'Launch briefs', count: 52 }, { name: 'Social posts', count: 48 }, { name: 'Blog drafts', count: 45 }] },
                    { main_category: 'Operations', count: 96, pct: 8, avgDepth: 3.1,
                      cognitive: { delegation: 28, collaboration: 34, consultation: 24, exploration: 10 },
                      archetypes: [{ name: 'Process documentation' }],
                      subcategories: [{ name: 'Runbooks', count: 41 }, { name: 'Vendor research', count: 30 }, { name: 'Scheduling', count: 25 }] },
                    { main_category: 'General Information', count: 62, pct: 5, avgDepth: 1.8,
                      cognitive: { delegation: 20, collaboration: 12, consultation: 22, exploration: 8 },
                      archetypes: [{ name: 'Quick lookups' }],
                      subcategories: [{ name: 'Explain concept', count: 38 }, { name: 'Compare options', count: 24 }] },
                ],
                streamPeriods,
                cognitive: { delegation: 382, collaboration: 444, consultation: 246, exploration: 123 },
            };
        },
        getBloomAnalytics:   async () => {
            // Build 8 weekly periods ending this week
            const now = new Date();
            const periods = [];
            const r = seeded(99);
            for (let w = 7; w >= 0; w--) {
                const start = new Date(now); start.setDate(start.getDate() - w * 7 - 6);
                const end   = new Date(now); end.setDate(end.getDate() - w * 7);
                const delegation    = Math.floor(15 + r() * 20);
                const collaboration = Math.floor(20 + r() * 30);
                const consultation  = Math.floor(14 + r() * 18);
                const exploration   = Math.floor(8  + r() * 12);
                const total = delegation + collaboration + consultation + exploration;
                periods.push({
                    label: `W${8 - w}`,
                    start: start.toISOString(), end: end.toISOString(),
                    delegation, collaboration, consultation, exploration, total,
                });
            }
            const totalClassified = periods.reduce((s, p) => s + p.total, 0);
            return { periods, sufficient: true, totalClassified, bucketType: 'weekly' };
        },

        // Prompts
        getPrompts: async ({ limit } = {}) => {
            const all = EMPLOYEES.flatMap(e => promptsForEmployee(e, 20)).filter(p => p.user_id === USER_PROFILE.id);
            const mine = promptsForEmployee(USER_PROFILE, 500);
            return mine.slice(0, limit || 2000);
        },
        getEmployeePrompts: async (employeeId) => {
            const emp = EMPLOYEES.find(e => e.id === employeeId) || EMPLOYEES[0];
            return promptsForEmployee(emp, Math.max(80, emp.promptCount));
        },

        // Security
        getSecurityFlags:           async (opts = {}) => securityFlagsForRange(opts.startDate, opts.endDate),
        getSecurityFlagFileContent: async (flagId) => {
            const f = FLAG_FILES[flagId];
            if (!f) return { fileContent: null };
            // UTF-8-safe base64 (plain btoa chokes on em dashes etc.)
            const utf8 = new TextEncoder().encode(f.text);
            let bin = '';
            for (const byte of utf8) bin += String.fromCharCode(byte);
            return { filename: f.filename, fileContent: btoa(bin) };
        },

        // Departments / admin
        getDepartments:     async () => DEPARTMENTS,
        getAdminTeams:      async () => DEPARTMENTS.map(d => ({ ...d, memberCount: EMPLOYEES.filter(e => e.department_id === d.id).length })),
        updateDepartment:   async () => ({ success: true }),
        getShadowAi:        async () => ({ shadow: SANCTIONED_APPS.filter(a => a.status === 'shadow'), total: 124, distinctUsers: 6 }),
        getEnforcementStatus: async () => ({ enabled: false, mode: 'monitor' }),
        getAccessRequests:  async () => [],
        resolveAccessRequest: async () => ({ success: true }),
        setEnforcement:     async () => ({ success: true }),
        getSanctionedApps:  async () => ({ apps: SANCTIONED_APPS }),
        updateSanctionedApp: async () => ({ success: true }),

        // Invites
        getInviteInfo:      async () => null,
        getPendingInvite:   async () => null,
        clearPendingInvite: async () => ({}),
        createInvite:       async () => ({ token: 'MOCK-TOKEN', url: '#' }),
        createManagerInvite: async () => ({ token: 'MOCK-TOKEN', url: '#' }),
        redeemInvite:       async () => ({ success: true }),

        // Employee selection for drill-down
        setSelectedEmployee: async (emp) => { setSelectedEmployee(emp); return { success: true }; },
        getSelectedEmployee: async () => getSelectedEmployee(),

        // Navigation
        navigateTo,
        openExternal:    (url) => window.open(url, '_blank'),
        openUrlInBrowser: async (_id, url) => window.open(url, '_blank'),
        openUrlInChrome:  async (url)     => window.open(url, '_blank'),

        // Event subscriptions — no-ops (nothing is captured in a static mock)
        onPromptCaptured:       noopSubscriber,
        onScraperError:         noopSubscriber,
        onExtensionWarning:     noopSubscriber,
        onShowInAppNotification: noopSubscriber,
        onInviteTokenReceived:  noopSubscriber,
    };

    window.electronAPI = api;

    // The shared utils code checks for `electronAPI.platform !== 'darwin'` to
    // shift the logo for Windows. Keep the mac default so traffic-light spacing
    // isn't double-applied.
})();
