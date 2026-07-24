// Security Overview
const state = {
    incidents: [],
    cachedEmployees: null,
    pollInterval: null,
    filters: { type: null, userName: null, department: null, dateRange: null, customDateStart: null, customDateEnd: null },
    activeDropdown: null,
    isAdmin: false,
    kpiView: 'member',   // options: 'department' | 'member'
    memberPage: 0,
    incidentPage: 0,
    incidentPageSize: 50,
    securityActivityChart: null,
    securityDailyActivity: [] // activity data for hover plugin
};

const securityHoverAnim = {
    active: false,
    datasetIndex: -1,
    barIndex: -1,
    startTime: 0,
    progress: 0,
    exiting: false,
    exitStartTime: 0,
    exitProgress: 0,
    snapshot: null,
    rafId: null
};

const SECURITY_CHART_COLORS = (typeof Utils !== 'undefined' && Utils.CHART_COLORS) ? Utils.CHART_COLORS : ['#4d6159', '#c2a894', '#7d8c82', '#5e503f', '#9ea39a', '#a7877f', '#6b705c', '#1a1a2e'];

function calculateChartScales(maxValue) {
    let step = 5;
    if (maxValue <= 10) step = 1;
    else if (maxValue <= 20) step = 2;
    else if (maxValue <= 50) step = 5;
    else step = 10;
    let buffer = 2;
    if (maxValue > 20) buffer = 10;
    else if (maxValue > 10) buffer = 5;
    return {
        suggestedMax: Math.ceil((maxValue + buffer) / step) * step,
        stepSize: step
    };
}

function getTimeFilteredIncidents() {
    if (!state.filters.dateRange) return state.incidents;
    if (state.filters.dateRange === 'Custom') {
        const start = state.filters.customDateStart ? new Date(state.filters.customDateStart).getTime() : 0;
        const end = state.filters.customDateEnd ? new Date(state.filters.customDateEnd).getTime() : Infinity;
        return state.incidents.filter(i => {
            const t = new Date(i.createdAt).getTime();
            return t >= start && t <= end;
        });
    }
    const opt = DATE_RANGE_OPTIONS.find(o => o.label === state.filters.dateRange);
    if (opt && opt.days !== null) {
        const cutoff = Date.now() - opt.days * 86400000;
        return state.incidents.filter(i => new Date(i.createdAt).getTime() >= cutoff);
    }
    return state.incidents;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Inject custom tooltip styles for exceeds-cap info icon
    const capStyle = document.createElement('style');
    capStyle.textContent = `
        .cap-tooltip {
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%);
            background: #fff;
            color: #1a1a2e;
            font-size: 11px;
            padding: 6px 10px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 50;
        }
        .exceeds-cap-tip:hover .cap-tooltip,
        .unsupported-source-tip:hover .cap-tooltip {
            opacity: 1;
        }
    `;
    document.head.appendChild(capStyle);

    // Multi-file dropdown styles
    const multiFileStyle = document.createElement('style');
    multiFileStyle.textContent = `
        .multi-file-trigger {
            cursor: pointer;
            user-select: none;
        }
        .multi-file-trigger .multi-file-label {
            position: relative;
            display: inline;
        }
        .multi-file-trigger .multi-file-label::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 0;
            height: 1.5px;
            background: #2C2C2C;
            transition: width 0.25s ease-out;
        }
        .multi-file-trigger:hover .multi-file-label::after {
            width: 100%;
        }
        .multi-file-dropdown {
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            transform: translateY(-4px);
            transition: max-height 0.25s ease, opacity 0.2s ease, transform 0.2s ease;
            pointer-events: none;
        }
        .multi-file-dropdown.open {
            max-height: 200px;
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
            overflow-y: auto;
        }
    `;
    document.head.appendChild(multiFileStyle);

    window.pageLoadTime = window.performance.now();
    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    // Initialize shared date filter component
    window.dateFilterInstance = DateFilter.init({
        mountId: 'date-filter-mount',
        storageKey: 'securityDateFilter',
        onFilterChange: (filterState) => {
            const match = DATE_RANGE_OPTIONS.find(o => o.preset === filterState.preset);
            if (filterState.preset === 'custom') {
                state.filters.dateRange = 'Custom';
                state.filters.customDateStart = filterState.startDate;
                state.filters.customDateEnd = filterState.endDate;
            } else if (match) {
                state.filters.dateRange = match.label;
                state.filters.customDateStart = null;
                state.filters.customDateEnd = null;
            } else {
                state.filters.dateRange = null;
                state.filters.customDateStart = null;
                state.filters.customDateEnd = null;
            }
            updateFilterButtonStates();
            renderIncidents();
            updateStats(true);
        },
    });
    if (window.dateFilterInstance) {
        // Sync any initial state from the date filter (e.g. restored from sessionStorage)
        const initial = window.dateFilterInstance.getState();
        if (initial && initial.preset !== 'all') {
            const match = DATE_RANGE_OPTIONS.find(o => o.preset === initial.preset);
            if (initial.preset === 'custom' && initial.startDate && initial.endDate) {
                state.filters.dateRange = 'Custom';
                state.filters.customDateStart = initial.startDate;
                state.filters.customDateEnd = initial.endDate;
            } else if (match) {
                state.filters.dateRange = match.label;
            }
        }
    }

    if (window.electronAPI && window.electronAPI.getUserProfile) {
        try {
            const profile = await window.electronAPI.getUserProfile();
            state.isAdmin = ((profile && profile.role) || '').toLowerCase() === 'admin';
        } catch (e) { /* ignore */ }
    }
    if (window.showPageLoadingOverlay) window.showPageLoadingOverlay();
    loadSecurityData()
        .catch(err => console.warn('[SecurityCenter] Initial load failed:', err))
        .then(() => {
            if (window.hidePageLoadingOverlay) window.hidePageLoadingOverlay();
            updateFilterButtonStates();
            startPolling();
        });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(state.pollInterval);
        } else {
            loadSecurityData()
                .catch(err => console.warn('[SecurityCenter] Refresh failed:', err))
                .then(() => startPolling());
        }
    });
});

function renderAfterTransition(renderFn) {
    renderFn();
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

async function loadSecurityData() {
    let employees;
    if (window.electronAPI) {
        try {
            employees = await window.electronAPI.getEmployees();
            state.cachedEmployees = employees;
        } catch (e) {
            employees = state.cachedEmployees;
        }
    }
    await loadSecurityFlags(employees);
}

function startPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(loadSecurityData, 10000);
}

async function loadSecurityFlags(preloadedEmployees) {
    // Read department context (set by manager dashboard, cleared by admin panel)
    let departmentId = null;
    try {
        const ctx = JSON.parse(sessionStorage.getItem('securityDepartmentContext') || '{}');
        departmentId = ctx.departmentId || null;
    } catch (e) { /* ignore */ }

    if (!window.electronAPI) {
        state.incidents = [];
        renderAfterTransition(() => { updateStats(); renderIncidents(); });
        return;
    }

    try {
        let flags, employees;
        if (preloadedEmployees !== undefined) {
            flags = await window.electronAPI.getSecurityFlags({ limit: 1000, departmentId });
            employees = preloadedEmployees;
        } else {
            [flags, employees] = await Promise.all([
                window.electronAPI.getSecurityFlags({ limit: 1000, departmentId }),
                window.electronAPI.getEmployees(departmentId ? { departmentId } : undefined)
            ]);
        }

        const employeeMap = {};
        const employeeMapByEmail = {};
        (employees || []).forEach(emp => {
            if (emp.name) employeeMap[emp.name] = emp;
            if (emp.email) employeeMapByEmail[emp.email] = emp;
        });

        // Map flags to incidents - don't filter aggressively
        // Normalize type to avoid "PII Detected Detected" (collapse duplicate " Detected")
        const normalizeIncidentType = (t) => (t || '').replace(/\s+Detected\s+Detected$/i, ' Detected').trim();
        const isNonIncidentType = (type) => {
            const t = (type || '').toLowerCase().trim();
            return t === 'none' || t === 'no issues detected' || t === 'none detected';
        };
        state.incidents = (flags || [])
            .map(flag => {
                const employee = employeeMap[flag.userName] || (flag.userEmail && employeeMapByEmail[flag.userEmail]) || {};
                const rawType = flag.type || flag.description || 'Security Flag';
                const type = normalizeIncidentType(rawType);
                if (isNonIncidentType(type)) return null;
                // Prefer department from API (same user row as flag); fall back to employee map
                const department = (flag.department != null && flag.department !== '') ? flag.department : (employee.department || null);
                // Normalize files to array — support both new multi-file and legacy single-file flags
                const incidentFiles = flag.files || (flag.filename ? [{
                    id: flag.id,
                    name: flag.filename,
                    hasFileContent: flag.hasFileContent || false,
                    exceedsCap: flag.exceedsCap || false
                }] : []);

                return {
                    id: flag.id,
                    type,
                    userName: flag.userName || 'Unknown',
                    department,
                    createdAt: flag.createdAt,
                    filename: flag.filename || null,
                    hasFileContent: flag.hasFileContent || false,
                    exceedsCap: flag.exceedsCap || false,
                    files: incidentFiles,
                    description: flag.description || '',
                    mainCategory: flag.mainCategory || null,
                    subcategory: flag.subcategory || null,
                    source: flag.source || null,
                    model: flag.model || null,
                    agentProvider: flag.agentProvider || null
                };
            })
            .filter(Boolean);

        renderAfterTransition(() => { updateStats(); renderIncidents(); });
    } catch (error) {
        console.error('Failed to load security flags:', error);
    }
}

function updateStats(animate) {
    renderActivityChart(animate);
}

