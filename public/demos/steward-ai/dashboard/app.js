// GenAI Monitor - Renderer JavaScript

// State management
const state = {
    dashboardPollInterval: null,
    isFetchingDashboard: false,
    lastDashboardData: null,
    lastFetchTime: 0,
    categories: [],
    activeDepartmentId: null,
    activeDepartmentName: null,

    // Date filter
    dateFilter: { preset: 'all', startDate: null, endDate: null },

    // Interaction tracking
    isUserInteracting: false,
    interactionTimestamp: null,
    interactionData: {
        donut: {
            hoveredIndex: null,
            hasSubcategoryOverlay: false
        },
        modelBar: {
            hoveredProvider: null
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Track load time for transition synchronization
    window.pageLoadTime = window.performance.now();

    // Read department context before loading data
    try {
        const viewingCtxRaw = sessionStorage.getItem('viewingDepartmentContext');
        if (viewingCtxRaw) {
            const ctx = JSON.parse(viewingCtxRaw);
            state.activeDepartmentId = ctx.departmentId || null;
            state.activeDepartmentName = ctx.departmentName || null;
        }
    } catch (e) { /* ignore */ }

    // Apply enter animation immediately for smooth transition
    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    // Initialize event listeners
    initEventListeners();

    // Initialize shared date filter component
    window.dateFilterInstance = DateFilter.init({
        mountId: 'date-filter-mount',
        storageKey: 'dashboardDateFilter',
        onFilterChange: (filterState) => {
            state.dateFilter = filterState;
            state.lastDashboardData = null;
            loadDashboardData();
        },
    });
    // Sync initial state (before first data load, callback is suppressed internally)
    if (window.dateFilterInstance) {
        state.dateFilter = window.dateFilterInstance.getState();
    }

    if (window.showPageLoadingOverlay) window.showPageLoadingOverlay();

    // Load data in background (page is already visible) — parallel fetches
    loadInitialData()
        .then(() => loadDashboardData())
        .catch(err => console.warn('[Dashboard] Initial load failed:', err))
        .then(() => {
            if (window.hidePageLoadingOverlay) window.hidePageLoadingOverlay();
            startDashboardPolling();
            Utils.initDynamicStyles();
        });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(state.dashboardPollInterval);
        } else {
            loadDashboardData()
                .catch(err => console.warn('[Dashboard] Refresh failed:', err))
                .then(() => startDashboardPolling());
        }
    });
});

// Initialize event listeners from main process
function initEventListeners() {
    if (!window.electronAPI) {
        return;
    }

    // Listen for new captured prompts — refresh from backend immediately
    window.electronAPI.onPromptCaptured(() => {
        state.lastDashboardData = null;
        loadDashboardData();
    });

    // Listen for scraper errors
    window.electronAPI.onScraperError((data) => {
        showNotification(data.message, 'error');
    });

    // Listen for extension warning events
    window.electronAPI.onExtensionWarning((data) => {
        if (data.show) {
            Utils.showExtensionWarning(data);
        } else {
            Utils.dismissExtensionWarning();
        }
    });
}

