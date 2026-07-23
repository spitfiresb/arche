// Team Leaderboard & Risk Overview - New Design

let currentEmployees = [];
let teamPollInterval = null;
let teamDateFilter = { preset: 'all', startDate: null, endDate: null };
let currentPage = 1;
const ITEMS_PER_PAGE = 9;

// Sorting state
let currentSortColumn = 'prompts'; // 'prompts' | 'flags'
let currentSortDirection = 'desc'; // 'desc' | 'asc'
let lastSummarySignature = null;
let lastTableSignature = null;

// Model colors
const modelColors = {
    'claude': '#4d6159',
    'chatgpt': '#c2a894',
    'cursor': '#5e503f',
    'antigravity': '#7d8c82',
    'claude-code': '#3b4d44',
    'copilot': '#d9d2c5',
    'perplexity': '#b0c4bd',
    'gemini': '#8b7355',
    'grok': '#1a1a2e',
    'notebooklm': '#6b8f71',
    'z.ai': '#8c7a6b',
    'deepseek': '#5b7a8c',
    'other': '#a8a29e'
};

const modelDisplayNames = {
    'claude': 'Claude',
    'claude-code': 'Claude Code',
    'chatgpt': 'ChatGPT',
    'cursor': 'Cursor',
    'antigravity': 'Antigravity',
    'copilot': 'Copilot',
    'perplexity': 'Perplexity',
    'gemini': 'Gemini',
    'grok': 'Grok',
    'notebooklm': 'NotebookLM',
    'z.ai': 'Z.ai',
    'deepseek': 'DeepSeek',
    'other': 'Other'
};

// ──────────────────────────────────────────────
// Utils & Helpers
// ──────────────────────────────────────────────

function getStatusDot(status) {
    if (status === 'flagged') return '<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>';
    if (status === 'inactive') return '<span class="h-1.5 w-1.5 rounded-full bg-gray-300"></span>';
    return '<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>';
}

function getTopModelDisplay(emp) {
    const topModelKey = (emp.topModel || '').toLowerCase();
    const name = modelDisplayNames[topModelKey] || (emp.topModel ? emp.topModel.charAt(0).toUpperCase() + emp.topModel.slice(1) : 'None');
    const color = modelColors[topModelKey] || modelColors.other;
    return { name, color };
}

function encodeEmployee(emp) {
    return btoa(encodeURIComponent(JSON.stringify(emp)));
}

// ──────────────────────────────────────────────
// SVG Generation (Sparklines & Area Charts)
// ──────────────────────────────────────────────