function renderActivityChart(animate) {
    const incidents = getFilteredIncidents();

    // Daily/weekly data for activity trend chart — respects date filter
    const dayMs = 86400000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + dayMs - 1);

    let rangeStart, rangeEnd;
    const dateFilter = state.filters.dateRange;
    if (dateFilter === 'Custom') {
        rangeStart = state.filters.customDateStart ? new Date(state.filters.customDateStart) : todayStart;
        rangeEnd = state.filters.customDateEnd ? new Date(state.filters.customDateEnd) : todayEnd;
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);
    } else if (dateFilter) {
        const opt = DATE_RANGE_OPTIONS.find(o => o.label === dateFilter);
        if (opt && opt.days !== null) {
            rangeStart = new Date(Date.now() - opt.days * dayMs);
            rangeStart.setHours(0, 0, 0, 0);
            rangeEnd = todayEnd;
        } else {
            // All Time — use earliest incident or default to 30 days
            const earliest = incidents.length ? incidents.reduce((min, i) => { const t = new Date(i.createdAt).getTime(); return t < min ? t : min; }, Infinity) : Date.now();
            rangeStart = new Date(earliest);
            rangeStart.setHours(0, 0, 0, 0);
            rangeEnd = todayEnd;
        }
    } else {
        // null (All Time / no filter) — use earliest incident or default to 7 days
        if (incidents.length) {
            const earliest = incidents.reduce((min, i) => { const t = new Date(i.createdAt).getTime(); return t < min ? t : min; }, Infinity);
            rangeStart = new Date(earliest);
            rangeStart.setHours(0, 0, 0, 0);
        } else {
            rangeStart = new Date(Date.now() - 7 * dayMs);
            rangeStart.setHours(0, 0, 0, 0);
        }
        rangeEnd = todayEnd;
    }

    const totalDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / dayMs));
    const useWeekly = totalDays > 60;
    const bucketMs = useWeekly ? 7 * dayMs : dayMs;
    const bucketCount = useWeekly ? Math.ceil(totalDays / 7) : totalDays;

    const dailyActivity = [];
    for (let b = 0; b < bucketCount; b++) {
        const bucketStart = new Date(rangeStart.getTime() + b * bucketMs);
        bucketStart.setHours(0, 0, 0, 0);
        const bucketEnd = new Date(bucketStart.getTime() + bucketMs - 1);
        const bucketIncidents = incidents.filter(i => {
            const t = new Date(i.createdAt).getTime();
            return t >= bucketStart.getTime() && t <= bucketEnd.getTime();
        });
        const typeBreakdown = {};
        bucketIncidents.forEach(i => {
            const type = i.type || 'Other';
            typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
        });
        let dayLabel = bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (!useWeekly) {
            if (bucketStart.getTime() === todayStart.getTime()) dayLabel = 'Today';
            else if (bucketStart.getTime() === todayStart.getTime() - dayMs) dayLabel = 'Yesterday';
        }
        dailyActivity.push({ day: dayLabel, count: bucketIncidents.length, typeBreakdown });
    }

    const totalInPeriod = dailyActivity.reduce((s, d) => s + d.count, 0);
    const avgPerDay = totalDays ? Math.round((totalInPeriod / totalDays) * 10) / 10 : 0;
    let periodLabel = 'all time';
    if (dateFilter === 'Custom') periodLabel = 'selected range';
    else if (dateFilter === 'Past Week') periodLabel = 'past week';
    else if (dateFilter === 'Past 30 Days') periodLabel = 'past 30 days';

    const section = document.getElementById('securityActivityChartSection');
    const summaryEl = document.getElementById('securityActivitySummary');
    const legendEl = document.getElementById('securityActivityLegend');
    if (section) {
        section.classList.remove('hidden');
        if (summaryEl) summaryEl.textContent = `${totalInPeriod} total in ${periodLabel}${avgPerDay > 0 ? ` · ~${avgPerDay} per day` : ''}`;
        updateSecurityActivityChart(dailyActivity, animate);
        const allTypes = [...new Set(dailyActivity.flatMap(d => Object.keys(d.typeBreakdown)))].sort();
        if (legendEl) {
            legendEl.innerHTML = allTypes.map((type, i) => {
                const color = SECURITY_CHART_COLORS[i % SECURITY_CHART_COLORS.length];
                return `<span class="flex items-center gap-1 text-[10px] text-ink-light"><span class="w-2 h-2 rounded-sm shrink-0" style="background:${color}"></span>${escapeHtml(type)}</span>`;
            }).join('');
        }
    }
    renderRiskKpiPanel(incidents);
}

function setKpiView(view) {
    if (state.kpiView === view) return;
    const direction = view === 'member' ? 'right' : 'left';
    state.kpiView = view;
    if (view === 'member') state.memberPage = 0;
    renderRiskKpiPanel(state.incidents, true, direction);
}

function setMemberPage(delta) {
    state.memberPage = Math.max(0, state.memberPage + delta);
    renderRiskKpiPanel(state.incidents, true, delta > 0 ? 'right' : 'left');
}

