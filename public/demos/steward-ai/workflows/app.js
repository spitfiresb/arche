// AI Engagement (Bloom Taxonomy) Analytics Page

// ============================================
// Constants
// ============================================

const BLOOM_COLORS = {
    delegation:    '#c2a894',  // tan
    collaboration: '#4d6159',  // sage (primary)
    consultation:  '#7d8c82',  // medium sage
    exploration:   '#5e503f',  // dark umber
};
const BLOOM_LABELS = {
    delegation: 'Delegation', collaboration: 'Collaboration',
    consultation: 'Consultation', exploration: 'Exploration',
};
const BLOOM_DESCRIPTIONS = {
    delegation: 'AI executes instructions',
    collaboration: 'Iterative co-creation',
    consultation: 'Seeking advice or diagnosis',
    exploration: 'Learning and research',
};
const BLOOM_DETAILS = {
    delegation: 'The user gives the AI a clear task with specific instructions and expects it to execute. The human defines what needs to be done and how; the AI carries out the work. Examples include generating code from a spec, writing a report, translating text, or filling in a template — any workflow where the human is directing and the AI is doing.',
    collaboration: 'The user and AI work together iteratively, going back and forth to co-create an outcome. Both sides contribute ideas and refine the output over multiple turns. Examples include brainstorming sessions, iterative design work, pair-programming, or drafting a document together with rounds of feedback.',
    consultation: 'The user seeks the AI\'s expertise for advice, diagnosis, or a second opinion. The human has a specific problem or question and wants the AI\'s informed perspective before deciding what to do. Examples include debugging sessions, architecture reviews, "what do you think about this approach?" questions, or asking for best-practice recommendations.',
    exploration: 'The user is learning, researching, or trying to understand something new. The primary goal is knowledge acquisition rather than producing a specific deliverable. Examples include asking "how does X work?", comparing technologies, reading through documentation with the AI as a guide, or open-ended research deep-dives.',
};
// Stack order bottom-to-top: delegation at bottom (largest band)
const BLOOM_LEVELS = ['delegation', 'collaboration', 'consultation', 'exploration'];

let dateFilterInstance = null;
let currentChartMode = sessionStorage.getItem('workflowChartMode') || 'lines';
let cachedPeriods = null;

// ============================================
// Lifecycle
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    // Initialize shared date filter (shared across both tabs)
    if (window.DateFilter && !document.getElementById('circularDateFilter')) {
        dateFilterInstance = DateFilter.init({
            mountId: 'date-filter-mount',
            storageKey: 'dashboardDateFilter',
            onFilterChange: () => {
                if (window.reloadCurrentTab) window.reloadCurrentTab();
            },
        });
        // Expose for brief.js
        window.workflowDateFilter = dateFilterInstance;
    }

    // Tab system calls loadBloomAnalytics lazily — don't auto-fire
});

// ============================================
// Data Loading
// ============================================

async function loadBloomAnalytics() {
    if (!window.electronAPI) return;

    // Read dates from DateFilter instance
    let startDate = null;
    let endDate = null;
    if (dateFilterInstance) {
        const state = dateFilterInstance.getState();
        startDate = state.startDate;
        endDate = state.endDate;
    }

    // Read department context
    let departmentId = null;
    try {
        const ctx = sessionStorage.getItem('viewingDepartmentContext');
        if (ctx) departmentId = JSON.parse(ctx).departmentId || null;
    } catch (e) { /* ignore */ }

    try {
        const result = await window.electronAPI.getBloomAnalytics({
            departmentId, startDate, endDate
        });
        renderPage(result);
    } catch (e) {
        console.error('Failed to load bloom analytics:', e);
        const chartArea = document.getElementById('bloomChartArea');
        if (chartArea) {
            chartArea.innerHTML = '<p class="text-sm text-slate-400 italic">Failed to load data</p>';
        }
    }
}

// ============================================
// Rendering
// ============================================