// Generate simple sparkline path for table rows
function generateSparklinePath(points, width, height) {
    if (!points || points.length < 2) return `M0,${height / 2} L${width},${height / 2}`;

    const maxVal = Math.max(...points) || 1;
    const stepX = width / (points.length - 1);

    const coords = points.map((p, i) => ({
        x: i * stepX,
        y: height - (p / maxVal) * height
    }));

    let d = `M${coords[0].x},${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
        d += ` L${coords[i].x},${coords[i].y}`;
    }
    return d;
}

// ──────────────────────────────────────────────
// Sort & Navigation Logic
// ──────────────────────────────────────────────

function sortEmployees(employees) {
    const sorted = [...employees];
    sorted.sort((a, b) => {
        let valA, valB;

        if (currentSortColumn === 'prompts') {
            valA = (a.promptCount || 0);
            valB = (b.promptCount || 0);
        } else if (currentSortColumn === 'flags') {
            valA = (a.critical_count || 0) + (a.medium_count || 0);
            valB = (b.critical_count || 0) + (b.medium_count || 0);
        } else {
            valA = 0;
            valB = 0;
        }

        if (currentSortDirection === 'asc') {
            return valA - valB;
        } else {
            return valB - valA;
        }
    });

    return sorted;
}

window.toggleSort = function (column) {
    if (currentSortColumn === column) {
        // Toggle direction
        currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        // Switch column, default to desc
        currentSortColumn = column;
        currentSortDirection = 'desc';
    }

    // Update UI arrows
    ['prompts', 'flags'].forEach(col => {
        const arrowSpan = document.getElementById(`sortArrow-${col}`);
        if (arrowSpan) {
            if (col === currentSortColumn) {
                arrowSpan.classList.remove('text-gray-300', 'group-hover:text-gray-400');
                arrowSpan.classList.add('text-ink-light');
                // ^ (asc) or v (desc)
                arrowSpan.textContent = currentSortDirection === 'asc' ? '▴' : '▾';
            } else {
                arrowSpan.classList.add('text-gray-300', 'group-hover:text-gray-400');
                arrowSpan.classList.remove('text-ink-light');
                arrowSpan.textContent = '▾'; // hidden default
            }
        }
    });

    // Re-render table with new sorting
    renderTable(sortEmployees(currentEmployees));
};

// ──────────────────────────────────────────────
// Interactive Prompt Graph
// ──────────────────────────────────────────────

function getLast7DaysData(employees) {
    if (!employees || employees.length === 0) return [];

    const maxLen = Math.max(...employees.map(e => e.dailyHistory?.length || 0));
    if (maxLen === 0) return [];

    // Aggregate counts (and collect dates) across all employees by day index
    const aggregated = [];
    for (let i = 0; i < maxLen; i++) {
        let totalCount = 0;
        let date = null;
        employees.forEach(e => {
            if (e.dailyHistory && e.dailyHistory[i]) {
                totalCount += e.dailyHistory[i].count || 0;
                if (!date && e.dailyHistory[i].date) date = e.dailyHistory[i].date;
            }
        });
        aggregated.push({ count: totalCount, date });
    }

    // Use full date range from dailyHistory
    const last7 = aggregated;

    // Fill in dates if missing — generate backwards from today
    const today = new Date();
    const startOffset = last7.length - 1;
    last7.forEach((item, i) => {
        if (!item.date) {
            const d = new Date(today);
            d.setDate(d.getDate() - (startOffset - i));
            item.date = d;
        } else if (typeof item.date === 'string') {
            // Treat YYYY-MM-DD as local time instead of UTC to fix off-by-one day chart bug
            const parts = item.date.split('T')[0].split('-');
            if (parts.length === 3) {
                item.date = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
                item.date = new Date(item.date);
            }
        }
    });

    // Bounding max local date to ensure we don't show "tomorrow"
    // due to backend boundary timezone offsets pushing a boundary to the next day.
    let maxAllowedDate = new Date();
    maxAllowedDate.setHours(23, 59, 59, 999);
    if (teamDateFilter && teamDateFilter.endDate) {
        maxAllowedDate = new Date(teamDateFilter.endDate);
        maxAllowedDate.setHours(23, 59, 59, 999);
    }

    // Filter out points strictly in the future relative to the bounded max allowed date
    return last7.filter(item => item.date <= maxAllowedDate);
}

function getLast7DaysFlagData(employees) {
    if (!employees || employees.length === 0) return [];

    const maxLen = Math.max(...employees.map(e => e.dailyFlagHistory?.length || 0));
    if (maxLen === 0) return [];

    const aggregated = [];
    for (let i = 0; i < maxLen; i++) {
        let totalCount = 0;
        let date = null;
        employees.forEach(e => {
            if (e.dailyFlagHistory && e.dailyFlagHistory[i]) {
                totalCount += e.dailyFlagHistory[i].count || 0;
                if (!date && e.dailyFlagHistory[i].date) date = e.dailyFlagHistory[i].date;
            }
        });
        aggregated.push({ count: totalCount, date });
    }

    const today = new Date();
    const startOffset = aggregated.length - 1;
    aggregated.forEach((item, i) => {
        if (!item.date) {
            const d = new Date(today);
            d.setDate(d.getDate() - (startOffset - i));
            item.date = d;
        } else if (typeof item.date === 'string') {
            const parts = item.date.split('T')[0].split('-');
            if (parts.length === 3) {
                item.date = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
                item.date = new Date(item.date);
            }
        }
    });

    let maxAllowedDate = new Date();
    maxAllowedDate.setHours(23, 59, 59, 999);
    if (teamDateFilter && teamDateFilter.endDate) {
        maxAllowedDate = new Date(teamDateFilter.endDate);
        maxAllowedDate.setHours(23, 59, 59, 999);
    }

    return aggregated.filter(item => item.date <= maxAllowedDate);
}

function buildLinearPath(coords) {
    if (coords.length < 2) return '';
    let d = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
    for (let i = 1; i < coords.length; i++) {
        d += ` L${coords[i].x.toFixed(2)},${coords[i].y.toFixed(2)}`;
    }
    return d;
}

function initInteractiveGraph(containerId, data, theme = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Default Theme (Prompts / Dark Green)
    const colors = {
        stroke: theme.stroke || '#4d6159',
        gradientStart: theme.gradientStart || '#4d6159', // opacity handled in stops
        gradientEnd: theme.gradientEnd || '#4d6159',
        connector: theme.connector || '#4d6159',
        dotFill: theme.dotFill || '#4d6159',
        text: theme.text || '#4d6159'
    };

    const W = container.clientWidth || 260;
    const H = container.clientHeight || 96;
    const PAD_X = 6;
    const PAD_TOP = 20; // Increased to make room for labels
    const PAD_BOTTOM = 4;
    const graphW = W - PAD_X * 2;
    const graphH = H - PAD_TOP - PAD_BOTTOM;

    if (!data || data.length < 2) {
        container.innerHTML = `<svg width="${W}" height="${H}"><line x1="${PAD_X}" y1="${H / 2}" x2="${W - PAD_X}" y2="${H / 2}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4,4"/></svg>`;
        return;
    }

    const maxVal = Math.max(...data.map(d => d.count)) || 1;

    const coords = data.map((d, i) => ({
        x: PAD_X + (i / (data.length - 1)) * graphW,
        y: PAD_TOP + graphH - (d.count / maxVal) * graphH * 0.88 - graphH * 0.04
    }));

    // Use linear path instead of cubic
    const linePath = buildLinearPath(coords);
    const lastC = coords[coords.length - 1];
    const firstC = coords[0];
    const areaPath = `${linePath} L${lastC.x.toFixed(2)},${H} L${firstC.x.toFixed(2)},${H} Z`;

    const uid = containerId + '_' + Date.now();

    container.style.position = 'relative';
    container.style.overflow = 'visible';
    container.innerHTML = `
        <svg id="${uid}_svg" width="${W}" height="${H}" style="display:block; overflow:visible; cursor:crosshair;">
            <defs>
                <linearGradient id="${uid}_grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="${colors.gradientStart}" stop-opacity="0.28"/>
                    <stop offset="65%" stop-color="${colors.gradientStart}" stop-opacity="0.07"/>
                    <stop offset="100%" stop-color="${colors.gradientEnd}" stop-opacity="0"/>
                </linearGradient>
                <filter id="${uid}_blur">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4"/>
                </filter>
                <clipPath id="${uid}_clip">
                    ${theme.skipAnimation
            ? `<rect x="-10" y="-10" width="${W + 20}" height="${H + 20}"/>`
            : `<rect x="-10" y="-10" width="0" height="${H + 20}">
                        <animate attributeName="width" from="0" to="${W + 20}" dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.25 1 0.5 1" keyTimes="0;1"/>
                    </rect>`}
                </clipPath>
            </defs>
            <!-- Blurred glow fill -->
            <path d="${areaPath}" fill="url(#${uid}_grad)" filter="url(#${uid}_blur)" opacity="0.75" clip-path="url(#${uid}_clip)"/>
            <!-- Crisp fill -->
            <path d="${areaPath}" fill="url(#${uid}_grad)" clip-path="url(#${uid}_clip)"/>
            <!-- Line -->
            <path d="${linePath}" fill="none" stroke="${colors.stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${uid}_clip)"/>
            
            <!-- Hover Elements Group -->
            <g id="${uid}_hoverGroup" opacity="0" style="transition: opacity 0.2s ease;">
                <!-- Slim vertical line connector (point to label) -->
                <line id="${uid}_connector" x1="0" y1="0" x2="0" y2="0" 
                      stroke="${colors.connector}" stroke-width="1"
                      style="transition: x1 0.3s cubic-bezier(0.25, 1, 0.5, 1), x2 0.3s cubic-bezier(0.25, 1, 0.5, 1), y2 0.3s cubic-bezier(0.25, 1, 0.5, 1);" />
                
                <!-- Hover dot -->
                <circle id="${uid}_dot" cx="0" cy="0" r="3.5" fill="${colors.dotFill}" stroke="white" stroke-width="2" 
                        style="transition: cx 0.3s cubic-bezier(0.25, 1, 0.5, 1), cy 0.3s cubic-bezier(0.25, 1, 0.5, 1);" />
            </g>
        </svg>
        
        <!-- Tooltip Label (Text only, no card) -->
        <div id="${uid}_tip" style="
            position:absolute; pointer-events:none; opacity:0;
            top:0; left:0; transform: translate(-50%, -100%);
            padding-bottom: 4px; /* Space between text and line end */
            font-size:11px; font-family:Manrope,sans-serif; font-weight:600;
            color:#2c2b29; white-space:nowrap; z-index:30;
            transition: left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease;
        "></div>
    `;

    const svg = document.getElementById(`${uid}_svg`);
    const hoverGroup = document.getElementById(`${uid}_hoverGroup`);
    const connector = document.getElementById(`${uid}_connector`);
    const dot = document.getElementById(`${uid}_dot`);
    const tip = document.getElementById(`${uid}_tip`);
    let lastIdx = -1;

    function showAt(idx) {
        if (idx === lastIdx) return;
        lastIdx = idx;
        const c = coords[idx];
        const d = data[idx];

        // Ensure visible
        hoverGroup.setAttribute('opacity', '1');
        tip.style.opacity = '1';

        // Update dot position
        dot.setAttribute('cx', c.x);
        dot.setAttribute('cy', c.y);

        // Update connector line
        // Line goes from the data point (c.x, c.y) UP to a fixed height or just above the point
        // Let's make it go to a fixed Y near the top to align wiht the label
        // Or strictly from point to label. Let's try point to fixed top-ish height.
        const targetY = 0; // Top of SVG
        connector.setAttribute('x1', c.x); // Top X
        connector.setAttribute('y1', targetY); // Top Y
        connector.setAttribute('x2', c.x); // Bottom X (dot)
        connector.setAttribute('y2', c.y); // Bottom Y (dot)

        // Update Tip Content & Position
        const dateStr = d.date instanceof Date
            ? d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : '';

        tip.innerHTML = `<span style="color:${colors.text};font-weight:500; margin-right:6px;">${d.count.toLocaleString()}</span><span style="color:#9ca3af; font-weight:400;">${dateStr}</span>`;

        // Position tip at the top of the connector line
        // We use style.left/top with transform translate(-50%, -100%) to center it above the point
        tip.style.left = c.x + 'px';
        tip.style.top = (targetY) + 'px';
    }

    function hide() {
        lastIdx = -1;
        hoverGroup.setAttribute('opacity', '0');
        tip.style.opacity = '0';
    }

    // Use throttling for mousemove to avoid excessive updates if needed, 
    // but for 7 points standard logic is fine.
    svg.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        // Find nearest point
        let nearestIdx = 0, minDist = Infinity;
        // Simple search is fast enough for < 50 points
        coords.forEach((c, i) => {
            const dist = Math.abs(c.x - mouseX);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        });

        showAt(nearestIdx);
    });

    svg.addEventListener('mouseleave', hide);
}

// ──────────────────────────────────────────────
// Rendering
// ──────────────────────────────────────────────

function renderSummaryCards(employees, dashStats) {
    const container = document.getElementById('summaryCardsContainer');

    // 1. Calculate Aggregates — prefer dashboard stats (same source as admin dashboard) over per-employee sums
    const totalPrompts = dashStats?.totalPrompts ?? employees.reduce((sum, e) => sum + (e.promptCount || 0), 0);
    const totalFlags = dashStats?.riskEvents ?? employees.reduce((sum, e) => sum + (e.critical_count || 0) + (e.medium_count || 0), 0);

    const last7DaysPrompts = getLast7DaysData(employees);
    const last7DaysRisk = getLast7DaysFlagData(employees);

    // Skip re-render if data hasn't changed (avoids visible graph reload on each poll)
    const signature = JSON.stringify([totalPrompts, totalFlags, last7DaysPrompts, last7DaysRisk]);
    if (signature === lastSummarySignature) return;
    const isFirstRender = lastSummarySignature === null;
    lastSummarySignature = signature;

    container.innerHTML = `
        <div class="glass-card rounded-clay p-6 shadow-clay-sm flex-1 flex flex-col">
            <p class="text-xs uppercase tracking-wider text-ink-light font-bold mb-1">Total Team Prompts</p>
            <div class="flex items-end gap-2 mb-2">
                <p class="text-4xl font-serif text-ink">${totalPrompts.toLocaleString()}</p>
            </div>
            <div id="promptGraphContainer" class="h-24 w-full mt-auto" style="position:relative; overflow:visible;"></div>
        </div>

        <div class="glass-card rounded-clay p-6 shadow-clay-sm flex-1 flex flex-col justify-center">
            <p class="text-xs uppercase tracking-wider text-ink-light font-bold mb-1">Security Overview</p>
            <div class="flex items-end gap-2 mb-4">
                <p class="text-4xl font-serif text-ink">${totalFlags.toLocaleString()}</p>
            </div>
            <div id="riskGraphContainer" class="h-24 w-full mt-auto" style="position:relative; overflow:visible;"></div>
        </div>
    `;

    // Build interactive 7-day prompt graphs after DOM is ready
    requestAnimationFrame(() => {
        initInteractiveGraph('promptGraphContainer', last7DaysPrompts, {
            stroke: '#4d6159',
            gradientStart: '#4d6159',
            gradientEnd: '#4d6159',
            connector: '#4d6159',
            dotFill: '#4d6159',
            text: '#4d6159',
            skipAnimation: !isFirstRender
        });

        initInteractiveGraph('riskGraphContainer', last7DaysRisk, {
            stroke: '#E57373',
            gradientStart: '#E57373',
            gradientEnd: '#E57373',
            connector: '#E57373',
            dotFill: '#E57373',
            text: '#E57373',
            skipAnimation: !isFirstRender
        });
    });
}


function renderTable(employees) {
    const tbody = document.getElementById('tableBody');
    const paginationContainer = document.getElementById('paginationContainer');

    if (!employees || employees.length === 0) {
        tbody.innerHTML = '';
        if (paginationContainer) paginationContainer.classList.add('hidden');
        lastTableSignature = null;
        return;
    }

    const totalItems = employees.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const paginatedEmployees = employees.slice(startIndex, endIndex);

    const tableSignature = JSON.stringify([
        currentPage,
        paginatedEmployees.map(e => [e.name, e.department, e.promptCount, e.critical_count, e.medium_count, e.topModel, e.dailyHistory?.map(d => d.count)])
    ]);
    if (tableSignature === lastTableSignature) return;
    lastTableSignature = tableSignature;

    const html = paginatedEmployees.map((emp, index) => {
        const rank = startIndex + index + 1;
        const empData = encodeEmployee(emp);
        const prompts = emp.promptCount || 0;
        const { name, color } = getTopModelDisplay(emp);

        // Sparkline for row
        const history = emp.dailyHistory?.map(d => d.count) || [0, 0, 0, 0, 0];
        const sparkPath = generateSparklinePath(history, 100, 20);

        return `
            <tr class="border-b border-parchment-200 group hover:bg-parchment-50 transition-colors cursor-pointer" 
                onclick="navigateToMember(this)" data-employee="${empData}">
                
                <td class="py-4 font-medium pl-2 text-ink-light">${rank}</td>
                
                <td class="py-4 pl-6 pr-4">
                    <div class="flex items-center gap-3">
                         <span class="text-sm font-semibold text-ink">${escapeHtml(emp.name)}</span>
                    </div>
                </td>

                <td class="py-4">
                    <span class="text-ink-light text-sm">${escapeHtml(emp.department || '—')}</span>
                </td>

                <td class="py-4">
                    <span class="text-ink-light text-sm">${name}</span>
                </td>
                
                <td class="py-4 font-medium text-ink">${prompts}</td>
                
                <td class="py-4">
                    <svg class="w-20 h-5" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path class="animate-reveal-right" d="${sparkPath}" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;

    // Update pagination UI
    if (paginationContainer) {
        if (totalItems > ITEMS_PER_PAGE) {
            paginationContainer.classList.remove('hidden');
            document.getElementById('pageStart').textContent = startIndex + 1;
            document.getElementById('pageEnd').textContent = endIndex;
            document.getElementById('pageTotal').textContent = totalItems;
            document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${totalPages}`;

            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');

            if (prevBtn) prevBtn.disabled = currentPage === 1;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages;
        } else {
            paginationContainer.classList.add('hidden');
        }
    }
}

window.changePage = function (delta) {
    const totalPages = Math.ceil(sortEmployees(currentEmployees).length / ITEMS_PER_PAGE);
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable(sortEmployees(currentEmployees));
    }
};

function renderView(employees, dashStats) {
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    if (loading) loading.classList.add('hidden');

    if (!employees || employees.length === 0) {
        if (empty) empty.classList.remove('hidden');
        document.getElementById('tableBody').innerHTML = '';
        return;
    }
    if (empty) empty.classList.add('hidden');

    const sorted = sortEmployees(employees);

    renderSummaryCards(sorted, dashStats); // Pass all for aggregation
    renderTable(sorted);
}


// ──────────────────────────────────────────────
// Data Loading & Navigation (Kept from original)
// ──────────────────────────────────────────────

async function navigateToMember(cardElement) {
    const employeeDataEncoded = cardElement.getAttribute('data-employee');
    if (!employeeDataEncoded) return;
    try {
        const employeeData = decodeURIComponent(atob(employeeDataEncoded));
        const employee = JSON.parse(employeeData);
        sessionStorage.setItem('employeeDetailReferrer', 'teamOverview');
        if (window.electronAPI) {
            await window.electronAPI.setSelectedEmployee(employee);
            navigateWithTransition('employeeDetail', '../employees/employeeDetail.html', 'forward');
        } else {
            sessionStorage.setItem('selectedEmployee', employeeData);
            window.location.href = '../employees/employeeDetail.html';
        }
    } catch (e) {
        console.error('Failed to navigate to member detail:', e);
    }
}

function navigateBack() {
    const referrer = sessionStorage.getItem('navigationReferrer');
    sessionStorage.removeItem('navigationReferrer');

    if (referrer === 'adminDashboard') {
        if (window.navigateWithTransition) {
            window.navigateWithTransition('adminDashboard', '../admin/admin.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('adminDashboard');
        } else {
            window.location.href = '../admin/admin.html';
        }
    } else {
        if (window.navigateWithTransition) {
            window.navigateWithTransition('dashboard', '../dashboard/index.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('dashboard');
        } else {
            window.location.href = '../dashboard/index.html';
        }
    }
}

async function loadTeamData() {
    if (!window.electronAPI) {
        document.getElementById('loadingState')?.classList.add('hidden');
        return;
    }

    try {
        let activeDeptId = null;
        try {
            const ctx = JSON.parse(sessionStorage.getItem('viewingDepartmentContext') || '{}');
            activeDeptId = ctx.departmentId || null;
        } catch (e) { /* ignore */ }
        if (!activeDeptId && window.electronAPI?.getUserProfile) {
            try {
                const profile = await window.electronAPI.getUserProfile();
                if ((profile?.role || '').toLowerCase() === 'manager') {
                    activeDeptId = profile.department_id || null;
                }
            } catch (e) { /* ignore */ }
        }
        const dateOpts = { departmentId: activeDeptId, startDate: teamDateFilter.startDate, endDate: teamDateFilter.endDate, utcOffset: new Date().getTimezoneOffset() };
        const [employees, dashStats] = await Promise.all([
            window.electronAPI.getEmployees(dateOpts),
            window.electronAPI.getDashboardStats(activeDeptId, teamDateFilter.startDate, teamDateFilter.endDate)
        ]);

        currentEmployees = employees || [];
        renderView(currentEmployees, dashStats);
    } catch (error) {
        console.error('Failed to load team data:', error);
        document.getElementById('loadingState')?.classList.add('hidden');
        document.getElementById('emptyState')?.classList.remove('hidden');
    }
}

function startTeamPolling() {
    if (teamPollInterval) clearInterval(teamPollInterval);
    teamPollInterval = setInterval(loadTeamData, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Init shared date filter component
    window.dateFilterInstance = DateFilter.init({
        mountId: 'date-filter-mount',
        storageKey: 'teamOverviewDateFilter',
        onFilterChange: (filterState) => {
            teamDateFilter = filterState;
            currentPage = 1;
            loadTeamData();
        },
        activeClasses: {
            add: ['text-gray-900', 'bg-gray-100', 'font-bold', 'rounded-md'],
            remove: ['text-gray-500']
        },
    });
    if (window.dateFilterInstance) {
        teamDateFilter = window.dateFilterInstance.getState();
    }

    if (window.showPageLoadingOverlay) window.showPageLoadingOverlay();
    loadTeamData()
        .catch(err => console.warn('[TeamOverview] Initial load failed:', err))
        .then(() => {
            if (window.hidePageLoadingOverlay) window.hidePageLoadingOverlay();
            startTeamPolling();
        });
    Utils.initDynamicStyles();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(teamPollInterval);
        else loadTeamData()
            .catch(err => console.warn('[TeamOverview] Refresh failed:', err))
            .then(() => startTeamPolling());
    });
});



window.navigateToMember = navigateToMember;
window.navigateBack = navigateBack;