function renderRiskKpiPanel(incidents, animate = false, direction = 'right') {
    const panel = document.getElementById('riskKpiPanel');
    if (!panel) return;

    const openIncidents = incidents;
    const teamTotal = openIncidents.length;

    let deptName = null;
    try {
        const ctx = JSON.parse(sessionStorage.getItem('securityDepartmentContext') || '{}');
        deptName = ctx.departmentName || null;
    } catch (e) { }
    if (!deptName && state.filters.department) deptName = state.filters.department;

    let deptTotal = null;
    if (deptName) {
        deptTotal = openIncidents.filter(i => i.department === deptName).length;
    }
    const showDept = deptName && deptTotal !== null && deptTotal !== teamTotal;

    const statSection = (label, value, sub) =>
        `<div class="py-2">
            <div class="text-[10px] font-semibold text-ink-light uppercase tracking-wide mb-0.5">${label}</div>
            <div class="text-2xl font-bold text-slate-800 leading-tight">${value}</div>
            <div class="text-[10px] text-ink-light">${sub}</div>
        </div>`;

    const divider = `<div class="border-t border-parchment-200"></div>`;

    // Dept tab only makes sense for admins viewing across all departments
    const showDeptTab = state.isAdmin && !deptName;
    const effectiveView = (state.kpiView === 'department' && !showDeptTab) ? 'member' : state.kpiView;

    // Tab pills
    const views = [
        ...(showDeptTab ? [{ key: 'department', label: 'Dept' }] : []),
        { key: 'member', label: 'Members' },
    ];

    let tabsHtml = '';
    const oldActiveIdx = window._lastKpiTabIdx || 0;
    const activeIdx = views.findIndex(v => v.key === effectiveView);
    const safeActiveIdx = activeIdx === -1 ? 0 : activeIdx;
    window._lastKpiTabIdx = safeActiveIdx;

    if (views.length > 1) {
        tabsHtml = `<div class="py-2">
            <div class="relative grid grid-cols-2 p-1 bg-parchment-100 rounded-full w-[140px]">
                <div id="kpiTabSlider" class="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] bg-sage-700 rounded-full transition-transform duration-300 ease-out" 
                     style="transform: translateX(${oldActiveIdx * 100}%)"></div>
                ${views.map((v) =>
            `<button onclick="setKpiView('${v.key}')"
                    class="relative z-10 py-1 flex items-center justify-center text-[10px] font-medium transition-colors duration-300 ${effectiveView === v.key ? 'text-white' : 'text-slate-500 hover:text-slate-800'
            }">${v.label}</button>`
        ).join('')}
            </div>
        </div>`;
    } else {
        tabsHtml = `<div class="py-2">
            <div class="inline-flex py-1 px-3 bg-sage-700 rounded-full text-[10px] font-medium text-white shadow-sm">
                ${views[0].label}
            </div>
        </div>`;
    }

    // Department view (admin-only)
    const deptCounts = {};
    openIncidents.forEach(i => {
        const d = i.department || 'Unknown';
        deptCounts[d] = (deptCounts[d] || 0) + 1;
    });
    const deptSorted = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const departmentHtml = `<div class="py-2">
        <div class="space-y-1">
            ${deptSorted.map(([name, count]) =>
        `<div class="flex items-center justify-between">
                    <span class="text-[11px] text-ink-light truncate max-w-[80%]">${escapeHtml(name)}</span>
                    <span class="text-[11px] font-semibold text-slate-700 shrink-0">${count}</span>
                </div>`
    ).join('')}
            ${deptSorted.length === 0 ? '<p class="text-[11px] text-ink-light">No data</p>' : ''}
        </div>
    </div>`;

    // Member view
    let memberIncidents = openIncidents;
    if (!state.isAdmin && deptName) {
        memberIncidents = openIncidents.filter(i => i.department === deptName);
    }
    const memberCounts = {};
    memberIncidents.forEach(i => {
        const u = i.userName || 'Unknown';
        memberCounts[u] = (memberCounts[u] || 0) + 1;
    });
    const memberAll = Object.entries(memberCounts).sort((a, b) => b[1] - a[1]);
    const memberTotalPages = Math.ceil(memberAll.length / 5);
    const memberPage = Math.min(state.memberPage, Math.max(0, memberTotalPages - 1));
    const memberSorted = memberAll.slice(memberPage * 5, memberPage * 5 + 5);
    const memberHtml = `<div class="py-2">
        <div class="space-y-1">
            ${memberSorted.map(([name, count]) =>
        `<div class="flex items-center justify-between">
                    <span class="text-[11px] text-ink-light truncate max-w-[80%]">${escapeHtml(name)}</span>
                    <span class="text-[11px] font-semibold text-slate-700 shrink-0">${count}</span>
                </div>`
    ).join('')}
            ${memberSorted.length === 0 ? '<p class="text-[11px] text-ink-light">No data</p>' : ''}
        </div>
        ${memberAll.length > 5 ? `
        <div class="flex items-center justify-between mt-2 pt-1 border-t border-parchment-100">
            <button onclick="setMemberPage(-1)"
                    class="text-base text-ink-light hover:text-ink disabled:opacity-30 px-1.5 leading-none"
                    ${memberPage === 0 ? 'disabled' : ''}>&#8249;</button>
            <span class="text-[10px] text-ink-light">${memberPage + 1} / ${memberTotalPages}</span>
            <button onclick="setMemberPage(1)"
                    class="text-base text-ink-light hover:text-ink disabled:opacity-30 px-1.5 leading-none"
                    ${memberPage === memberTotalPages - 1 ? 'disabled' : ''}>&#8250;</button>
        </div>` : ''}
    </div>`;

    const contentMap = {
        department: departmentHtml,
        member: memberHtml,
    };

    let contentClasses = 'transition-all duration-150 ease-out';
    if (animate) {
        if (direction === 'right') contentClasses += ' opacity-0 translate-x-1';
        else if (direction === 'left') contentClasses += ' opacity-0 -translate-x-1';
        else contentClasses += ' opacity-0 translate-y-1';
    } else {
        contentClasses += ' opacity-100 translate-x-0 translate-y-0';
    }

    let html = statSection('Team Total', teamTotal, 'open risk events');
    if (showDept) html += divider + statSection(escapeHtml(deptName), deptTotal, 'open risk events');

    html += divider + tabsHtml + divider +
        `<div id="kpiContentWrapper" class="${contentClasses} transform w-full">` +
        (contentMap[effectiveView] || memberHtml) +
        `</div>`;

    panel.innerHTML = html;

    const slider = document.getElementById('kpiTabSlider');
    if (slider) {
        if (oldActiveIdx !== safeActiveIdx) {
            slider.offsetHeight;
            slider.style.transform = `translateX(${safeActiveIdx * 100}%)`;
        } else {
            slider.style.transform = `translateX(${safeActiveIdx * 100}%)`;
        }
    }

    if (animate) {
        const wrapper = document.getElementById('kpiContentWrapper');
        if (wrapper) {
            wrapper.offsetHeight; // reflow
            wrapper.classList.remove('opacity-0', 'translate-y-1', 'translate-x-1', '-translate-x-1');
            wrapper.classList.add('opacity-100', 'translate-y-0', 'translate-x-0');
        }
    }
}

function updateSecurityActivityChart(dailyActivity, animate) {
    const canvas = document.getElementById('securityActivityChart');
    if (!canvas || typeof Chart === 'undefined') return;

    state.securityDailyActivity = dailyActivity || [];
    const labels = dailyActivity.map(d => d.day);
    let maxLayers = 0;
    dailyActivity.forEach(day => {
        const n = Object.keys(day.typeBreakdown).length;
        if (n > maxLayers) maxLayers = n;
    });
    if (maxLayers === 0) maxLayers = 1;

    const datasets = Array.from({ length: maxLayers }, (_, i) => ({
        label: `Rank ${i + 1}`,
        data: [],
        backgroundColor: [],
        borderColor: [],
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
        borderRadius: 3,
        borderSkipped: false,
        stack: 'security',
        barPercentage: 0.7,
        typeNames: []
    }));

    dailyActivity.forEach(day => {
        const dayTypes = Object.entries(day.typeBreakdown).map(([name, count]) => ({ name, count }));
        dayTypes.sort((a, b) => {
            const diff = b.count - a.count;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });
        for (let i = 0; i < maxLayers; i++) {
            if (i < dayTypes.length) {
                const t = dayTypes[i];
                const color = SECURITY_CHART_COLORS[i % SECURITY_CHART_COLORS.length];
                datasets[i].data.push(t.count);
                datasets[i].backgroundColor.push(color);
                datasets[i].borderColor.push(color);
                datasets[i].typeNames.push(t.name);
            } else {
                datasets[i].data.push(0);
                datasets[i].backgroundColor.push('transparent');
                datasets[i].borderColor.push('transparent');
                datasets[i].typeNames.push('');
            }
        }
    });

    const maxValue = Math.max(...dailyActivity.map(d => d.count), 0);
    const { suggestedMax, stepSize } = calculateChartScales(maxValue);

    if (state.securityActivityChart) {
        state.securityActivityChart.data.labels = labels;
        state.securityActivityChart.data.datasets = datasets;
        state.securityActivityChart.options.scales.y.suggestedMax = suggestedMax;
        state.securityActivityChart.options.scales.y.ticks.stepSize = stepSize;
        state.securityActivityChart.update(animate ? undefined : 'none');
        return;
    }

    const ctx = canvas.getContext('2d');
    state.securityActivityChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#5e5b56', maxRotation: 0 }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    border: { display: false },
                    ticks: { display: true, stepSize, font: { size: 11 }, color: '#5e5b56', padding: 4, precision: 0 }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: true },
            animation: { duration: 500, easing: 'easeOutExpo' }
        },
        plugins: [securityActivityHoverPlugin()]
    });
}

function securityActivityHoverPlugin() {
    return {
        id: 'customSecurityHoverEffect',
        afterDraw(chart) {
            const activeElements = chart.getActiveElements();
            const now = performance.now();
            const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
            const POP_DURATION = 200;
            const LINE_DURATION = 250;
            const LINE_DELAY = 80;
            const LABEL_DURATION = 200;
            const LABEL_DELAY = 160;
            const EXIT_DURATION = 200;
            const dailyActivity = state.securityDailyActivity || [];

            if (activeElements && activeElements.length > 0) {
                const active = activeElements[0];
                const dsIdx = active.datasetIndex;
                const bIdx = active.index;
                if (!securityHoverAnim.active || securityHoverAnim.datasetIndex !== dsIdx || securityHoverAnim.barIndex !== bIdx) {
                    securityHoverAnim.active = true;
                    securityHoverAnim.exiting = false;
                    securityHoverAnim.datasetIndex = dsIdx;
                    securityHoverAnim.barIndex = bIdx;
                    securityHoverAnim.startTime = now;
                    securityHoverAnim.progress = 0;
                    securityHoverAnim.snapshot = null;
                }
            } else if (securityHoverAnim.active && !securityHoverAnim.exiting) {
                securityHoverAnim.exiting = true;
                securityHoverAnim.exitStartTime = now;
                securityHoverAnim.exitProgress = 0;
                const dsIdx = securityHoverAnim.datasetIndex;
                const bIdx = securityHoverAnim.barIndex;
                const meta = chart.getDatasetMeta(dsIdx);
                if (meta && meta.data[bIdx]) {
                    const bar = meta.data[bIdx];
                    const dataset = chart.data.datasets[dsIdx];
                    const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);
                    const color = dataset.backgroundColor[bIdx] || dataset.backgroundColor;
                    const typeName = dataset.typeNames ? dataset.typeNames[bIdx] : dataset.label;
                    securityHoverAnim.snapshot = {
                        x, y, base, width, color, typeName,
                        value: dataset.data[bIdx],
                        dayTotal: dailyActivity[bIdx]?.count || 0,
                        chartArea: { ...chart.chartArea }
                    };
                }
            }

            if (!securityHoverAnim.active) return;

            let drawData;
            if (securityHoverAnim.exiting && securityHoverAnim.snapshot) {
                drawData = securityHoverAnim.snapshot;
            } else {
                const dsIdx = securityHoverAnim.datasetIndex;
                const bIdx = securityHoverAnim.barIndex;
                const meta = chart.getDatasetMeta(dsIdx);
                if (!meta || !meta.data[bIdx]) return;
                const bar = meta.data[bIdx];
                const dataset = chart.data.datasets[dsIdx];
                const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);
                const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[bIdx] : dataset.backgroundColor;
                const typeName = dataset.typeNames ? dataset.typeNames[bIdx] : dataset.label;
                drawData = {
                    x, y, base, width, color, typeName,
                    value: dataset.data[bIdx],
                    dayTotal: dailyActivity[bIdx]?.count || 0,
                    chartArea: chart.chartArea
                };
            }

            let masterT;
            if (securityHoverAnim.exiting) {
                const elapsed = now - securityHoverAnim.exitStartTime;
                const rawT = Math.min(elapsed / EXIT_DURATION, 1);
                masterT = 1 - easeOutQuart(rawT);
                securityHoverAnim.exitProgress = rawT;
                if (rawT >= 1) {
                    securityHoverAnim.active = false;
                    securityHoverAnim.exiting = false;
                    securityHoverAnim.snapshot = null;
                    return;
                }
            } else {
                const elapsed = now - securityHoverAnim.startTime;
                securityHoverAnim.progress = Math.min(elapsed / (LABEL_DELAY + LABEL_DURATION), 1);
                masterT = 1;
            }

            const ctx = chart.ctx;
            const { x, y, base, width, color, typeName, value, dayTotal, chartArea } = drawData;
            const height = Math.abs(base - y);
            const percentage = dayTotal > 0 ? Math.round((value / dayTotal) * 100) : 0;

            let popT, lineT, labelT;
            if (securityHoverAnim.exiting) {
                popT = lineT = labelT = masterT;
            } else {
                const elapsed = now - securityHoverAnim.startTime;
                popT = easeOutQuart(Math.min(Math.max(elapsed, 0) / POP_DURATION, 1));
                lineT = easeOutQuart(Math.min(Math.max(elapsed - LINE_DELAY, 0) / LINE_DURATION, 1));
                labelT = easeOutQuart(Math.min(Math.max(elapsed - LABEL_DELAY, 0) / LABEL_DURATION, 1));
            }

            const maxExtraW = 6;
            const maxExtraH = 4;
            const curExtraW = maxExtraW * popT;
            const curExtraH = maxExtraH * popT;
            const popWidth = width + curExtraW;
            const popHeight = height + curExtraH;
            const popX = x - popWidth / 2;
            const popY = y - (curExtraH / 2);

            ctx.save();
            ctx.globalAlpha = Math.max(popT, 0.01);
            ctx.shadowColor = `rgba(0, 0, 0, ${0.2 * popT})`;
            ctx.shadowBlur = 10 * popT;
            ctx.shadowOffsetY = 4 * popT;
            ctx.fillStyle = color;
            ctx.filter = `brightness(${1 + 0.1 * popT})`;
            ctx.beginPath();
            ctx.roundRect(popX, popY, popWidth, popHeight, 4);
            ctx.fill();
            ctx.restore();

            if (lineT > 0) {
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.globalAlpha = Math.min(lineT * 3, 1);
                const centerY = popY + popHeight / 2;
                const centerX = popX + popWidth / 2;
                const isRightSide = x > (chartArea.left + (chartArea.right - chartArea.left) / 2);

                const getStackTop = (idx) => {
                    let minTop = chartArea.bottom;
                    chart.data.datasets.forEach((ds, i) => {
                        const m = chart.getDatasetMeta(i);
                        if (m.hidden) return;
                        const el = m.data[idx];
                        if (el && !el.skip) {
                            const props = el.getProps(['y'], true);
                            if (props.y < minTop) minTop = props.y;
                        }
                    });
                    return minTop;
                };
                const currentStackTop = getStackTop(securityHoverAnim.barIndex);
                const neighborIdx = isRightSide ? securityHoverAnim.barIndex - 1 : securityHoverAnim.barIndex + 1;
                const neighborStackTop = (neighborIdx >= 0 && neighborIdx < dailyActivity.length) ? getStackTop(neighborIdx) : chartArea.bottom;
                const highestPeak = Math.min(currentStackTop, neighborStackTop);
                const safeY = Math.min(highestPeak - 15, centerY - 30);
                const reach = 30;
                const targetX = isRightSide ? centerX - reach : centerX + reach;

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                const t = lineT;
                const p0 = { x: centerX, y: centerY };
                const p1 = { x: centerX, y: safeY };
                const p2 = { x: targetX, y: safeY };
                const q0 = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
                const q1 = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
                const b = { x: q0.x + (q1.x - q0.x) * t, y: q0.y + (q1.y - q0.y) * t };
                ctx.quadraticCurveTo(q0.x, q0.y, b.x, b.y);
                ctx.stroke();
                ctx.restore();

                if (labelT > 0) {
                    ctx.save();
                    ctx.globalAlpha = labelT;
                    ctx.font = 'bold 11px "Manrope", sans-serif';
                    ctx.textBaseline = 'middle';
                    const labelText = `${typeName} ${percentage}%`;
                    const textMetrics = ctx.measureText(labelText);
                    const textWidth = textMetrics.width;
                    const boxPadding = 8;
                    const boxHeight = 24;
                    const boxWidth = textWidth + (boxPadding * 2);
                    const finalLabelY = safeY;
                    const boxX = isRightSide ? targetX - boxWidth : targetX;
                    const boxY = finalLabelY - (boxHeight / 2);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 3;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
                    ctx.beginPath();
                    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
                    ctx.fill();
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#4b5563';
                    ctx.textAlign = 'center';
                    ctx.fillText(labelText, boxX + (boxWidth / 2), finalLabelY);
                    ctx.restore();
                }
            }

            const animStillRunning = securityHoverAnim.exiting ? securityHoverAnim.exitProgress < 1 : securityHoverAnim.progress < 1;
            if (animStillRunning) {
                if (securityHoverAnim.rafId) cancelAnimationFrame(securityHoverAnim.rafId);
                securityHoverAnim.rafId = requestAnimationFrame(() => {
                    securityHoverAnim.rafId = null;
                    chart.draw();
                });
            }
        }
    };
}

function canPreviewFile(fname, hasContent, exceedsCap) {
    if (!fname || !hasContent || exceedsCap) return false;
    return /\.(pdf|csv|docx|png|jpe?g|txt|pptx|md|json|xlsx|py|js|ts|jsx|tsx|html|css|java|c|cpp|h|rb|go|rs|sh|sql|yml|yaml|xml|toml|swift|kt|cs|php|env)$/i.test(fname);
}

function renderFileEntry(file, incident) {
    const fname = file.name;
    const fHasContent = file.hasFileContent !== undefined ? file.hasFileContent : incident.hasFileContent;
    const fExceedsCap = file.exceedsCap !== undefined ? file.exceedsCap : incident.exceedsCap;
    const fId = file.id || incident.id;
    const previewable = canPreviewFile(fname, fHasContent, fExceedsCap);

    const exceedsCapIcon = fExceedsCap
        ? `<span class="exceeds-cap-tip" style="position:relative;display:inline-flex;vertical-align:middle;margin-left:4px;">
             <span class="material-symbols-outlined" style="font-size:15px;color:#9ca3af;cursor:pointer;">info</span>
             <span class="cap-tooltip">This file exceeded 5 MB and could not be displayed</span>
           </span>`
        : '';
    const unsupportedSourceIcon = (!fExceedsCap && incident.source && incident.source !== 'extension' && fname)
        ? `<span class="unsupported-source-tip" style="position:relative;display:inline-flex;vertical-align:middle;margin-left:4px;">
             <span class="material-symbols-outlined" style="font-size:15px;color:#9ca3af;cursor:pointer;">info</span>
             <span class="cap-tooltip">Steward AI does not yet support displaying files uploaded to desktop applications</span>
           </span>`
        : '';

    if (previewable) {
        return `<a href="#" class="text-ink text-xs break-all leading-snug underline hover:text-sage-700 cursor-pointer" data-preview-file="${escapeHtml(fId)}">${escapeHtml(fname)}</a>`;
    }
    return `<span class="text-ink text-xs break-all leading-snug">${escapeHtml(fname)}${exceedsCapIcon}${unsupportedSourceIcon}</span>`;
}

function renderSingleIncident(incident) {
    const displayType = escapeHtml(incident.type);

    // Use files array (normalized in loadSecurityFlags), fall back to legacy single-file
    const files = incident.files || [];

    // Legacy fallback: extract filename from description if no files
    let legacyFilename = incident.filename;
    if (!legacyFilename && incident.description && incident.description.startsWith('File uploaded: ')) {
        legacyFilename = incident.description.substring('File uploaded: '.length);
    }

    let fileCell;
    if (files.length === 0 && !legacyFilename) {
        fileCell = `<span class="text-ink-light text-xs">none</span>`;
    } else if (files.length <= 1) {
        // Single file — same as before
        const file = files[0] || { name: legacyFilename, hasFileContent: incident.hasFileContent, exceedsCap: incident.exceedsCap, id: incident.id };
        fileCell = renderFileEntry(file, incident);
    } else {
        // Multiple files — "Multiple files uploaded" trigger with animated dropdown
        const dropdownId = `multi-file-${incident.id}`;
        const dropdownItems = files.map(f => {
            const fId = f.id || incident.id;
            const fHasContent = f.hasFileContent !== undefined ? f.hasFileContent : incident.hasFileContent;
            const fExceedsCap = f.exceedsCap !== undefined ? f.exceedsCap : incident.exceedsCap;
            const previewable = canPreviewFile(f.name, fHasContent, fExceedsCap);
            const exceedsIcon = fExceedsCap ? '<span class="material-symbols-outlined" style="font-size:13px;color:#9ca3af;margin-left:4px;">info</span>' : '';
            if (previewable) {
                return `<a href="#" class="multi-file-item block px-3 py-1.5 text-xs text-ink break-all cursor-pointer hover:bg-gray-100 rounded transition-colors duration-100" data-preview-file="${escapeHtml(fId)}">${escapeHtml(f.name)}</a>`;
            }
            return `<div class="px-3 py-1.5 text-xs text-ink break-all">${escapeHtml(f.name)}${exceedsIcon}</div>`;
        }).join('');

        fileCell = `<div class="relative multi-file-container">
            <button class="multi-file-trigger multi-file-toggle inline-flex items-center gap-1 text-xs text-ink" data-dropdown="${dropdownId}">
                <span class="multi-file-label">Multiple files uploaded</span>
                <span class="material-symbols-outlined" style="font-size:14px;transition:transform 0.2s ease;">expand_more</span>
            </button>
            <div id="${dropdownId}" class="multi-file-dropdown absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-w-[300px] py-1">
                ${dropdownItems}
            </div>
        </div>`;
    }

    // Format date in user's local timezone
    let localDate = '';
    if (incident.createdAt) {
        try {
            const d = new Date(incident.createdAt);
            localDate = d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch (e) { /* ignore */ }
    }

    const categoryText = incident.mainCategory ? escapeHtml(incident.mainCategory) : '—';
    const subcategoryText = incident.subcategory ? escapeHtml(incident.subcategory) : '';
    const contextCell = subcategoryText
        ? `<div class="text-xs text-ink">${categoryText}</div><div class="text-[10px] text-ink-light leading-snug mt-0.5">${subcategoryText}</div>`
        : `<div class="text-xs text-ink">${categoryText}</div>`;

    const providerText = incident.agentProvider
        ? escapeHtml(incident.agentProvider.charAt(0).toUpperCase() + incident.agentProvider.slice(1))
        : '—';
    const modelText = incident.model ? escapeHtml(incident.model) : '';
    const modelCell = modelText
        ? `<div class="text-xs text-ink">${providerText}</div><div class="text-[10px] text-ink-light leading-snug mt-0.5">${modelText}</div>`
        : `<div class="text-xs text-ink">${providerText}</div>`;

    return `
        <tr class="border-b border-parchment-200 group hover:bg-parchment-50 transition-colors">
            <td class="py-4 text-ink-light text-xs">${escapeHtml(incident.userName)}</td>
            <td class="py-4">${contextCell}</td>
            <td class="py-4">${modelCell}</td>
            <td class="py-4 font-medium text-ink text-xs">${displayType}</td>
            <td class="py-4 max-w-[160px] overflow-visible">${fileCell}</td>
            <td class="py-4 text-ink-light text-xs">
                <div>${localDate}</div>
            </td>
        </tr>
    `;
}

function stripFlagIdSuffix(flagId) {
    // "abc_file" → "abc", "abc_0" → "abc", "abc_1" → "abc", plain "abc" stays
    return flagId.replace(/_(file|\d+)$/, '');
}

// Decode a base64 string to a Uint8Array (binary bytes)
function base64ToUint8Array(base64Str) {
    const byteChars = atob(base64Str);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    return bytes;
}

// Decode a base64 string to UTF-8 text
function base64ToText(base64Str) {
    return new TextDecoder('utf-8').decode(base64ToUint8Array(base64Str));
}

// Detect actual file type from base64 content magic bytes
async function detectActualFileType(cleanBase64) {
    try {
        const bytes = base64ToUint8Array(cleanBase64.substring(0, 16)).slice(0, 4);

        // PDF: %PDF
        if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
        // ZIP-based Office docs: PK
        if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            // Peek inside ZIP to distinguish DOCX/PPTX/XLSX
            const fullBytes = base64ToUint8Array(cleanBase64);
            const zip = await JSZip.loadAsync(fullBytes.buffer);
            if (zip.file('word/document.xml')) return 'docx';
            if (zip.file('ppt/presentation.xml')) return 'pptx';
            if (zip.file('xl/workbook.xml')) return 'xlsx';
            return 'unknown-zip';
        }
        // Images
        if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'jpeg';
    } catch (e) { /* fall through to filename-based */ }
    return null; // null = use filename-based detection
}

async function handleFilePreview(fileId, initialFilename) {
    const promptId = stripFlagIdSuffix(fileId);

    // Create modal overlay immediately to show loading state
    const overlay = document.createElement('div');
    overlay.id = 'filePreviewModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease-out;backdrop-filter:blur(2px);';

    // Added a style tag just for the spinner if not exists
    if (!document.getElementById('pdfPreviewSpinnerStyle')) {
        const style = document.createElement('style');
        style.id = 'pdfPreviewSpinnerStyle';
        style.innerHTML = `@keyframes pdf-spin { 100% { transform:rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    overlay.innerHTML = `
        <div id="pdfModalContent" style="background:#fff;border-radius:12px;width:90vw;height:90vh;max-width:1000px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.25);transform:scale(0.95);transition:transform 0.2s ease-out;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #e5e5e5;background:#fafafa;">
                <span id="previewFilename" style="font-size:14px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(initialFilename || 'Loading...')}</span>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span id="stylingInfoBadge" style="display:none;align-items:center;gap:4px;font-size:12px;color:#6b7280;background:#f3f4f6;padding:4px 10px;border-radius:6px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">info</span>
                        Styling not included
                    </span>
                    <button id="downloadPdfBtn" style="display:none;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:6px;color:#4b5563;align-items:center;gap:6px;font-size:13px;font-weight:500;transition:background 0.15s;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background='none'">
                        <span class="material-symbols-outlined" style="font-size:18px;">download</span> Download
                    </button>
                    <button id="printPdfBtn" style="display:none;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:6px;color:#4b5563;align-items:center;gap:6px;font-size:13px;font-weight:500;transition:background 0.15s;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background='none'">
                        <span class="material-symbols-outlined" style="font-size:18px;">print</span> Print
                    </button>
                    <div style="width:1px;height:24px;background:#e5e5e5;margin:0 4px;"></div>
                    <button id="closeFilePreview" style="background:none;border:none;cursor:pointer;padding:6px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background='none'">
                        <span class="material-symbols-outlined" style="font-size:22px;color:#666;">close</span>
                    </button>
                </div>
            </div>
            <div id="previewContentArea" style="flex:1;overflow:hidden;position:relative;background:#e5e7eb;">
                <div id="previewLoadingState" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#6b7280;background-color:#f9fafb;">
                    <span class="material-symbols-outlined" style="font-size:32px;animation:pdf-spin 1s linear infinite;margin-bottom:12px;">progress_activity</span>
                    <span id="previewLoadingText" style="font-size:14px;font-weight:500;">Loading Document...</span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let blobUrl = null;

    const close = () => {
        overlay.style.opacity = '0';
        const content = overlay.querySelector('#pdfModalContent');
        if (content) content.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            overlay.remove();
        }, 200);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    const onEsc = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', onEsc);
        }
    };
    document.addEventListener('keydown', onEsc);
    overlay.querySelector('#closeFilePreview').addEventListener('click', close);

    // Trigger open animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        const content = overlay.querySelector('#pdfModalContent');
        if (content) content.style.transform = 'scale(1)';
    });

    try {
        const result = await window.electronAPI.getSecurityFlagFileContent(promptId);

        if (!result || !result.fileContent || result.fileContent === '[CONTENT_EXCEEDS_CAP]') {
            document.getElementById('previewLoadingText').textContent = 'Could not load file preview — no content available';
            const icon = document.getElementById('previewLoadingState').querySelector('.material-symbols-outlined');
            icon.textContent = 'error';
            icon.style.animation = 'none';
            document.getElementById('previewLoadingState').style.color = '#ef4444';
            return;
        }

        const actualFilename = result.filename || initialFilename || 'file';
        document.getElementById('previewFilename').textContent = escapeHtml(actualFilename);

        try {
            const base64Content = result.fileContent;
            const cleanBase64 = base64Content.includes(',') ? base64Content.split(',')[1] : base64Content;

            // Defense-in-depth: detect actual content type from magic bytes
            const detectedType = await detectActualFileType(cleanBase64);

            const isPptxFile = detectedType === 'pptx' || (!detectedType && actualFilename.toLowerCase().endsWith('.pptx'));
            const isDocxFile = detectedType === 'docx' || (!detectedType && actualFilename.toLowerCase().endsWith('.docx'));
            const isXlsxFile = detectedType === 'xlsx' || (!detectedType && actualFilename.toLowerCase().endsWith('.xlsx'));
            const imageMatch = (detectedType === 'png' || detectedType === 'jpeg')
                ? [null, detectedType === 'png' ? 'png' : 'jpg']
                : (!detectedType ? actualFilename.toLowerCase().match(/\.(png|jpe?g)$/) : null);
            const isCsvFile = !detectedType && actualFilename.toLowerCase().endsWith('.csv');
            const isTxtFile = !detectedType && actualFilename.toLowerCase().endsWith('.txt');
            const isMdFile = !detectedType && actualFilename.toLowerCase().endsWith('.md');

            if (isPptxFile) {
                const bytes = base64ToUint8Array(cleanBase64);
                const zip = await JSZip.loadAsync(bytes.buffer);

                // Find all slide files and sort numerically
                const slideFiles = Object.keys(zip.files)
                    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
                    .sort((a, b) => {
                        const numA = parseInt(a.match(/slide(\d+)/)[1]);
                        const numB = parseInt(b.match(/slide(\d+)/)[1]);
                        return numA - numB;
                    });

                // Extract text and images from each slide's XML
                const slides = [];
                for (const slidePath of slideFiles) {
                    const slideName = slidePath.split('/').pop(); // slide1.xml
                    const relsPath = `ppt/slides/_rels/${slideName}.rels`;

                    const relsXmlFile = zip.file(relsPath);
                    const mediaMap = {}; // Maps rId -> blob url

                    if (relsXmlFile) {
                        try {
                            const relsXml = await relsXmlFile.async('string');
                            const parser = new DOMParser();
                            const relsDoc = parser.parseFromString(relsXml, 'application/xml');
                            const rels = relsDoc.getElementsByTagNameNS('*', 'Relationship');

                            for (let i = 0; i < rels.length; i++) {
                                const id = rels[i].getAttribute('Id');
                                const target = rels[i].getAttribute('Target');
                                if (target && target.includes('media/')) {
                                    // target is usually "../media/image1.jpeg"
                                    const mediaFilename = target.split('/').pop();
                                    const mediaPath = `ppt/media/${mediaFilename}`;
                                    const mediaFile = zip.file(mediaPath);
                                    if (mediaFile) {
                                        const mediaBytes = await mediaFile.async('uint8array');
                                        let mime = 'image/jpeg';
                                        if (mediaFilename.toLowerCase().endsWith('.png')) mime = 'image/png';
                                        if (mediaFilename.toLowerCase().endsWith('.gif')) mime = 'image/gif';
                                        if (mediaFilename.toLowerCase().endsWith('.svg')) mime = 'image/svg+xml';
                                        const blob = new Blob([mediaBytes], { type: mime });
                                        mediaMap[id] = URL.createObjectURL(blob);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[Security] Failed to parse slide relations:', e);
                        }
                    }

                    const xml = await zip.file(slidePath).async('string');
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xml, 'application/xml');

                    // Group text by paragraph (<a:p> boundaries)
                    const pNodes = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'p');
                    const paragraphs = [];
                    for (let i = 0; i < pNodes.length; i++) {
                        const tNodes = pNodes[i].getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't');
                        let pText = '';
                        for (let j = 0; j < tNodes.length; j++) pText += tNodes[j].textContent;
                        if (pText.trim()) paragraphs.push(pText.trim());
                    }

                    // Find all images in this slide
                    const picNodes = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'pic');
                    const images = [];
                    for (let i = 0; i < picNodes.length; i++) {
                        const blipNode = picNodes[i].getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
                        if (blipNode) {
                            const embedId = blipNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blipNode.getAttribute('r:embed');
                            if (embedId && mediaMap[embedId]) {
                                images.push(mediaMap[embedId]);
                            }
                        }
                    }

                    slides.push({ paragraphs, images });
                }

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');

                const slidesHtml = slides.map((slideData, idx) => {
                    const title = slideData.paragraphs[0] || '';
                    const bodyPoints = slideData.paragraphs.slice(1);
                    const images = slideData.images;

                    let bodyHtml = '';
                    if (bodyPoints.length > 0) {
                        bodyHtml = `<ul style="list-style-type:disc;padding-left:20px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
                            ${bodyPoints.map(p => `<li style="font-size:15px;color:#374151;line-height:1.4;">${escapeHtml(p)}</li>`).join('')}
                        </ul>`;
                    }

                    let imagesHtml = '';
                    if (images.length > 0) {
                        imagesHtml = `<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:center;width:100%;height:100%;padding:12px;background:#f9fafb;border-radius:8px;border:1px dashed #d1d5db;">
                            ${images.map(src => `<img src="${src}" style="max-height:100%;max-width:100%;object-fit:contain;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1);" />`).join('')}
                        </div>`;
                    }

                    // Slide deck layout with 16:9 ratio
                    return `
                        <div style="margin-bottom:40px;display:flex;flex-direction:column;">
                            <!-- Slide Number Tag -->
                            <div style="align-self:flex-start;background:#e5e7eb;color:#6b7280;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:12px;margin-left:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #d1d5db;">Slide ${idx + 1}</div>
                            
                            <!-- Slide Canvas (16:9 Aspect Ratio) -->
                            <div style="background:#fff;width:100%;aspect-ratio:16/9;border-radius:12px;box-shadow:0 8px 20px -4px rgba(0,0,0,0.1), 0 4px 10px -2px rgba(0,0,0,0.05);border:1px solid #e5e7eb;padding:40px 56px;display:flex;flex-direction:column;overflow:hidden;position:relative;">
                                
                                <!-- Title -->
                                ${title ? `<h1 style="font-size:26px;font-weight:700;color:#111827;text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f3f4f6;font-family:-apple-system, BlinkMacSystemFont, sans-serif;">${escapeHtml(title)}</h1>` : ''}
                                
                                <!-- Content Body -->
                                <div style="display:flex;flex:1;gap:32px;overflow:hidden;">
                                    ${bodyHtml ? `<div style="flex:${imagesHtml ? '1' : '1'};overflow-y:auto;padding-right:12px;font-family:-apple-system, BlinkMacSystemFont, sans-serif;">${bodyHtml}</div>` : ''}
                                    ${imagesHtml ? `<div style="flex:1;display:flex;justify-content:center;align-items:center;overflow:hidden;">${imagesHtml}</div>` : ''}
                                </div>
                                
                            </div>
                        </div>
                    `;
                }).join('');

                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#f3f4f6;padding:40px 48px;">
                    <div style="max-width:860px;margin:0 auto;display:flex;flex-direction:column;">
                        ${slidesHtml}
                    </div>
                </div>`;

                const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };

                const infoBadge = document.getElementById('stylingInfoBadge');
                if (infoBadge) infoBadge.style.display = 'flex';
            } else if (isMdFile) {
                const mdText = base64ToText(cleanBase64);

                // Basic markdown → HTML conversion
                const mdToHtml = (md) => {
                    let html = escapeHtml(md);
                    // Code blocks (``` ... ```)
                    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f3f4f6;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:12px;line-height:1.5;font-family:\'SF Mono\',SFMono-Regular,Consolas,monospace;">$2</pre>');
                    // Inline code
                    html = html.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:2px 5px;border-radius:3px;font-size:12px;font-family:\'SF Mono\',SFMono-Regular,Consolas,monospace;">$1</code>');
                    // Headers
                    html = html.replace(/^#{3}\s+(.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:18px 0 8px;color:#111827;">$1</h3>');
                    html = html.replace(/^#{2}\s+(.+)$/gm, '<h2 style="font-size:18px;font-weight:600;margin:20px 0 8px;color:#111827;">$1</h2>');
                    html = html.replace(/^#{1}\s+(.+)$/gm, '<h1 style="font-size:22px;font-weight:700;margin:24px 0 10px;color:#111827;">$1</h1>');
                    // Bold and italic
                    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
                    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
                    // Unordered lists
                    html = html.replace(/^[-*]\s+(.+)$/gm, '<li style="margin:2px 0;margin-left:20px;list-style:disc;">$1</li>');
                    // Ordered lists
                    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:2px 0;margin-left:20px;list-style:decimal;">$1</li>');
                    // Horizontal rules
                    html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #d1d5db;margin:16px 0;">');
                    // Links
                    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                        if (/^https?:\/\//i.test(url)) {
                            return `<a href="${url}" style="color:#2563eb;text-decoration:underline;" target="_blank" rel="noopener">${text}</a>`;
                        }
                        return text;
                    });
                    // Line breaks → paragraphs
                    html = html.replace(/\n\n+/g, '</p><p style="margin:0 0 10px;">');
                    html = html.replace(/\n/g, '<br>');
                    html = '<p style="margin:0 0 10px;">' + html + '</p>';
                    return html;
                };

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#fff;padding:32px 40px;">
                    <div style="max-width:720px;margin:0 auto;font-size:14px;line-height:1.7;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${mdToHtml(mdText)}</div>
                </div>`;

                const blob = new Blob([mdText], { type: 'text/markdown' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (!detectedType && actualFilename.toLowerCase().endsWith('.json')) {
                const jsonText = base64ToText(cleanBase64);

                // Pretty-print and syntax highlight
                let formatted;
                try { formatted = JSON.stringify(JSON.parse(jsonText), null, 2); }
                catch { formatted = jsonText; }

                const highlighted = escapeHtml(formatted)
                    .replace(/"([^"]+)"(?=\s*:)/g, '<span style="color:#881391;">"$1"</span>')       // keys
                    .replace(/:\s*"([^"]*?)"/g, ': <span style="color:#0451a5;">"$1"</span>')         // string values
                    .replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:#098658;">$1</span>')           // numbers
                    .replace(/:\s*(true|false)/g, ': <span style="color:#0000ff;">$1</span>')          // booleans
                    .replace(/:\s*(null)/g, ': <span style="color:#6b7280;">$1</span>');               // null

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#fff;padding:24px 32px;">
                    <pre style="max-width:720px;margin:0 auto;font-size:13px;line-height:1.5;font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;white-space:pre-wrap;word-wrap:break-word;">${highlighted}</pre>
                </div>`;

                const blob = new Blob([formatted], { type: 'application/json' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (!detectedType && /\.(py|js|ts|jsx|tsx|html|css|java|c|cpp|h|rb|go|rs|sh|sql|yml|yaml|xml|toml|swift|kt|cs|php|env)$/i.test(actualFilename)) {
                const codeText = base64ToText(cleanBase64);

                const lines = codeText.split('\n');
                const gutterWidth = String(lines.length).length;

                // Basic syntax highlighting
                const highlightLine = (line) => {
                    let h = escapeHtml(line);
                    // Comments (# // /* -- )
                    h = h.replace(/^(\s*)(#.*)$/, '$1<span style="color:#6a737d;">$2</span>');
                    h = h.replace(/^(\s*)(\/\/.*)$/, '$1<span style="color:#6a737d;">$2</span>');
                    // Strings
                    h = h.replace(/(&#x27;&#x27;&#x27;[\s\S]*?&#x27;&#x27;&#x27;|&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;)/g, '<span style="color:#0451a5;">$1</span>');
                    h = h.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, '<span style="color:#0451a5;">$1</span>');
                    h = h.replace(/(&#x27;(?:[^&]|&(?!#x27;))*?&#x27;)/g, '<span style="color:#0451a5;">$1</span>');
                    // Keywords
                    h = h.replace(/\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|yield|async|await|raise|pass|break|continue|lambda|in|not|and|or|is|None|True|False|self|function|const|let|var|new|this|export|default|switch|case|throw|catch|typeof|instanceof|void|public|private|static|final|struct|impl|fn|use|mod|pub|func|package|defer|select|interface|enum)\b/g, '<span style="color:#d73a49;">$1</span>');
                    // Numbers
                    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#098658;">$1</span>');
                    return h;
                };

                const linesHtml = lines.map((line, idx) => {
                    const num = String(idx + 1).padStart(gutterWidth, ' ');
                    return `<tr><td style="padding:0 16px 0 0;text-align:right;color:#9ca3af;user-select:none;white-space:pre;font-size:12px;">${num}</td><td style="white-space:pre;font-size:13px;">${highlightLine(line)}</td></tr>`;
                }).join('');

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#fafbfc;padding:16px 24px;">
                    <table style="border-collapse:collapse;font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;line-height:1.5;">
                        <tbody>${linesHtml}</tbody>
                    </table>
                </div>`;

                const blob = new Blob([codeText], { type: 'text/plain' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (isTxtFile) {
                const text = base64ToText(cleanBase64);

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#fff;padding:32px 40px;">
                    <pre style="max-width:720px;margin:0 auto;font-size:13px;line-height:1.6;color:#1f2937;font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(text)}</pre>
                </div>`;

                const blob = new Blob([text], { type: 'text/plain' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (imageMatch) {
                const bytes = base64ToUint8Array(cleanBase64);
                const mimeType = imageMatch[1] === 'png' ? 'image/png' : 'image/jpeg';
                const blob = new Blob([bytes], { type: mimeType });
                blobUrl = URL.createObjectURL(blob);

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f3f4f6;padding:24px;">
                    <img src="${blobUrl}" alt="${escapeHtml(actualFilename)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
                </div>`;

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (isDocxFile) {
                const bytes = base64ToUint8Array(cleanBase64);
                const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                
                // Mount point for docx-preview
                contentArea.innerHTML = `<div id="docx-wrapper" style="width:100%;height:100%;overflow:auto;background:#f3f4f6;padding:32px 40px;"></div>`;
                const wrapper = document.getElementById('docx-wrapper');

                try {
                    // docx-preview renderer
                    await docx.renderAsync(blob, wrapper, null, {
                        className: 'docx-preview-container',
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        useBase64URL: true
                    });
                    
                    // Add some base styling to the generated container to make it look like a page
                    const sections = wrapper.querySelectorAll('.docx-preview-container');
                    sections.forEach(sec => {
                        sec.style.background = '#fff';
                        sec.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                        sec.style.margin = '0 auto 20px auto';
                        sec.style.borderRadius = '4px';
                    });
                } catch (e) {
                    console.error('[Security] Error rendering DOCX via docx-preview:', e);
                    wrapper.innerHTML = `<div class="p-8 text-center text-red-600">Failed to render DOCX document. The file may be unsupported or corrupted.</div>`;
                }

                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (isCsvFile) {
                const csvText = base64ToText(cleanBase64);

                // Parse CSV rows (handles quoted fields with commas)
                const parseCsvRow = (line) => {
                    const cells = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const ch = line[i];
                        if (inQuotes) {
                            if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
                            else if (ch === '"') { inQuotes = false; }
                            else { current += ch; }
                        } else {
                            if (ch === '"') { inQuotes = true; }
                            else if (ch === ',') { cells.push(current.trim()); current = ''; }
                            else { current += ch; }
                        }
                    }
                    cells.push(current.trim());
                    return cells;
                };

                const rows = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
                const headerCells = rows.length > 0 ? parseCsvRow(rows[0]) : [];
                const bodyRows = rows.slice(1).map(parseCsvRow);

                const theadHtml = headerCells.map(h => `<th style="padding:8px 14px;text-align:left;font-weight:600;font-size:12px;color:#374151;border-bottom:2px solid #d1d5db;background:#f3f4f6;white-space:nowrap;">${escapeHtml(h)}</th>`).join('');
                const tbodyHtml = bodyRows.map((row, idx) => {
                    const bg = idx % 2 === 0 ? '#fff' : '#f9fafb';
                    return `<tr style="background:${bg};">${row.map(cell => `<td style="padding:6px 14px;font-size:12px;color:#4b5563;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(cell)}</td>`).join('')}</tr>`;
                }).join('');

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<div style="width:100%;height:100%;overflow:auto;background:#fff;">
                    <table style="border-collapse:collapse;width:max-content;min-width:100%;">
                        <thead><tr>${theadHtml}</tr></thead>
                        <tbody>${tbodyHtml}</tbody>
                    </table>
                </div>`;

                const blob = new Blob([csvText], { type: 'text/csv' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else if (isXlsxFile) {
                const bytes = base64ToUint8Array(cleanBase64);
                const zip = await JSZip.loadAsync(bytes.buffer);
                const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
                const parser = new DOMParser();

                // Parse shared strings
                const sharedStrings = [];
                const ssFile = zip.file('xl/sharedStrings.xml');
                if (ssFile) {
                    const ssXml = await ssFile.async('string');
                    const ssDoc = parser.parseFromString(ssXml, 'application/xml');
                    const siNodes = ssDoc.getElementsByTagNameNS(ns, 'si');
                    for (let i = 0; i < siNodes.length; i++) {
                        const tNodes = siNodes[i].getElementsByTagNameNS(ns, 't');
                        let text = '';
                        for (let j = 0; j < tNodes.length; j++) text += tNodes[j].textContent;
                        sharedStrings.push(text);
                    }
                }

                // 1) Read workbook.xml to get sheet names and relationship IDs
                const wbFile = zip.file('xl/workbook.xml');
                const relsFile = zip.file('xl/_rels/workbook.xml.rels');

                if (!wbFile) throw new Error('No workbook.xml found');

                const wbXml = await wbFile.async('string');
                const wbDoc = parser.parseFromString(wbXml, 'application/xml');
                const sheetNodes = wbDoc.getElementsByTagNameNS(ns, 'sheet');

                // 2) Read workbook.xml.rels to map relationship IDs to file paths
                const relsMap = {};
                if (relsFile) {
                    const relsXml = await relsFile.async('string');
                    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
                    const relNodes = relsDoc.getElementsByTagNameNS('*', 'Relationship'); // Using wildcard namespace to be safe
                    for (let i = 0; i < relNodes.length; i++) {
                        const id = relNodes[i].getAttribute('Id');
                        const target = relNodes[i].getAttribute('Target');
                        if (id && target) {
                            // Target might be relative like "worksheets/sheet1.xml"
                            relsMap[id] = target.startsWith('/') ? target.substring(1) : target;
                        }
                    }
                }

                // Convert column letter to index (A=0, B=1, ..., AA=26, etc.)
                const colToIdx = (col) => {
                    let idx = 0;
                    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
                    return idx - 1;
                };

                const parsedSheets = [];

                for (let i = 0; i < sheetNodes.length; i++) {
                    const sheetName = sheetNodes[i].getAttribute('name');
                    // In OpenXML it can be r:id, handle appropriately
                    let rId = sheetNodes[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
                        || sheetNodes[i].getAttribute('r:id');

                    if (!rId) continue;

                    let targetPath = relsMap[rId];
                    if (!targetPath) continue;

                    // Normalize path relative to zip root
                    if (!targetPath.startsWith('xl/')) {
                        // Usually it's in xl/worksheets/
                        targetPath = `xl/${targetPath}`;
                    }

                    const sheetFile = zip.file(targetPath);
                    if (!sheetFile) continue;

                    const sheetXml = await sheetFile.async('string');
                    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
                    const rowNodes = sheetDoc.getElementsByTagNameNS(ns, 'row');

                    const rows = [];
                    let maxCol = 0;
                    for (let r = 0; r < rowNodes.length; r++) {
                        const cells = rowNodes[r].getElementsByTagNameNS(ns, 'c');
                        const row = [];

                        // Handle empty rows
                        const rAttr = rowNodes[r].getAttribute('r');
                        const rowIndex = rAttr ? parseInt(rAttr) - 1 : r; // 0-indexed

                        for (let c = 0; c < cells.length; c++) {
                            const ref = cells[c].getAttribute('r');
                            if (!ref) continue;
                            const colLetter = ref.replace(/\d+/g, '');
                            const colIdx = colToIdx(colLetter);
                            if (colIdx > maxCol) maxCol = colIdx;
                            const vNode = cells[c].getElementsByTagNameNS(ns, 'v')[0];
                            let val = vNode ? vNode.textContent : '';
                            // Type 's' = shared string
                            if (cells[c].getAttribute('t') === 's' && sharedStrings[parseInt(val)] !== undefined) {
                                val = sharedStrings[parseInt(val)];
                            }
                            row[colIdx] = val;
                        }
                        rows[rowIndex] = row;
                    }

                    // Fill missing rows up to length and normalize lengths
                    for (let r = 0; r < rows.length; r++) {
                        if (!rows[r]) rows[r] = [];
                        for (let c = 0; c <= maxCol; c++) {
                            if (rows[r][c] === undefined) rows[r][c] = '';
                        }
                    }

                    parsedSheets.push({
                        name: sheetName,
                        rows: rows
                    });
                }

                if (parsedSheets.length === 0) throw new Error('No sheets found or parsed successfully');

                document.getElementById('previewLoadingState').style.display = 'none';
                const contentArea = document.getElementById('previewContentArea');

                // Inject switchTab function globally if not exists
                if (!window.switchXlsxTab) {
                    window.switchXlsxTab = function (idx, total) {
                        for (let i = 0; i < total; i++) {
                            const btn = document.getElementById(`xlsx-tab-${i}`);
                            const content = document.getElementById(`xlsx-content-${i}`);
                            if (!btn || !content) continue;

                            if (i === idx) {
                                btn.style.color = '#2563eb';
                                btn.style.borderBottomColor = '#2563eb';
                                content.style.display = 'block';
                            } else {
                                btn.style.color = '#6b7280';
                                btn.style.borderBottomColor = 'transparent';
                                content.style.display = 'none';
                            }
                        }
                    };
                }

                const tabsHtml = parsedSheets.map((sheet, idx) => {
                    const isActive = idx === 0;
                    return `
                        <button id="xlsx-tab-${idx}" 
                                onclick="switchXlsxTab(${idx}, ${parsedSheets.length})"
                                style="padding:10px 16px;font-size:13px;font-weight:600;background:transparent;border:none;border-bottom:2px solid ${isActive ? '#2563eb' : 'transparent'};color:${isActive ? '#2563eb' : '#6b7280'};cursor:pointer;white-space:nowrap;transition:all 0.15s ease;">
                            ${escapeHtml(sheet.name)}
                        </button>
                    `;
                }).join('');

                const contentHtml = parsedSheets.map((sheet, idx) => {
                    const headerCells = sheet.rows.length > 0 ? sheet.rows[0] : [];
                    const bodyRows = sheet.rows.slice(1);

                    const theadHtml = headerCells.map(h => `<th style="padding:8px 14px;text-align:left;font-weight:600;font-size:12px;color:#374151;border-bottom:2px solid #d1d5db;background:#f3f4f6;white-space:nowrap;border-right:1px solid #e5e7eb;">${escapeHtml(h)}</th>`).join('');
                    const tbodyHtml = bodyRows.map((row, rIdx) => {
                        const bg = rIdx % 2 === 0 ? '#fff' : '#f9fafb';
                        return `<tr style="background:${bg};">${row.map(cell => `<td style="padding:6px 14px;font-size:12px;color:#4b5563;border-bottom:1px solid #e5e7eb;white-space:nowrap;border-right:1px solid #e5e7eb;">${escapeHtml(cell)}</td>`).join('')}</tr>`;
                    }).join('');

                    return `
                        <div id="xlsx-content-${idx}" style="display:${idx === 0 ? 'block' : 'none'};width:100%;height:100%;overflow:auto;background:#fff;">
                            <table style="border-collapse:collapse;width:max-content;min-width:100%;">
                                <thead><tr>${theadHtml}</tr></thead>
                                <tbody>${tbodyHtml}</tbody>
                            </table>
                        </div>
                    `;
                }).join('');

                contentArea.innerHTML += `
                    <div style="display:flex;flex-direction:column;width:100%;height:100%;background:#fff;">
                        <div style="display:flex;overflow-x:auto;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0;">
                            ${tabsHtml}
                        </div>
                        <div style="flex:1;overflow:hidden;position:relative;">
                            ${contentHtml}
                        </div>
                    </div>
                `;

                const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                blobUrl = URL.createObjectURL(blob);

                const downloadBtn = document.getElementById('downloadPdfBtn');
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };
            } else {
                // PDF rendering (default fallback only when content type is unknown)
                const blob = new Blob([base64ToUint8Array(cleanBase64)], { type: 'application/pdf' });
                blobUrl = URL.createObjectURL(blob);

                document.getElementById('previewLoadingState').style.display = 'none';

                const contentArea = document.getElementById('previewContentArea');
                contentArea.innerHTML += `<iframe id="pdfIframe" src="${blobUrl}#toolbar=0" style="width:100%;height:100%;border:none;background:transparent;"></iframe>`;

                const downloadBtn = document.getElementById('downloadPdfBtn');
                const printBtn = document.getElementById('printPdfBtn');
                downloadBtn.style.display = 'flex';
                printBtn.style.display = 'flex';

                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = actualFilename;
                    a.click();
                };

                printBtn.onclick = () => {
                    const iframe = document.getElementById('pdfIframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    }
                };
            }
        } catch (renderErr) {
            console.error('[Security] Failed to render file preview:', renderErr);
            document.getElementById('previewLoadingText').textContent = 'Failed to render file — the data may be corrupted';
            const icon = document.getElementById('previewLoadingState').querySelector('.material-symbols-outlined');
            icon.textContent = 'broken_image';
            icon.style.animation = 'none';
            document.getElementById('previewLoadingState').style.color = '#ef4444';
        }
    } catch (err) {
        console.error('[Security] Failed to fetch file content:', err);
        document.getElementById('previewLoadingText').textContent = 'Failed to load file preview';
        const icon = document.getElementById('previewLoadingState').querySelector('.material-symbols-outlined');
        icon.textContent = 'error';
        icon.style.animation = 'none';
        document.getElementById('previewLoadingState').style.color = '#ef4444';
    }
}

function renderIncidents() {
    const tbody = document.getElementById('incidentsTableBody');
    const emptyState = document.getElementById('incidentsEmptyState');
    const paginationContainer = document.getElementById('incidentsPagination');
    if (!tbody) return;

    // Skip re-render if user is hovering over an exceeds-cap tooltip
    // — the innerHTML swap would destroy the tooltip mid-hover.
    // Data is still updated in state; next render cycle will catch up.
    if (tbody.querySelector('.exceeds-cap-tip:hover, .unsupported-source-tip:hover, .multi-file-dropdown.open')) return;

    const filtered = getFilteredIncidents();

    if (filtered.length === 0) {
        const hasActiveFilters = Object.values(state.filters).some(v => v !== null);
        const msg = hasActiveFilters ? 'No incidents match the current filters' : 'No incidents found';
        tbody.innerHTML = '';
        if (emptyState) {
            emptyState.querySelector('p').textContent = msg;
            emptyState.classList.remove('hidden');
        }
        if (paginationContainer) paginationContainer.classList.add('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const totalPages = Math.ceil(filtered.length / state.incidentPageSize);
    state.incidentPage = Math.min(state.incidentPage, Math.max(0, totalPages - 1));

    const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const startIdx = state.incidentPage * state.incidentPageSize;
    const paginatedItems = sorted.slice(startIdx, startIdx + state.incidentPageSize);

    tbody.innerHTML = paginatedItems.map(incident => renderSingleIncident(incident)).join('');

    // Attach file preview click handlers
    tbody.querySelectorAll('[data-preview-file]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const fileId = link.getAttribute('data-preview-file');
            const filename = link.textContent.trim();
            handleFilePreview(fileId, filename);
        });
    });

    // Attach multi-file dropdown toggle handlers
    tbody.querySelectorAll('.multi-file-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdownId = btn.getAttribute('data-dropdown');
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown) return;
            // Close any other open dropdowns first
            document.querySelectorAll('.multi-file-dropdown.open').forEach(d => {
                if (d.id !== dropdownId) d.classList.remove('open');
            });
            dropdown.classList.toggle('open');
            const arrow = btn.querySelector('.material-symbols-outlined');
            if (arrow) {
                arrow.style.transform = dropdown.classList.contains('open') ? 'rotate(180deg)' : '';
            }
        });
    });

    // Render Pagination Controls
    if (paginationContainer) {
        if (totalPages > 1) {
            paginationContainer.classList.remove('hidden');
            paginationContainer.classList.add('flex');

            const startItem = startIdx + 1;
            const endItem = Math.min(startIdx + state.incidentPageSize, filtered.length);

            paginationContainer.innerHTML = `
                <div class="text-xs text-slate-500">
                    Showing <span class="font-medium text-slate-700">${startItem}-${endItem}</span> of <span class="font-medium text-slate-700">${filtered.length}</span>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="setIncidentPage(-1)"
                            class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-parchment-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            ${state.incidentPage === 0 ? 'disabled' : ''}>
                        <span class="material-symbols-outlined text-lg">chevron_left</span>
                    </button>
                    <span class="text-xs font-medium text-slate-600 px-2 border-r border-parchment-200">
                        Page ${state.incidentPage + 1} of ${totalPages}
                    </span>
                    <button onclick="setIncidentPage(1)"
                            class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-parchment-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors ml-1"
                            ${state.incidentPage === totalPages - 1 ? 'disabled' : ''}>
                        <span class="material-symbols-outlined text-lg">chevron_right</span>
                    </button>
                </div>
            `;
        } else {
            paginationContainer.classList.add('hidden');
            paginationContainer.classList.remove('flex');
        }
    }
}

function setIncidentPage(delta) {
    state.incidentPage = Math.max(0, state.incidentPage + delta);
    renderIncidents();
}

// ============================================
// Filter Dropdown Logic
// ============================================

function toggleFilterDropdown(name) {
    if (state.activeDropdown === name) {
        closeAllFilterDropdowns();
        return;
    }
    closeAllFilterDropdowns();
    const dropdown = document.getElementById(`filterDropdown-${name}`);
    if (!dropdown) return;
    populateFilterDropdown(name, dropdown);
    dropdown.classList.remove('hidden');
    state.activeDropdown = name;
}

function closeAllFilterDropdowns() {
    ['type', 'user'].forEach(name => {
        const dd = document.getElementById(`filterDropdown-${name}`);
        if (dd) dd.classList.add('hidden');
    });
    state.activeDropdown = null;
}

document.addEventListener('click', (e) => {
    // Close filter dropdowns
    if (state.activeDropdown) {
        const isFilterBtn = e.target.closest('.filter-dropdown-btn');
        const isDropdown = e.target.closest('[id^="filterDropdown-"]');
        if (!isFilterBtn && !isDropdown) {
            closeAllFilterDropdowns();
        }
    }
    // Close multi-file dropdowns when clicking outside
    if (!e.target.closest('.multi-file-container')) {
        document.querySelectorAll('.multi-file-dropdown.open').forEach(d => {
            d.classList.remove('open');
            const container = d.closest('.multi-file-container');
            if (container) {
                const arrow = container.querySelector('.multi-file-toggle .material-symbols-outlined');
                if (arrow) arrow.style.transform = '';
            }
        });
    }
});

function getUniqueValues(field) {
    const values = new Set();
    state.incidents.forEach(i => {
        if (i[field]) values.add(i[field]);
    });
    return [...values].sort();
}

const DATE_RANGE_OPTIONS = [
    { label: 'All Time', preset: 'all', days: null },
    { label: 'Past Week', preset: '7d', days: 7 },
    { label: 'Past 30 Days', preset: '30d', days: 30 }
];

function populateFilterDropdown(name, container) {
    let html = '';

    if (name === 'type') {
        const types = getUniqueValues('type');
        types.forEach(t => {
            const isActive = state.filters.type === t;
            const activeClass = isActive ? 'bg-sage-100 text-primary font-medium' : 'text-slate-600 hover:bg-parchment-50';
            html += `<button onclick="setFilter('type','${escapeJsAttr(t)}')" class="w-full text-left px-3 py-1.5 text-xs ${activeClass} transition-colors">${escapeHtml(t)}</button>`;
        });
    } else if (name === 'user') {
        const users = getUniqueValues('userName');
        const depts = getUniqueValues('department');

        if (users.length > 0) {
            html += `<div class="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Users</div>`;
            users.forEach(u => {
                const isActive = state.filters.userName === u;
                const activeClass = isActive ? 'bg-sage-100 text-primary font-medium' : 'text-slate-600 hover:bg-parchment-50';
                html += `<button onclick="setFilter('userName','${escapeJsAttr(u)}')" class="w-full text-left px-3 py-1.5 text-xs ${activeClass} transition-colors">${escapeHtml(u)}</button>`;
            });
        }
        if (depts.length > 0) {
            html += `<div class="border-t border-parchment-100 my-1"></div>`;
            html += `<div class="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Departments</div>`;
            depts.forEach(d => {
                const isActive = state.filters.department === d;
                const activeClass = isActive ? 'bg-sage-100 text-primary font-medium' : 'text-slate-600 hover:bg-parchment-50';
                html += `<button onclick="setFilter('department','${escapeJsAttr(d)}')" class="w-full text-left px-3 py-1.5 text-xs ${activeClass} transition-colors">${escapeHtml(d)}</button>`;
            });
        }
    }

    container.innerHTML = html;

}

function setFilter(key, value) {
    // Toggle: clicking the same value deselects it
    if (state.filters[key] === value) {
        state.filters[key] = null;
    } else {
        state.filters[key] = value;
    }

    // When switching to a preset date range, clear custom date state
    if (key === 'dateRange') {
        if (value !== 'Custom') {
            state.filters.customDateStart = null;
            state.filters.customDateEnd = null;
        }
    }

    // User and department are mutually exclusive
    if (key === 'userName' && state.filters.userName !== null) {
        state.filters.department = null;
    } else if (key === 'department' && state.filters.department !== null) {
        state.filters.userName = null;
    }

    closeAllFilterDropdowns();
    updateFilterButtonStates();

    state.incidentPage = 0; // Reset pagination when filter changes
    renderIncidents();
    updateStats(true);
}

function clearAllFilters() {
    state.filters = { type: null, userName: null, department: null, dateRange: null, customDateStart: null, customDateEnd: null };
    if (window.dateFilterInstance) window.dateFilterInstance.applyFilter('all');
    updateFilterButtonStates();

    state.incidentPage = 0; // Reset pagination when clearing filters
    renderIncidents();
    updateStats(true);
}

function updateFilterButtonStates() {
    const filterMap = {
        type: state.filters.type,
        user: state.filters.userName || state.filters.department
    };

    const labelMap = {
        type: 'Type',
        user: 'User'
    };

    let activeCount = 0;

    Object.entries(filterMap).forEach(([name, value]) => {
        const btn = document.getElementById(`filterBtn-${name}`);
        if (!btn) return;
        const label = btn.querySelector('.label');

        if (value) {
            activeCount++;
            btn.classList.remove('bg-parchment-50', 'border-parchment-200', 'text-slate-500');
            btn.classList.add('bg-sage-100', 'text-primary', 'border-sage-300');
            if (label) {
                const displayValue = name === 'user' && state.filters.department
                    ? state.filters.department
                    : value;
                label.textContent = truncateText(displayValue, 14);
            }
        } else {
            btn.classList.remove('bg-sage-100', 'text-primary', 'border-sage-300');
            btn.classList.add('bg-parchment-50', 'border-parchment-200', 'text-slate-500');
            if (label) label.textContent = labelMap[name];
        }
    });

    const clearBtn = document.getElementById('clearFiltersBtn');
    const countEl = document.getElementById('activeFilterCount');
    if (clearBtn) {
        if (activeCount > 0) {
            clearBtn.classList.remove('hidden');
            clearBtn.classList.add('flex');
            if (countEl) countEl.textContent = activeCount;
        } else {
            clearBtn.classList.add('hidden');
            clearBtn.classList.remove('flex');
        }
    }
}

function getFilteredIncidents() {
    let filtered = getTimeFilteredIncidents();

    // Type
    if (state.filters.type) {
        filtered = filtered.filter(i => i.type === state.filters.type);
    }

    // User
    if (state.filters.userName) {
        filtered = filtered.filter(i => i.userName === state.filters.userName);
    }

    // Department
    if (state.filters.department) {
        filtered = filtered.filter(i => i.department === state.filters.department);
    }

    return filtered;
}

// Global exports
window.navigateBack = navigateBack;
window.toggleFilterDropdown = toggleFilterDropdown;
window.setFilter = setFilter;
window.clearAllFilters = clearAllFilters;
window.setIncidentPage = setIncidentPage;