function renderPage(data) {
    const chartArea = document.getElementById('bloomChartArea');
    const subtitleEl = document.getElementById('chartSubtitle');
    const summaryEl = document.getElementById('summaryCards');
    if (!chartArea) return;

    // No data
    if (!data || !data.periods || data.periods.length === 0) {
        chartArea.innerHTML = '<p class="text-sm text-slate-300 italic">No classified conversations yet</p>';
        if (subtitleEl) subtitleEl.textContent = '';
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }

    // Insufficient data — building state
    if (!data.sufficient) {
        const n = data.totalClassified || 0;
        const pct = Math.min(Math.round((n / 10) * 100), 100);
        chartArea.innerHTML = `
            <div class="w-full max-w-md mx-auto text-center">
                <div class="mb-6">
                    <span class="material-symbols-outlined text-5xl text-slate-200">insights</span>
                </div>
                <p class="text-base text-slate-500 mb-2 font-medium">Building your AI engagement profile</p>
                <p class="text-sm text-slate-400 mb-6">We need at least 10 classified conversations to show trends.</p>
                <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div class="h-full bg-primary/50 rounded-full transition-all duration-700" style="width: ${pct}%"></div>
                </div>
                <p class="text-xs text-slate-400">${n} of 10 conversations classified</p>
            </div>`;
        if (subtitleEl) subtitleEl.textContent = 'Gathering data';
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }

    // Sufficient data — render chart + summary
    if (subtitleEl) subtitleEl.textContent = `${data.bucketType === 'weekly' ? 'Weekly' : 'Monthly'} distribution`;
    renderBloomChart(chartArea, data.periods);
    renderSummaryCards(summaryEl, data);

    // Show toggle only when multiple periods
    const toggleEl = document.getElementById('chartModeToggle');
    if (toggleEl) {
        if (data.periods.length >= 2) {
            renderChartModeToggle(toggleEl);
        } else {
            toggleEl.innerHTML = '';
        }
    }
}

function renderBloomChart(container, periods) {
    cachedPeriods = periods;

    if (periods.length < 2) {
        container.innerHTML = renderBloomSinglePeriod(periods[0]);
        return;
    }

    if (currentChartMode === 'lines') {
        renderBloomLineChart(container, periods);
    } else {
        renderBloomFlowChart(container, periods);
    }
}