// Load initial data from main process
async function loadInitialData() {
    if (!window.electronAPI) return;

    try {
        // Load user profile
        const profile = await window.electronAPI.refreshUserProfile();
        if (profile) {
            updateUserProfile(profile);

            // Determine active department context
            const viewingCtxRaw = sessionStorage.getItem('viewingDepartmentContext');
            if (viewingCtxRaw) {
                try {
                    const ctx = JSON.parse(viewingCtxRaw);
                    state.activeDepartmentId = ctx.departmentId;
                    state.activeDepartmentName = ctx.departmentName;
                } catch (e) { /* ignore */ }
            } else if ((profile.role || '').toLowerCase() === 'manager') {
                state.activeDepartmentId = profile.department_id || null;
                state.activeDepartmentName = profile.department || null;
            }

            const deptEl = document.getElementById('departmentName');
            if (deptEl && state.activeDepartmentName) {
                deptEl.textContent = state.activeDepartmentName;
                deptEl.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

// Load dashboard data from database (Manager View)
async function loadDashboardData() {
    if (!window.electronAPI) {
        return;
    }

    // Prevent multiple overlapping requests
    if (state.isFetchingDashboard) return;
    state.isFetchingDashboard = true;

    try {
        // Fire-and-forget workflows count (doesn't block other data)
        const deptId = state.activeDepartmentId;
        loadWorkflowsCount(deptId);

        // Build a single filter payload for the combined dashboard request
        // The summary endpoint requires an explicit startDate; use a far-past sentinel for "all time"
        // so the backend doesn't default to a 30-day rolling window.
        const ALL_TIME_START = '2000-01-01T00:00:00.000Z';
        // Compute fresh dates for non-custom presets so polling stays correct across midnight
        let effectiveStart = state.dateFilter.startDate;
        let effectiveEnd = state.dateFilter.endDate;
        if (state.dateFilter.preset !== 'custom') {
            const today = new Date();
            const toEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
            const toStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
            effectiveEnd = toEnd(today);
            if (state.dateFilter.preset === '7d') {
                const s = new Date(); s.setDate(s.getDate() - 6);
                effectiveStart = toStart(s);
            } else if (state.dateFilter.preset === '30d') {
                const s = new Date(); s.setDate(s.getDate() - 29);
                effectiveStart = toStart(s);
            } else {
                effectiveStart = ALL_TIME_START;
            }
        }
        const filterOptions = {
            departmentId: deptId,
            startDate: effectiveStart,
            endDate: effectiveEnd,
            utcOffset: new Date().getTimezoneOffset()
        };
        const summary = await window.electronAPI.getDashboardSummary(filterOptions);
        const dashboardStats = summary?.dashboardStats || null;
        const categories = summary?.categories || { categories: [], total: 0 };
        const employees = summary?.employees || [];

        // Granular comparison - check each component separately
        const newData = { dashboardStats, categories, employees };

        const componentsToUpdate = {
            kpi: JSON.stringify(dashboardStats) !== JSON.stringify(state.lastDashboardData?.dashboardStats),
            categories: JSON.stringify(categories) !== JSON.stringify(state.lastDashboardData?.categories),
            employees: JSON.stringify(employees) !== JSON.stringify(state.lastDashboardData?.employees)
        };

        // Skip update if nothing changed
        if (!componentsToUpdate.kpi && !componentsToUpdate.categories &&
            !componentsToUpdate.employees) {
            return;
        }

        state.lastDashboardData = newData;

        applyDashboardDataSelective(newData, componentsToUpdate);
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    } finally {
        state.isFetchingDashboard = false;
        state.lastFetchTime = Date.now();
    }
}

/**
 * Apply dashboard data to UI components (selective updates only)
 */
function applyDashboardDataSelective(data, componentsToUpdate) {
    const { dashboardStats, categories } = data;

    // Update only changed components
    if (componentsToUpdate.categories && categories) {
        updateCategoryChart(categories);
    }

    if (componentsToUpdate.kpi && dashboardStats) {
        updateKPICards(dashboardStats);
        updatePrimaryModelKPI(dashboardStats);
    }
}

// ============================================
// Workflows
// ============================================

async function loadWorkflowsCount(departmentId) {
    try {
        const result = await window.electronAPI.getWorkflowsCount(departmentId || null);
        const el = document.getElementById('workflowsCount');
        if (el && result) {
            el.textContent = (result.count || 0).toLocaleString();
        }
    } catch (e) {
        console.error('Failed to load workflows count:', e);
    }
}

function navigateToWorkflows() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');
    navigateWithTransition('workflows', '../workflows/index.html', 'forward');
}

function startDashboardPolling() {
    // Clear existing interval if any
    if (state.dashboardPollInterval) {
        clearInterval(state.dashboardPollInterval);
    }

    state.dashboardPollInterval = setInterval(() => {
        // Skip if a fetch completed very recently (e.g. from navigation or manual refresh)
        if (Date.now() - state.lastFetchTime < 3000) {
            return;
        }

        // Check if user is actively interacting
        if (state.isUserInteracting) {
            // If interaction is stale (>5 seconds), force update anyway
            const interactionAge = Date.now() - (state.interactionTimestamp || 0);
            if (interactionAge < 5000) {
                return; // Skip this poll cycle
            }
        }

        loadDashboardData();
    }, 5000);
}

// Model colors for the usage breakdown bar (Earth Tones)
// modelColors is now in Utils.MODEL_COLORS

// Display names for models
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

// Function to update the Top Models KPI based on actual data
function updatePrimaryModelKPI(stats) {
    const topModelsList = document.getElementById('topModelsList');
    const barContainer = document.getElementById('modelUsageBarContainer');
    const labelArea = document.getElementById('modelBarLabelArea');

    if (!barContainer) return;

    // Get provider breakdown from stats, or construct from available data
    let providerBreakdown = stats.providerBreakdown || [];

    // If no breakdown provided, construct from topProvider data
    if (providerBreakdown.length === 0 && stats.topProvider && stats.topProviderPct) {
        providerBreakdown = [{ provider: stats.topProvider, percentage: stats.topProviderPct }];

        // If there's remaining percentage, add "other"
        const remaining = 100 - stats.topProviderPct;
        if (remaining > 0) {
            providerBreakdown.push({ provider: 'other', percentage: remaining });
        }
    }

    // Sort by percentage descending
    providerBreakdown.sort((a, b) => b.percentage - a.percentage);

    // --- Top 3 Ranked List ---
    if (topModelsList) {
        if (providerBreakdown.length === 0) {
            topModelsList.innerHTML = '<p class="text-sm text-slate-400">No Data</p>';
        } else {
            const top3 = providerBreakdown.slice(0, 3);
            topModelsList.innerHTML = top3.map((item, i) => {
                const color = chartColors[i % chartColors.length];
                const name = modelDisplayNames[item.provider.toLowerCase()] || item.provider.charAt(0).toUpperCase() + item.provider.slice(1);
                return `<div class="flex items-center justify-between py-1">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-400 w-4">${i + 1}.</span>
                        <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${color};"></span>
                        <span class="text-sm font-medium text-slate-700">${name}</span>
                    </div>
                    <span class="text-sm font-semibold text-slate-500">${Math.round(item.percentage)}%</span>
                </div>`;
            }).join('');
        }
    }

    // --- Bar chart: ALL models ---
    const totalPercentage = providerBreakdown.reduce((sum, item) => sum + item.percentage, 0);

    barContainer.innerHTML = providerBreakdown.map((item, index) => {
        const color = chartColors[index % chartColors.length];
        const name = modelDisplayNames[item.provider.toLowerCase()] || item.provider;
        const isFirst = index === 0;
        const isLast = index === providerBreakdown.length - 1;
        const roundedClass = isFirst && isLast ? 'rounded-sm' :
            isFirst ? 'rounded-l-sm' :
                isLast ? 'rounded-r-sm' : '';

        // Normalize to fill 100% width
        const normalizedWidth = totalPercentage > 0 ? (item.percentage / totalPercentage) * 100 : 0;

        return `<div
            class="h-full transition-all duration-300 ease-in-out model-bar-segment ${roundedClass} relative flex items-center justify-center cursor-pointer"
            style="width: ${normalizedWidth}%; background-color: ${color}; min-width: 4px;"
            data-provider="${name}"
            data-percentage="${Math.round(item.percentage)}"
            data-color="${color}"
        ></div>`;
    }).join('');

    // --- Hover labels (donut-style SVG) ---
    const segments = barContainer.querySelectorAll('.model-bar-segment');
    segments.forEach(segment => {
        segment.addEventListener('mouseenter', () => {
            const provider = segment.dataset.provider;
            const percentage = segment.dataset.percentage;
            const color = segment.dataset.color;

            // Set interaction state
            state.isUserInteracting = true;
            state.interactionTimestamp = Date.now();
            state.interactionData.modelBar.hoveredProvider = provider;

            // Expand segment
            segment.style.filter = 'brightness(1.1)';
            segment.style.height = '140%';
            segment.style.transform = 'translateY(-15%)';
            segment.style.zIndex = '20';
            segment.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

            // Build SVG label in label area
            if (labelArea) {
                const barRect = barContainer.getBoundingClientRect();
                const segRect = segment.getBoundingClientRect();
                const areaWidth = labelArea.offsetWidth;
                const areaHeight = labelArea.offsetHeight;

                // Center X of segment relative to label area
                const centerX = (segRect.left - barRect.left) + (segRect.width / 2);

                // Smart text anchor
                let textAnchor = 'middle';
                if (centerX < 40) {
                    textAnchor = 'start';
                    textX = Math.max(0, centerX);
                } else if (centerX > areaWidth - 40) {
                    textAnchor = 'end';
                    textX = Math.min(areaWidth, centerX);
                }

                const labelText = `${provider} ${percentage}%`;

                // Angle the connector line slightly to the left
                const lineTopX = Math.max(0, centerX - 8);
                // Position text above the angled line tip
                const labelTopX = textAnchor === 'middle' ? lineTopX :
                    textAnchor === 'start' ? Math.max(0, lineTopX) :
                        Math.min(areaWidth, lineTopX);

                const labelAreaRect = labelArea.getBoundingClientRect();
                const barTopY = segRect.top - labelAreaRect.top;
                const lineBottomY = barTopY - 9; // 9px gap

                labelArea.innerHTML = `<svg width="${areaWidth}" height="${areaHeight}" class="absolute inset-0" style="overflow: visible; z-index: 30;">
                    <line
                        x1="${centerX}" y1="${lineBottomY}"
                        x2="${lineTopX}" y2="6"
                        stroke="${color}" stroke-width="1.5" stroke-linecap="round"
                        class="model-connector-line" />
                    <text
                        x="${labelTopX}" y="-2"
                        text-anchor="${textAnchor}"
                        dominant-baseline="auto"
                        fill="#5e5b56"
                        font-size="10" font-weight="600"
                        class="model-bar-label"
                    >${labelText}</text>
                </svg>`;
            }
        });

        segment.addEventListener('mouseleave', () => {
            // Reset segment
            segment.style.filter = 'brightness(1)';
            segment.style.height = '100%';
            segment.style.transform = 'translateY(0)';
            segment.style.zIndex = '1';
            segment.style.boxShadow = 'none';

            // Clear label area
            if (labelArea) {
                labelArea.innerHTML = '';
            }

            // Clear interaction state
            state.isUserInteracting = false;
            state.interactionData.modelBar.hoveredProvider = null;
        });
    });
}

// Update KPI cards with real data
function updateKPICards(stats) {
    const dailyAvgPromptsEl = document.getElementById('dailyAvgPrompts');
    const riskEventsEl = document.getElementById('riskEvents');
    const riskBadgeEl = document.getElementById('riskBadge');

    if (dailyAvgPromptsEl) {
        // Use the precise daily average calculated by the backend (prompts / active days)
        const avg = stats.dailyAverage || 0;
        dailyAvgPromptsEl.textContent = avg.toLocaleString();

        // Populate the sparkline chart with history if available
        updateDailyAvgChart(avg, stats.dailyHistory);
    }

    if (riskEventsEl) {
        riskEventsEl.textContent = `${stats.riskEvents} ${stats.riskEvents === 1 ? 'Event' : 'Events'}`;
    }

    if (riskBadgeEl) {
        // Function to update badge while preserving the indicator dot
        const updateBadge = (text, dotColor) => {
            const dot = riskBadgeEl.querySelector('span');
            riskBadgeEl.innerHTML = '';
            if (dot) {
                dot.className = `w-2.5 h-2.5 rounded-full ${dotColor}`;
                riskBadgeEl.appendChild(dot);
            }
            if (text) {
                const textSpan = document.createElement('span');
                textSpan.textContent = text;
                riskBadgeEl.appendChild(textSpan);
            }
        };

        if (stats.riskEvents > 0) {
            updateBadge('', 'bg-clay-500');
            riskBadgeEl.classList.add('text-clay-500');
            riskBadgeEl.classList.remove('text-emerald-500');
        } else {
            updateBadge('Safe Operation', 'bg-emerald-500');
            riskBadgeEl.classList.remove('text-clay-500');
            riskBadgeEl.classList.add('text-emerald-500');
        }
    }
}

// Function to update the small daily average bar chart (sparkline)
function updateDailyAvgChart(avg, history) {
    const container = document.getElementById('dailyAvgChart');
    const labelArea = document.getElementById('dailyAvgLabelArea');
    if (!container) return;

    // Remove legacy tooltip if it exists
    const oldTooltip = document.getElementById('bar-tooltip');
    if (oldTooltip) oldTooltip.remove();

    // Use history if available
    let barsData = [];

    // Use backend history if available, otherwise show empty bars
    if (history && history.length > 0) {
        barsData = history;
    } else {
        barsData = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return {
                average: 0,
                date: d.toISOString()
            };
        });
    }

    // Determine max value for scaling (min 10 to avoid huge bars for small values)
    const maxValue = Math.max(10, ...barsData.map(d => d.average));

    // Check if bars already exist (e.g. from cache restore) — update in place to avoid double animation
    const existingBars = container.querySelectorAll('.bar-item');
    if (existingBars.length === barsData.length) {
        barsData.forEach((day, i) => {
            const bar = existingBars[i];
            const heightPct = Math.max(15, (day.average / maxValue) * 100);
            const opacity = 0.4 + (i / barsData.length) * 0.6;
            const dateObj = new Date(day.date);
            const dateShort = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

            bar.style.height = `${heightPct}%`;
            bar.style.opacity = opacity;
            bar.style.animation = 'none';
            bar.dataset.opacity = opacity;
            bar.dataset.date = dateShort;
            bar.dataset.value = day.average;
        });
        return;
    }

    // First render: generate bar HTML with staggered grow animation
    let html = '';
    barsData.forEach((day, i) => {
        const heightPct = Math.max(15, (day.average / maxValue) * 100);
        const opacity = 0.4 + (i / barsData.length) * 0.6;
        const dateObj = new Date(day.date);
        const dateShort = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const delay = i * 25;

        html += `<div
            class="bg-primary w-full rounded-t-sm transition-all duration-200 relative cursor-pointer bar-item"
            style="height: ${heightPct}%; opacity: ${opacity}; transform-origin: bottom; animation: barGrowUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both;"
            data-opacity="${opacity}"
            data-date="${dateShort}"
            data-value="${day.average}"
        ></div>`;
    });
    container.innerHTML = html;

    // Attach hover listeners with SVG connector + label
    const bars = container.querySelectorAll('.bar-item');
    bars.forEach(bar => {
        bar.addEventListener('mouseenter', () => {
            const date = bar.dataset.date;
            const value = bar.dataset.value;

            // Bar hover effect
            bar.style.opacity = '1';
            bar.style.transform = 'scaleY(1.08)';
            bar.style.filter = 'brightness(1.1)';
            bar.style.boxShadow = '0 -2px 8px rgba(77, 97, 89, 0.2)';

            // SVG label in label area
            if (labelArea) {
                const containerRect = container.getBoundingClientRect();
                const barRect = bar.getBoundingClientRect();
                const labelAreaRect = labelArea.getBoundingClientRect();
                const areaWidth = labelArea.offsetWidth;
                const areaHeight = labelArea.offsetHeight;

                const centerX = (barRect.left - containerRect.left) + (barRect.width / 2);

                // Calculate where the bar top is relative to the label area
                const barTopY = barRect.top - labelAreaRect.top;

                // Smart text anchor to keep label in bounds
                let textAnchor = 'middle';
                if (centerX < 50) {
                    textAnchor = 'start';
                } else if (centerX > areaWidth - 50) {
                    textAnchor = 'end';
                }

                const lineTopX = Math.max(0, centerX - 6);
                const labelTopX = textAnchor === 'middle' ? lineTopX :
                    textAnchor === 'start' ? Math.max(0, lineTopX) :
                        Math.min(areaWidth, lineTopX);

                const labelText = `${date} \u2014 ${value} req/member`;

                // End line just above the bar top (4px gap)
                const lineBottomY = barTopY - 4;

                labelArea.innerHTML = `<svg width="${areaWidth}" height="${areaHeight}" class="absolute inset-0" style="overflow: visible; z-index: 30;">
                    <line
                        x1="${centerX}" y1="${lineBottomY}"
                        x2="${lineTopX}" y2="12"
                        stroke="#4d6159" stroke-width="1.5" stroke-linecap="round"
                        class="bar-chart-connector" />
                    <text
                        x="${labelTopX}" y="2"
                        text-anchor="${textAnchor}"
                        dominant-baseline="auto"
                        fill="#5e5b56"
                        font-size="10" font-weight="600"
                        class="bar-chart-label"
                    >${labelText}</text>
                </svg>`;
            }
        });

        bar.addEventListener('mouseleave', () => {
            bar.style.opacity = bar.dataset.opacity;
            bar.style.transform = 'scaleY(1)';
            bar.style.filter = 'brightness(1)';
            bar.style.boxShadow = 'none';

            if (labelArea) {
                labelArea.innerHTML = '';
            }
        });
    });
}

// Fixed colors for chart slices (matched across UI)
const chartColors = Utils.CHART_COLORS || [
    '#4d6159', '#c2a894', '#7d8c82', '#5e503f', '#9ea39a', '#a7877f', '#6b705c', '#1a1a2e'
];

// Update category donut chart (from backend data)
function updateCategoryChart(data) {
    const topPercentEl = document.getElementById('topCategoryPercent');
    const topNameEl = document.getElementById('topCategoryName');
    const donutEl = document.getElementById('donutChart');

    // Always update the total count and label — even when categories is empty.
    // If we return early below, stale state.totalCategoryPrompts from a previous
    // cache restore would persist, causing the KPI card and donut center to show
    // the wrong (old) total.
    state.totalCategoryPrompts = data.total || 0;
    if (topPercentEl) topPercentEl.textContent = state.totalCategoryPrompts;
    if (topNameEl) topNameEl.textContent = 'TOTAL PROMPTS';

    if (!data.categories || data.categories.length === 0) {
        if (donutEl) donutEl.innerHTML = '';
        updateCategoryGrid([]);
        return;
    }

    const categories = data.categories || [];

    state.categories = categories; // Store for interaction

    // Update donut chart with SVG for individual segment hover effects
    if (donutEl) {
        renderDonutSVG(donutEl, categories);
    }

    // Update the 2x2 grid key
    updateCategoryGrid(categories);
}

// Generate the 2x2 grid key below the donut
function updateCategoryGrid(categories) {
    const container = document.getElementById('categoryGrid');
    if (!container) return;

    // Take top 4 categories
    // The backend already sorts by percentage desc usually, but let's be safe
    const topCategories = categories.slice(0, 4);
    const total = state.totalCategoryPrompts || 1; // avoid division by zero

    let html = '<div class="grid grid-cols-2 gap-x-8 gap-y-3 w-full">';

    topCategories.forEach((cat, index) => {
        const color = chartColors[index % chartColors.length];
        // Use percentage from backend if available, or calculate?
        // Backend 'cat' usually has .percentage (from previous usage in renderDonutSVG)
        // Check line 671: const sliceAngle = (cat.percentage / 100) * 360;
        // So cat.percentage exists.
        const percent = Math.round(cat.percentage);

        html += `
            <div class="flex items-center justify-between pb-1.5">
                <div class="flex items-center gap-2 overflow-hidden">
                    <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></div>
                    <span class="text-sm text-ink-light font-medium whitespace-nowrap overflow-hidden text-ellipsis" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
                </div>
                <span class="text-sm font-bold text-ink ml-2 flex-shrink-0">${percent}%</span>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Render donut chart as SVG with hoverable segments
function renderDonutSVG(container, categories) {
    const size = 320; // Increased to 320 for better visibility and centering
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius * 0.65;

    // Calculate the expansion amount
    const expandAmount = 6;

    let currentAngle = -90; // Start from top (12 o'clock position)

    const paths = categories.map((cat, index) => {
        const color = chartColors[index % chartColors.length];
        const sliceAngle = (cat.percentage / 100) * 360;

        // For the last segment, ensure it closes the circle
        const endAngle = (index === categories.length - 1)
            ? 270 // Full circle back to start (-90 + 360)
            : currentAngle + sliceAngle;

        const path = Utils.createArcPath(center, center, innerRadius, outerRadius, currentAngle, endAngle);

        // Store start and end angles for hover detection
        const startAngle = currentAngle;
        currentAngle = endAngle;

        return `
            <path
                d="${path}"
                fill="${color}"
                class="donut-segment"
                data-index="${index}"
                data-category="${escapeHtml(cat.name)}"
                data-percentage="${cat.percentage}"
                data-start-angle="${startAngle}"
                data-end-angle="${endAngle}"
                style="transform-origin: ${center}px ${center}px; transition: transform 0.2s ease-out, opacity 0.2s ease-out;"
            />
        `;
    }).join('');

    // Keep the existing container structure but add SVG
    container.innerHTML = `
        <div class="relative flex flex-col items-center">
            <div id="donutContainer" class="relative" style="width: ${size}px; height: ${size}px; overflow: visible;">
                <svg
                    width="${size}"
                    height="${size}"
                    viewBox="0 0 ${size} ${size}"
                    class="donut-svg"
                    id="mainDonutSvg"
                    style="position: absolute; top: 0; left: 0;"
                >
                    ${paths}
                </svg>
                <div class="absolute inset-14 bg-white rounded-full flex items-center justify-center flex-col shadow-inner pointer-events-none z-10" id="donutCenter">
                    <span id="topCategoryPercent" class="text-4xl font-light tracking-tighter text-slate-900">${state.totalCategoryPrompts || 0}</span>
                    <span id="topCategoryName" class="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mt-2 text-center px-4">TOTAL PROMPTS</span>
                </div>
            </div>
        </div>
    `;

    // Clear old conic gradient background and ensure overflow is visible for subcategory labels
    container.style.overflow = 'visible';

    // Add hover event listeners to segments (click removed - subcategories shown on hover)
    const donutContainer = document.getElementById('donutContainer');
    const segments = donutContainer.querySelectorAll('.donut-segment');
    segments.forEach(segment => {
        segment.addEventListener('mouseenter', handleSegmentHover);
        // mousemove too: if the overlay was purged externally (poll re-render,
        // watchdog) while the pointer stayed inside, mouseenter won't re-fire
        // but the next wiggle recreates the breakdown. Cheap: handleSegmentHover
        // early-returns while the overlay is alive.
        segment.addEventListener('mousemove', handleSegmentHover);
        segment.addEventListener('mouseleave', handleSegmentLeave);
    });

    // Add mouseleave on donutContainer to clean up when leaving the chart entirely
    donutContainer.addEventListener('mouseleave', handleChartLeave);
}

// Handle leaving the entire donut chart
function handleChartLeave(e) {
    // Check if we're moving to something inside the chart
    const relatedTarget = e.relatedTarget;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
        return;
    }

    // Clean up everything
    if (subcategoryOverlay) {
        removeSubcategoryOverlayWithAnimation(subcategoryOverlay);
        subcategoryOverlay = null;
    }

    // Reset all segments
    const segments = document.querySelectorAll('.donut-segment');
    segments.forEach(segment => {
        segment.style.opacity = '1';
        segment.style.transform = 'scale(1)';
        segment.style.filter = 'brightness(1)';
    });

    hoveredSegmentIndex = null;

    // Reset to total prompts
    const topPercentEl = document.getElementById('topCategoryPercent');
    const topNameEl = document.getElementById('topCategoryName');
    if (topPercentEl) topPercentEl.textContent = state.totalCategoryPrompts || 0;
    if (topNameEl) topNameEl.textContent = 'TOTAL PROMPTS';

    // Clear interaction state
    state.isUserInteracting = false;
    state.interactionData.donut.hoveredIndex = null;
    state.interactionData.donut.hasSubcategoryOverlay = false;
}

// Helper to remove overlay with exit animation
function removeSubcategoryOverlayWithAnimation(overlay) {
    if (!overlay) return;

    // Fade the whole overlay as one unit so labels never outlive their
    // leader lines (per-element exits left orphaned "ghost" labels behind).
    overlay.querySelectorAll('.subcategory-segment').forEach(el => el.classList.add('exit'));
    overlay.style.transition = 'opacity 0.18s ease-in';
    overlay.style.opacity = '0';

    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.remove();
        }
    }, 200);
}

// State for tracking hover
let subcategoryOverlay = null;
let hoveredSegmentIndex = null;

// Watchdog: mouseleave can be missed (window switches, layout shifts), which
// orphans an overlay whose labels then linger as "ghosts". Whenever the
// pointer is provably outside the donut, or the window resizes/blurs,
// reset hover state and hard-purge every overlay.
function purgeSubcategoryOverlays() {
    document.querySelectorAll('#subcategoryOverlay').forEach(el => el.remove());
    subcategoryOverlay = null;
    hoveredSegmentIndex = null;
    document.querySelectorAll('.donut-segment').forEach(seg => {
        seg.style.opacity = '1';
        seg.style.transform = 'scale(1)';
        seg.style.filter = 'brightness(1)';
    });
    const topPercentEl = document.getElementById('topCategoryPercent');
    const topNameEl = document.getElementById('topCategoryName');
    if (topPercentEl) topPercentEl.textContent = state.totalCategoryPrompts || 0;
    if (topNameEl) topNameEl.textContent = 'TOTAL PROMPTS';
    state.isUserInteracting = false;
}
document.addEventListener('mousemove', (e) => {
    if (!subcategoryOverlay && !document.getElementById('subcategoryOverlay')) return;
    const dc = document.getElementById('donutContainer');
    if (!dc) return;
    const r = dc.getBoundingClientRect();
    const PAD = 12;
    if (e.clientX < r.left - PAD || e.clientX > r.right + PAD ||
        e.clientY < r.top - PAD || e.clientY > r.bottom + PAD) {
        purgeSubcategoryOverlays();
    }
}, { passive: true });
window.addEventListener('resize', purgeSubcategoryOverlays);
window.addEventListener('blur', purgeSubcategoryOverlays);

// Handle segment hover - show subcategory breakdown
function handleSegmentHover(e) {
    const segment = e.target;
    const index = parseInt(segment.dataset.index);
    const category = state.categories[index];

    // Set interaction state
    state.isUserInteracting = true;
    state.interactionTimestamp = Date.now();
    state.interactionData.donut.hoveredIndex = index;

    // Skip if already hovering this segment AND its overlay is still alive
    // (a poll re-render can wipe the overlay while the index stays stale)
    if (hoveredSegmentIndex === index && document.getElementById('subcategoryOverlay')) return;

    // Reset the previously hovered segment first
    if (hoveredSegmentIndex !== null) {
        const prevSegment = document.querySelector(`.donut-segment[data-index="${hoveredSegmentIndex}"]`);
        if (prevSegment) {
            prevSegment.style.opacity = '1';
            prevSegment.style.transform = 'scale(1)';
            prevSegment.style.filter = 'brightness(1)';
        }
    }

    // Remove previous overlay with animation
    if (subcategoryOverlay) {
        removeSubcategoryOverlayWithAnimation(subcategoryOverlay);
        subcategoryOverlay = null;
    }

    hoveredSegmentIndex = index;

    // Update center text
    const topPercentEl = document.getElementById('topCategoryPercent');
    const topNameEl = document.getElementById('topCategoryName');
    if (topPercentEl) topPercentEl.textContent = `${category.percentage}%`;
    if (topNameEl) topNameEl.textContent = category.name;

    // If no subcategories, just scale up
    if (!category.subcategories || category.subcategories.length === 0) {
        segment.style.transform = 'scale(1.05)';
        segment.style.filter = 'brightness(1.05)';
        return;
    }

    // Fade out the original segment instead of instant hide
    segment.style.opacity = '0';

    // Get segment angles
    const startAngle = parseFloat(segment.dataset.startAngle);
    const endAngle = parseFloat(segment.dataset.endAngle);
    const parentColor = segment.getAttribute('fill');

    // Render subcategory breakdown
    renderSubcategoryBreakdown(category, startAngle, endAngle, parentColor, index);
}

// FIXED: Render subcategory segments with lines and labels
function renderSubcategoryBreakdown(category, parentStartAngle, parentEndAngle, parentColor, parentIndex) {
    // Purge ALL overlays (including ones mid-fade-out) — rapid segment
    // switching otherwise stacks the old category's labels as ghosts.
    document.querySelectorAll('#subcategoryOverlay').forEach(el => el.remove());
    subcategoryOverlay = null;

    const donutChart = document.getElementById('donutChart');
    if (!donutChart) return;

    // Get the parent card element for boundary calculations
    const parentCard = donutChart.closest('.rounded-clay') || donutChart.parentElement;
    const cardRect = parentCard.getBoundingClientRect();
    const containerRect = donutChart.getBoundingClientRect();

    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius * 0.65;
    const expandedOuterRadius = outerRadius + 8; // Slightly smaller expansion

    // Calculate available space on each side relative to the donut center
    const donutCenterX = containerRect.left + containerRect.width / 2;
    const availableLeft = donutCenterX - cardRect.left - 20; // 20px padding from card edge
    const availableRight = cardRect.right - donutCenterX - 20;

    // Overlay needs to be large enough for labels but constrained
    const overlayPadding = 100;
    const overlaySize = size + (overlayPadding * 2);

    const totalSubPercent = category.subcategories.reduce((sum, sub) => sum + sub.percentage, 0);
    const angleRange = parentEndAngle - parentStartAngle;

    let currentAngle = parentStartAngle;
    const subcategoryColors = Utils.generateSubcategoryColors(parentColor, category.subcategories.length);

    // Determine which side ALL subcategories should go based on parent category's center angle
    const parentCenterAngle = parentStartAngle + angleRange / 2;
    const allLabelsRightSide = parentCenterAngle > -90 && parentCenterAngle < 90;

    // Calculate vertical bounds based on the card, not just the SVG
    // Leave room for the header ("Use Case Analytics") and legend below
    const cardTopPadding = 80;  // Space for header
    const cardBottomPadding = 100; // Space for legend

    // Convert to SVG coordinates (relative to donut center)
    const svgBoundsTop = -(containerRect.top - cardRect.top - cardTopPadding) + center;
    const svgBoundsBottom = (cardRect.bottom - containerRect.top - cardBottomPadding) - center + size;

    // Clamp to reasonable values within SVG
    const effectiveTop = Math.max(20, Math.min(svgBoundsTop, center - 80));
    const effectiveBottom = Math.min(size - 20, Math.max(svgBoundsBottom, center + 80));

    // Calculate maximum horizontal extension based on available space
    const maxLabelExtentRight = Math.min(availableRight - 10, 100); // Max 100px from donut edge
    const maxLabelExtentLeft = Math.min(availableLeft - 10, 100);

    // Initial pass: Calculate base positions
    const labelData = category.subcategories.map((sub, idx) => {
        const subAngle = (sub.percentage / totalSubPercent) * angleRange;
        const subEndAngle = currentAngle + subAngle;
        const midAngle = (currentAngle + subEndAngle) / 2;
        const midRad = (midAngle * Math.PI) / 180;

        // Initial Y based on angle
        const idealY = center + (expandedOuterRadius + 25) * Math.sin(midRad);

        // Clamp Y to bounds immediately
        const clampedY = Math.max(effectiveTop, Math.min(effectiveBottom, idealY));

        const res = {
            name: sub.name,
            percentage: sub.percentage,
            midAngle,
            midRad,
            color: subcategoryColors[idx],
            path: Utils.createArcPath(center, center, innerRadius, expandedOuterRadius, currentAngle, subEndAngle),
            isRightSide: allLabelsRightSide,
            y: clampedY,
            idealY: idealY // Keep track of ideal position for line routing
        };
        currentAngle = subEndAngle;
        return res;
    });

    // Improved spreading algorithm with dynamic gap
    const numLabels = labelData.length;
    const availableHeight = effectiveBottom - effectiveTop;

    // Calculate minimum gap - reduce if many labels
    const idealGap = 20;
    const minGap = Math.max(14, Math.min(idealGap, (availableHeight - numLabels * 12) / (numLabels - 1 || 1)));

    // Sort labels by Y position for spreading
    const sortedLabels = [...labelData].sort((a, b) => a.y - b.y);

    // Multi-pass spreading with boundary awareness — skip if already spread
    const needsSpreading = sortedLabels.some((l, i) =>
        i < sortedLabels.length - 1 && sortedLabels[i + 1].y - l.y < minGap
    );
    if (needsSpreading) {
        for (let pass = 0; pass < 15; pass++) {
            let changed = false;

            // Push apart overlapping labels
            for (let i = 0; i < sortedLabels.length - 1; i++) {
                const cur = sortedLabels[i];
                const next = sortedLabels[i + 1];
                const gap = next.y - cur.y;

                if (gap < minGap) {
                    const overlap = minGap - gap;
                    const pushUp = overlap / 2;
                    const pushDown = overlap / 2;

                    // Check bounds before pushing
                    const newCurY = cur.y - pushUp;
                    const newNextY = next.y + pushDown;

                    if (newCurY >= effectiveTop) {
                        cur.y = newCurY;
                    } else {
                        // Can't push up, push down more
                        cur.y = effectiveTop;
                        next.y = Math.min(effectiveBottom, next.y + overlap);
                    }

                    if (newNextY <= effectiveBottom) {
                        next.y = newNextY;
                    } else {
                        // Can't push down, push up more
                        next.y = effectiveBottom;
                        cur.y = Math.max(effectiveTop, cur.y - overlap);
                    }

                    changed = true;
                }
            }

            if (!changed) break;

            // Re-sort after adjustments (only needed if positions changed)
            sortedLabels.sort((a, b) => a.y - b.y);
        }
    }

    // Update original labelData with spread positions
    labelData.forEach(label => {
        const spreadLabel = sortedLabels.find(s => s.name === label.name);
        if (spreadLabel) {
            label.y = spreadLabel.y;
        }
    });

    // Final render
    const segments = [];
    const lines = [];
    const labels = [];

    labelData.forEach((label, idx) => {
        const midRad = label.midRad;

        // Line starts from the expanded donut edge
        const lineStartX = center + expandedOuterRadius * Math.cos(midRad);
        const lineStartY = center + expandedOuterRadius * Math.sin(midRad);

        // Calculate label position with reduced horizontal extent
        const maxExtent = label.isRightSide ? maxLabelExtentRight : maxLabelExtentLeft;
        const labelOffset = Math.min(55, maxExtent - 20); // Reduced from 85 to 55

        const baseLabelX = label.isRightSide
            ? center + expandedOuterRadius + labelOffset
            : center - expandedOuterRadius - labelOffset;

        const elbowOffset = label.isRightSide ? -25 : 25;
        const baseElbowX = baseLabelX + elbowOffset;

        const finalLabelY = label.y;
        const textAnchor = label.isRightSide ? 'start' : 'end';

        // Smart elbow positioning - create a smooth path from donut to label
        const yDiff = finalLabelY - lineStartY;
        let elbowY;

        if (Math.abs(yDiff) < 15) {
            // Nearly horizontal - simple straight line with small elbow
            elbowY = lineStartY;
        } else {
            // Need to route around - elbow at 70% of the way vertically
            elbowY = lineStartY + yDiff * 0.3;
        }

        // Text truncation based on available space
        const displayText = truncateLabelText(label.name, label.percentage, maxExtent);

        // Segment path
        segments.push(`
            <path
                d="${label.path}"
                fill="${label.color}"
                class="subcategory-segment"
                style="transform-origin: ${center}px ${center}px; animation: subcategoryFadeIn 0.25s ease-out forwards;"
            />
        `);

        // Connector line with bezier curve for smoother appearance
        const controlX = label.isRightSide
            ? lineStartX + (baseElbowX - lineStartX) * 0.5
            : lineStartX + (baseElbowX - lineStartX) * 0.5;

        lines.push(`
            <path
                d="M ${lineStartX} ${lineStartY}
                   Q ${controlX} ${elbowY}, ${baseElbowX} ${finalLabelY}
                   L ${baseLabelX} ${finalLabelY}"
                stroke="${label.color}"
                stroke-width="1.5"
                fill="none"
                class="subcategory-line"
                style="animation: subcategoryLineGrow 0.3s ease-out ${idx * 0.03}s both;"
            />
        `);

        // Label text
        const labelX = baseLabelX + (label.isRightSide ? 4 : -4);
        labels.push(`
            <text
                x="${labelX}"
                y="${finalLabelY}"
                text-anchor="${textAnchor}"
                dominant-baseline="middle"
                class="subcategory-label"
                fill="#5e5b56"
                font-size="10"
                font-weight="600"
                style="animation: subcategoryLabelFadeIn 0.25s ease-out ${idx * 0.03 + 0.05}s both;"
            >
                ${Utils.escapeHtml(displayText)}
            </text>
        `);
    });

    // Create the overlay
    subcategoryOverlay = document.createElement('div');
    subcategoryOverlay.id = 'subcategoryOverlay';
    subcategoryOverlay.style.cssText = `
        position: absolute;
        top: -${overlayPadding}px;
        left: -${overlayPadding}px;
        width: ${overlaySize}px;
        height: ${overlaySize}px;
        pointer-events: none;
        z-index: 10;
        overflow: visible;
    `;

    subcategoryOverlay.innerHTML = `
        <svg width="${overlaySize}" height="${overlaySize}" viewBox="0 0 ${overlaySize} ${overlaySize}"
             class="subcategory-svg" style="overflow: visible;">
            <g transform="translate(${overlayPadding}, ${overlayPadding})">
                <g class="subcategory-segments">${segments.join('')}</g>
                <g class="subcategory-lines">${lines.join('')}</g>
                <g class="subcategory-labels">${labels.join('')}</g>
            </g>
        </svg>
    `;

    donutChart.appendChild(subcategoryOverlay);
}

// Helper: Truncate label text to fit available space
function truncateLabelText(name, percentage, maxWidth) {
    const percentStr = ` (${percentage}%)`;
    const fullText = name + percentStr;

    // Approximate character width (~4.5px per char at font-size 9 for proportional fonts)
    const charWidth = 2.5;
    const maxChars = Math.floor(maxWidth / charWidth);

    if (fullText.length <= maxChars) {
        return fullText;
    }

    // Need to truncate the name part
    const availableForName = maxChars - percentStr.length - 3; // -3 for "..."

    if (availableForName < 1) {
        // Not enough space - just show percentage
        return `...${percentStr}`;
    }

    return name.substring(0, availableForName) + '...' + percentStr;
}

// Handle segment leave - reset the segment
function handleSegmentLeave(e) {
    const segment = e.target;
    const index = parseInt(segment.dataset.index);

    // Only process if this is the currently hovered segment
    if (hoveredSegmentIndex !== index) return;

    // Check if mouse is moving to another segment or subcategory overlay
    const relatedTarget = e.relatedTarget;
    if (relatedTarget && (
        relatedTarget.closest('#subcategoryOverlay') ||
        relatedTarget.closest('.donut-segment')
    )) {
        return;
    }

    hoveredSegmentIndex = null;
    if (subcategoryOverlay) {
        removeSubcategoryOverlayWithAnimation(subcategoryOverlay);
        subcategoryOverlay = null;
    }

    // Reset segment visibility
    segment.style.opacity = '1';
    segment.style.transform = 'scale(1)';
    segment.style.filter = 'brightness(1)';

    // Reset to total prompts
    const topPercentEl = document.getElementById('topCategoryPercent');
    const topNameEl = document.getElementById('topCategoryName');
    if (topPercentEl) topPercentEl.textContent = state.totalCategoryPrompts || 0;
    if (topNameEl) topNameEl.textContent = 'TOTAL PROMPTS';

    // Clear interaction flag after short delay (allow mouse movement between segments)
    setTimeout(() => {
        if (state.interactionData.donut.hoveredIndex === index) {
            state.isUserInteracting = false;
            state.interactionData.donut.hoveredIndex = null;
        }
    }, 100);
}

function updateUserProfile(profile) {
    const badge = document.getElementById('userProfileBadge');
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    if (badge && profile) {
        badge.classList.remove('hidden'); // Ensure it's visible if hidden

        if (nameEl) nameEl.textContent = profile.full_name || 'User';
        if (roleEl) roleEl.textContent = (profile.role || 'Manager').toUpperCase();

        // Show department name
        const deptEl = document.getElementById('departmentName');
        if (deptEl && profile.department) {
            deptEl.textContent = profile.department;
            deptEl.classList.remove('hidden');
        }

        // Show back button for admins viewing the manager dashboard
        if ((profile.role || '').toLowerCase() === 'admin') {
            const backRow = document.getElementById('backToAdminRow');
            if (backRow) backRow.classList.remove('hidden');
        }
    }
}

// ============================================
// Navigation
// ============================================

function saveDashboardDateFilter() {
    try {
        sessionStorage.setItem('dashboardDateFilter', JSON.stringify(state.dateFilter));
    } catch (e) { /* ignore */ }
}

function navigateToMyUsage() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');
    if (window.navigateWithTransition) {
        window.navigateWithTransition('myUsage', '../employees/myUsage.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('myUsage');
    } else {
        window.location.href = '../employees/myUsage.html';
    }
}

function navigateToTeamOverview() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');
    navigateWithTransition('teamOverview', '../team/teamOverview.html', 'forward');
}

function navigateToSecurityCenter() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');
    // Pass current date filter to security center
    try {
        sessionStorage.setItem('securityDateFilter', JSON.stringify(state.dateFilter));
    } catch (e) { /* ignore */ }
    // Store department context so security center shows only this department
    if (state.activeDepartmentId) {
        sessionStorage.setItem('securityDepartmentContext', JSON.stringify({
            departmentId: state.activeDepartmentId,
            departmentName: state.activeDepartmentName
        }));
    } else {
        sessionStorage.removeItem('securityDepartmentContext');
    }
    navigateWithTransition('securityCenter', '../securityDashboard/securityCenter.html', 'forward');
}

function navigateToTeamManagement() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');

    // Store department context so team management shows only this department
    if (state.activeDepartmentId) {
        sessionStorage.setItem('teamDepartmentContext', JSON.stringify({
            departmentId: state.activeDepartmentId,
            departmentName: state.activeDepartmentName
        }));
    } else {
        sessionStorage.removeItem('teamDepartmentContext');
    }

    navigateWithTransition('teamManagement', '../team/teamManagement.html', 'forward');
}

function navigateToParentPage() {
    sessionStorage.removeItem('viewingDepartmentContext');
    sessionStorage.removeItem('navigationReferrer');

    const target = 'adminDashboard';
    const fallback = '../admin/admin.html';

    if (window.navigateWithTransition) {
        window.navigateWithTransition(target, fallback, 'back');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo(target);
    } else {
        window.location.href = fallback;
    }
}

function navigateToModelBreakdown() {
    saveDashboardDateFilter();
    sessionStorage.setItem('navigationReferrer', 'dashboard');
    navigateWithTransition('modelBreakdown', '../modelBreakdown/modelBreakdown.html', 'forward');
}

// Make functions available globally
window.navigateToMyUsage = navigateToMyUsage;
window.navigateToTeamOverview = navigateToTeamOverview;
window.navigateToSecurityCenter = navigateToSecurityCenter;
window.navigateToTeamManagement = navigateToTeamManagement;
window.navigateToParentPage = navigateToParentPage;
window.navigateToModelBreakdown = navigateToModelBreakdown;
window.navigateToWorkflows = navigateToWorkflows;