function renderBloomFlowChart(container, periods) {
    const n = periods.length;
    const W = 800;
    const H = 260;
    const padLeft = 36;
    const padRight = 4;
    const padTop = 12;
    const padBottom = 28;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    // Compute 100% stacked percentages
    const stacked = periods.map(p => {
        const t = p.total || 1;
        const vals = {};
        let cumulative = 0;
        for (const level of BLOOM_LEVELS) {
            const pct = (p[level] || 0) / t;
            vals[level] = { start: cumulative, end: cumulative + pct };
            cumulative += pct;
        }
        return vals;
    });

    const xStep = chartW / (n - 1);
    function getX(i) { return padLeft + i * xStep; }
    function getY(val) { return padTop + chartH * (1 - val); }

    const nodeW = 7; // width of each node column
    const halfNode = nodeW / 2;

    // --- Grid lines at 25% intervals ---
    let gridLines = '';
    for (const pct of [0, 0.25, 0.5, 0.75, 1.0]) {
        const y = getY(pct);
        gridLines += `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
    }

    // --- Y-axis labels ---
    let yLabels = '';
    for (const pct of [0, 0.25, 0.5, 0.75, 1.0]) {
        const y = getY(pct);
        const label = Math.round(pct * 100) + '%';
        yLabels += `<text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" fill="#94a3b8" font-size="9" font-family="Inter, sans-serif">${label}</text>`;
    }

    // --- Ribbons between adjacent periods ---
    let ribbons = '';
    for (let i = 0; i < n - 1; i++) {
        const x1 = getX(i) + halfNode;
        const x2 = getX(i + 1) - halfNode;
        const dx = x2 - x1;

        for (const level of BLOOM_LEVELS) {
            const lt = getY(stacked[i][level].end);
            const lb = getY(stacked[i][level].start);
            const rt = getY(stacked[i + 1][level].end);
            const rb = getY(stacked[i + 1][level].start);

            ribbons += `<path d="M ${x1},${lt} C ${x1 + dx / 2},${lt} ${x2 - dx / 2},${rt} ${x2},${rt} L ${x2},${rb} C ${x2 - dx / 2},${rb} ${x1 + dx / 2},${lb} ${x1},${lb} Z" fill="${BLOOM_COLORS[level]}" opacity="0.65"/>`;
        }
    }

    // --- Node columns (thin stacked bars at each time point) ---
    let nodes = '';
    for (let i = 0; i < n; i++) {
        const cx = getX(i);
        for (const level of BLOOM_LEVELS) {
            const yTop = getY(stacked[i][level].end);
            const yBot = getY(stacked[i][level].start);
            const h = yBot - yTop;
            if (h < 0.5) continue;
            nodes += `<rect x="${cx - halfNode}" y="${yTop}" width="${nodeW}" height="${h}" rx="1.5" fill="${BLOOM_COLORS[level]}"/>`;
        }
    }

    // --- X-axis labels ---
    const maxLabels = Math.min(7, n);
    const labelStep = Math.max(1, Math.floor((n - 1) / (maxLabels - 1)));
    let xLabels = '';
    for (let i = 0; i < n; i += labelStep) {
        const x = getX(i);
        const anchor = i === 0 ? 'start' : (i + labelStep >= n ? 'end' : 'middle');
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="${anchor}" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${periods[i].label}</text>`;
    }
    // Always include last label
    if ((n - 1) % labelStep !== 0) {
        const x = getX(n - 1);
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="end" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${periods[n - 1].label}</text>`;
    }

    container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
            ${gridLines}
            ${yLabels}
            ${ribbons}
            ${nodes}
            ${xLabels}
        </svg>`;
}

function renderBloomLineChart(container, periods) {
    const n = periods.length;
    const W = 800;
    const H = 260;
    const padLeft = 36;
    const padRight = 4;
    const padTop = 12;
    const padBottom = 28;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const xStep = chartW / (n - 1);
    function getX(i) { return padLeft + i * xStep; }

    // Dynamic y-scale: find the max percentage across all levels/periods, add headroom
    let maxPct = 0;
    for (const p of periods) {
        const t = p.total || 1;
        for (const level of BLOOM_LEVELS) {
            maxPct = Math.max(maxPct, (p[level] || 0) / t);
        }
    }
    // Add ~15% headroom, then snap up to a clean tick value (multiples of 5%)
    const rawCeil = maxPct * 1.15;
    const tickStep = rawCeil <= 0.15 ? 0.05 : rawCeil <= 0.4 ? 0.1 : rawCeil <= 0.6 ? 0.15 : 0.25;
    const yMax = Math.min(1, Math.ceil(rawCeil / tickStep) * tickStep);
    const numTicks = Math.round(yMax / tickStep);

    function getY(val) { return padTop + chartH * (1 - val / yMax); }

    const uid = 'bloomLine_' + Date.now();

    // Gradients
    let defs = '';
    for (const level of BLOOM_LEVELS) {
        defs += `
            <linearGradient id="${uid}_${level}" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="${BLOOM_COLORS[level]}" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="${BLOOM_COLORS[level]}" stop-opacity="0"/>
            </linearGradient>`;
    }

    // Grid lines + Y-axis labels at dynamic ticks
    let gridLines = '';
    let yLabels = '';
    for (let t = 0; t <= numTicks; t++) {
        const val = t * tickStep;
        const y = getY(val);
        gridLines += `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
        yLabels += `<text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" fill="#94a3b8" font-size="9" font-family="Inter, sans-serif">${Math.round(val * 100)}%</text>`;
    }

    // Lines, areas, and dots for each level
    let areas = '';
    let lines = '';
    let dots = '';
    for (const level of BLOOM_LEVELS) {
        const coords = periods.map((p, i) => {
            const pct = (p[level] || 0) / (p.total || 1);
            return { x: getX(i), y: getY(pct) };
        });

        // Build linear path
        let linePath = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
        for (let i = 1; i < coords.length; i++) {
            linePath += ` L${coords[i].x.toFixed(2)},${coords[i].y.toFixed(2)}`;
        }

        // Area fill path
        const bottomY = getY(0);
        const areaPath = `${linePath} L${coords[n - 1].x.toFixed(2)},${bottomY} L${coords[0].x.toFixed(2)},${bottomY} Z`;

        areas += `<path d="${areaPath}" fill="url(#${uid}_${level})"/>`;
        lines += `<path d="${linePath}" fill="none" stroke="${BLOOM_COLORS[level]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

        for (const c of coords) {
            dots += `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2.5" fill="${BLOOM_COLORS[level]}" stroke="white" stroke-width="1.5"/>`;
        }
    }

    // X-axis labels
    const maxLabels = Math.min(7, n);
    const labelStep = Math.max(1, Math.floor((n - 1) / (maxLabels - 1)));
    let xLabels = '';
    for (let i = 0; i < n; i += labelStep) {
        const x = getX(i);
        const anchor = i === 0 ? 'start' : (i + labelStep >= n ? 'end' : 'middle');
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="${anchor}" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${periods[i].label}</text>`;
    }
    if ((n - 1) % labelStep !== 0) {
        const x = getX(n - 1);
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="end" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${periods[n - 1].label}</text>`;
    }

    container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
            <defs>${defs}</defs>
            ${gridLines}
            ${yLabels}
            ${areas}
            ${lines}
            ${dots}
            ${xLabels}
        </svg>`;
}

function renderChartModeToggle(container) {
    const modes = [
        { key: 'flow', label: 'Flow' },
        { key: 'lines', label: 'Lines' },
    ];

    container.innerHTML = `
        <div class="flex flex-col items-center gap-1">
            <span class="text-[10px] text-slate-400 uppercase tracking-widest">Chart type</span>
            <div class="relative flex bg-slate-100 rounded-full p-0.5">
                <div id="chartModePill" class="absolute rounded-full bg-white shadow-sm transition-all duration-300"></div>
                ${modes.map(m => `
                    <button data-mode="${m.key}" class="chart-mode-btn relative z-10 text-xs font-medium px-3 py-1 rounded-full transition-colors duration-200 ${currentChartMode === m.key ? 'text-ink' : 'text-slate-400'}">
                        ${m.label}
                    </button>
                `).join('')}
            </div>
        </div>`;

    const pill = container.querySelector('#chartModePill');
    const buttons = container.querySelectorAll('.chart-mode-btn');

    function positionPill(animate) {
        const activeBtn = container.querySelector(`.chart-mode-btn[data-mode="${currentChartMode}"]`);
        if (!activeBtn) return;
        if (!animate) pill.style.transition = 'none';
        pill.style.left = activeBtn.offsetLeft + 'px';
        pill.style.top = activeBtn.offsetTop + 'px';
        pill.style.width = activeBtn.offsetWidth + 'px';
        pill.style.height = activeBtn.offsetHeight + 'px';
        if (!animate) {
            pill.offsetHeight; // reflow
            pill.style.transition = '';
        }
    }

    requestAnimationFrame(() => positionPill(false));

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === currentChartMode) return;
            currentChartMode = mode;
            sessionStorage.setItem('workflowChartMode', mode);

            // Update active styles
            buttons.forEach(b => {
                b.classList.toggle('text-ink', b.dataset.mode === mode);
                b.classList.toggle('text-slate-400', b.dataset.mode !== mode);
            });
            positionPill(true);

            // Re-render chart from cache
            if (cachedPeriods) {
                const chartArea = document.getElementById('bloomChartArea');
                if (chartArea) renderBloomChart(chartArea, cachedPeriods);
            }
        });
    });
}

function renderBloomSinglePeriod(period) {
    const t = period.total || 1;
    let html = '<div class="w-full max-w-md mx-auto space-y-3">';
    for (const level of BLOOM_LEVELS) {
        const pct = Math.round(((period[level] || 0) / t) * 100);
        if (pct === 0) continue;
        html += `
            <div class="flex items-center gap-3">
                <span class="text-xs text-slate-500 w-24 text-right font-medium">${BLOOM_LABELS[level]}</span>
                <div class="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${BLOOM_COLORS[level]}"></div>
                </div>
                <span class="text-xs text-slate-500 w-10 font-medium">${pct}%</span>
            </div>`;
    }
    html += '</div>';
    return html;
}


function renderSummaryCards(container, data) {
    if (!container || !data.periods) return;

    // Aggregate totals across all periods
    const totals = { delegation: 0, collaboration: 0, consultation: 0, exploration: 0 };
    let grandTotal = 0;
    for (const p of data.periods) {
        for (const level of BLOOM_LEVELS) {
            totals[level] += (p[level] || 0);
        }
        grandTotal += (p.total || 0);
    }

    container.innerHTML = BLOOM_LEVELS.map(level => {
        const count = totals[level];
        const pct = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0;
        return `
            <div class="bg-white p-6 rounded-xl shadow-clay-sm border border-slate-100">
                <div class="flex items-center gap-2 mb-3">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${BLOOM_COLORS[level]}"></span>
                    <h3 class="text-sm font-semibold text-slate-700 flex-1">${BLOOM_LABELS[level]}</h3>
                    <button onclick="showBloomDetail('${level}')" class="flex items-center justify-center w-5 h-5 rounded-full text-slate-300 hover:text-sage-600 hover:bg-sage-100 transition-all" title="Learn more about ${BLOOM_LABELS[level]}">
                        <span class="material-symbols-outlined" style="font-size: 16px;">info</span>
                    </button>
                </div>
                <p class="text-3xl font-light tracking-tight text-slate-900 mb-1">${pct}%</p>
                <p class="text-[10px] text-slate-400 uppercase tracking-widest">${BLOOM_DESCRIPTIONS[level]}</p>
                <p class="text-xs text-slate-400 mt-2">${count.toLocaleString()} conversations</p>
            </div>`;
    }).join('');
}

// ============================================
// Navigation
// ============================================

function navigateBack() {
    const referrer = sessionStorage.getItem('navigationReferrer');
    sessionStorage.removeItem('navigationReferrer');

    if (referrer === 'adminDashboard') {
        navigateWithTransition('adminDashboard', '../admin/admin.html', 'back');
    } else {
        navigateWithTransition('dashboard', '../dashboard/index.html', 'back');
    }
}

window.navigateBack = navigateBack;

// ============================================
// Bloom Detail Modal
// ============================================

function showBloomDetail(level) {
    // Remove existing modal if any
    dismissBloomDetail();

    const overlay = document.createElement('div');
    overlay.id = 'bloomDetailOverlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center';
    overlay.style.animation = 'bloomFadeIn 0.15s ease-out';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-ink/20 backdrop-blur-sm" onclick="dismissBloomDetail()"></div>
        <div class="relative bg-white rounded-xl shadow-clay border border-slate-100 max-w-md w-full mx-6 p-8" style="animation: bloomSlideIn 0.15s ease-out">
            <button onclick="dismissBloomDetail()" class="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all">
                <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
            </button>
            <div class="flex items-center gap-3 mb-4">
                <span class="w-4 h-4 rounded-full" style="background-color: ${BLOOM_COLORS[level]}"></span>
                <h3 class="font-display italic text-xl text-ink">${BLOOM_LABELS[level]}</h3>
            </div>
            <p class="text-[10px] text-slate-400 uppercase tracking-widest mb-4">${BLOOM_DESCRIPTIONS[level]}</p>
            <p class="text-sm text-slate-600 leading-relaxed">${BLOOM_DETAILS[level]}</p>
        </div>`;

    // Inject keyframe animations if not present
    if (!document.getElementById('bloomDetailStyles')) {
        const style = document.createElement('style');
        style.id = 'bloomDetailStyles';
        style.textContent = `
            @keyframes bloomFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes bloomSlideIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
}

function dismissBloomDetail() {
    const overlay = document.getElementById('bloomDetailOverlay');
    if (overlay) overlay.remove();
}

window.showBloomDetail = showBloomDetail;
window.dismissBloomDetail = dismissBloomDetail;
