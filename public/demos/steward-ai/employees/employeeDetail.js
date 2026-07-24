// GenAI Monitor - Employee Detail Page JavaScript

const state = {
    employee: null,
    prompts: [],
    dateFilter: { preset: 'all', startDate: null, endDate: null },
    activityChart: null,
    dailyActivity: {},
    heatmapData: [],
    heatmapView: 'recent', // 'recent', '2026', '2025'
    categories: [],
    totalCategoryPrompts: 0,
    employeePollInterval: null
};

// Donut chart state
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
    if (typeof resetDonutCenter === 'function') resetDonutCenter();
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

// Activity trend hover animation state
const activityHoverAnim = {
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

// Fixed colors for chart slices (matched across UI)
const chartColors = Utils.CHART_COLORS || [
    '#4d6159', '#c2a894', '#7d8c82', '#5e503f', '#9ea39a', '#a7877f', '#6b705c', '#1a1a2e'
];

async function refreshEmployeeData() {
    if (!window.electronAPI || !state.employee) return;

    try {
        const employee = await window.electronAPI.getSelectedEmployee();
        if (!employee) return;
        state.employee = employee;
        updateEmployeeProfile(state.employee);

        const employeeId = state.employee.id || state.employee.user_id;
        if (!employeeId) return;

        const prompts = await window.electronAPI.getEmployeePrompts(employeeId);

        // Shallow compare to avoid unnecessary re-renders: check length and most-recent item id
        const promptsChanged = (() => {
            const a = prompts || [], b = state.prompts || [];
            if (a.length !== b.length) return true;
            if (a.length === 0) return false;
            return (a[0]?.id !== b[0]?.id) || (a[a.length - 1]?.id !== b[b.length - 1]?.id);
        })();
        if (promptsChanged) {
            state.prompts = prompts;
            updateAllDisplays();
        } else {
            // Even if prompts didn't change, we might need to update profile info if status changed
            // But usually we can skip the heavy chart updates
        }
    } catch (error) {
        console.error('[EmployeeDetail] refreshEmployeeData failed:', error);
    }
}

function startEmployeePolling() {
    if (state.employeePollInterval) clearInterval(state.employeePollInterval);
    state.employeePollInterval = setInterval(refreshEmployeeData, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    window.pageLoadTime = window.performance.now();
    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    window.dateFilterInstance = DateFilter.init({
        mountId: 'date-filter-mount',
        storageKey: 'employeeUsageDateFilter',
        onFilterChange: (filterState) => {
            state.dateFilter = filterState;
            updateAllDisplays(true);
        },
    });
    if (window.dateFilterInstance) {
        state.dateFilter = window.dateFilterInstance.getState();
    }

    loadEmployeeData()
        .catch(err => console.warn('[EmployeeDetail] Initial load failed:', err))
        .then(() => startEmployeePolling());

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(state.employeePollInterval);
        } else {
            refreshEmployeeData()
                .catch(err => console.warn('[EmployeeDetail] Refresh failed:', err))
                .then(() => startEmployeePolling());
        }
    });
});

function renderAfterTransition(renderFn) {
    const TRANSITION_DURATION = 400;
    const timeSinceLoad = window.performance.now() - (window.pageLoadTime || 0);
    if (timeSinceLoad < TRANSITION_DURATION) {
        setTimeout(() => {
            requestAnimationFrame(renderFn);
        }, TRANSITION_DURATION - timeSinceLoad);
    } else {
        requestAnimationFrame(renderFn);
    }
}

// Load employee data from IPC (Electron) or sessionStorage (browser fallback)
async function loadEmployeeData() {

    // Get employee info via IPC (Electron) or sessionStorage (browser)
    if (window.electronAPI) {
        try {
            state.employee = await window.electronAPI.getSelectedEmployee();

            if (!state.employee) {
                console.error('[EmployeeDetail] No employee data found via IPC');
                navigateBack();
                return;
            }
            updateEmployeeProfile(state.employee);
        } catch (e) {
            console.error('[EmployeeDetail] Failed to get employee data via IPC:', e);
            navigateBack();
            return;
        }
    } else {
        // Browser fallback - use sessionStorage
        const employeeJson = sessionStorage.getItem('selectedEmployee');

        if (!employeeJson) {
            console.error('[EmployeeDetail] No employee data found in sessionStorage');
            navigateBack();
            return;
        }

        try {
            state.employee = JSON.parse(employeeJson);
            updateEmployeeProfile(state.employee);
        } catch (e) {
            console.error('[EmployeeDetail] Failed to parse employee data:', e);
            navigateBack();
            return;
        }
    }

    // Fetch employee's prompts
    if (window.electronAPI) {
        try {
            // Support both 'id' and 'user_id' field names from backend
            const employeeId = state.employee.id || state.employee.user_id;

            if (!employeeId) {
                console.error('[EmployeeDetail] No employee ID found. Employee object:', state.employee);
                renderAfterTransition(() => updateAllDisplays());
                return;
            }

            state.prompts = await window.electronAPI.getEmployeePrompts(employeeId);
            renderAfterTransition(() => updateAllDisplays());
        } catch (error) {
            console.error('[EmployeeDetail] Failed to load employee prompts:', error);
            // Still show UI with empty data
            renderAfterTransition(() => updateAllDisplays());
        }
    } else {
        // Demo mode - generate sample data
        loadDemoData();
    }
}

// Load demo data for browser preview
function loadDemoData() {
    const categories = ['debugging code', 'writing email', 'creating presentation', 'researching topic', 'explaining concept', 'analyzing data', 'writing content'];
    const sources = ['claude', 'chatgpt', 'cursor'];

    const now = new Date();
    state.prompts = [];

    // Generate sample prompts
    const promptCount = state.employee?.promptCount || Math.floor(Math.random() * 500) + 100;
    for (let i = 0; i < promptCount; i++) {
        const daysAgo = Math.floor(Math.random() * 365);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);

        state.prompts.push({
            id: i,
            category: categories[Math.floor(Math.random() * categories.length)],
            source: sources[Math.floor(Math.random() * sources.length)],
            createdAt: date.toISOString(),
            isSubmitted: Math.random() > 0.3
        });
    }

    // Make debugging code the most common (40%)
    const debugCount = Math.floor(promptCount * 0.4);
    for (let i = 0; i < debugCount && i < state.prompts.length; i++) {
        state.prompts[i].category = 'debugging code';
    }

    updateAllDisplays();
}

// Update employee profile display
function updateEmployeeProfile(employee) {
    const nameEl = document.getElementById('employeeName');
    const deptEl = document.getElementById('employeeDepartment');
    const initialsEl = document.getElementById('employeeInitials');
    const titleEl = document.getElementById('pageTitle');
    const subtitleEl = document.getElementById('pageSubtitle');

    if (employee) {
        nameEl.textContent = employee.name || 'Unknown';
        deptEl.textContent = employee.department ? employee.department.toUpperCase() : '—';

        // Initials
        const initials = (employee.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        initialsEl.textContent = initials;

        // Update page title
        titleEl.textContent = `${employee.name}'s Usage`;
        subtitleEl.textContent = formatEmailForDisplay(employee.email, 'Detailed usage statistics and history.');
    }
}

// Filter prompts to the currently selected date window
function applyDateFilter(prompts) {
    const { startDate, endDate } = state.dateFilter;
    if (!startDate && !endDate) return prompts;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return prompts.filter(p => {
        const d = new Date(p.createdAt);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
    });
}

// Update all display components
function updateAllDisplays(animate) {
    const filteredPrompts = applyDateFilter(state.prompts);
    processActivityData(filteredPrompts);
    updateStatsCards(filteredPrompts);
    updateCategoryBreakdown(filteredPrompts);
    updateActivityChart(animate);
    updateContributionHeatmap();
}

// Process prompts into daily activity data
function processActivityData(prompts) {
    prompts = prompts || state.prompts;
    state.dailyActivity = [];
    state.heatmapData = [];

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Initialize map of date string -> count and per-model breakdown
    const activityMap = new Map();
    const modelActivityMap = new Map();
    prompts.forEach(prompt => {
        const date = new Date(prompt.createdAt);
        const dateStr = date.toDateString();
        activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
        // Per-model count
        const source = (prompt.source || 'unknown').toLowerCase();
        if (!modelActivityMap.has(dateStr)) modelActivityMap.set(dateStr, {});
        const dayMap = modelActivityMap.get(dateStr);
        dayMap[source] = (dayMap[source] || 0) + 1;
    });

    // Populate dailyActivity with smart bucketing based on date filter range
    const { activity } = Utils.bucketActivityData(
        prompts, state.dateFilter.startDate, state.dateFilter.endDate
    );
    state.dailyActivity = activity;

    // Determine start and end date based on view
    let start, end;

    if (state.heatmapView === 'recent') {
        end = new Date(now);
        start = new Date(now);
        start.setDate(start.getDate() - 364); // 365 days total
    } else {
        // Specific year
        const year = parseInt(state.heatmapView);
        start = new Date(year, 0, 1); // Jan 1
        end = new Date(year, 11, 31); // Dec 31
    }

    // Align start to Sunday for consistent grid
    const dayOfWeek = start.getDay();
    const graphStartDate = new Date(start);
    graphStartDate.setDate(graphStartDate.getDate() - dayOfWeek);

    // Generate daily data
    for (let d = new Date(graphStartDate); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toDateString();
        state.heatmapData.push({
            date: new Date(d),
            count: activityMap.get(dateStr) || 0,
            inRange: d >= start && d <= end
        });
    }
}

// Update the stats cards
function updateStatsCards(prompts) {
    prompts = prompts || state.prompts;
    // Total Prompts
    const totalEl = document.getElementById('totalPromptsCount');
    if (totalEl) {
        totalEl.textContent = prompts.length;
    }

    // Average Messages Per Day (total prompts / number of unique days with activity)
    const avgPumpsEl = document.getElementById('avgPumpsCount');
    if (avgPumpsEl) {
        const activeDays = new Set();
        prompts.forEach(p => {
            const dateStr = new Date(p.createdAt).toDateString();
            activeDays.add(dateStr);
        });

        const numDays = activeDays.size || 1;
        const avg = Math.round(prompts.length / numDays);
        avgPumpsEl.innerHTML = `${avg} <span class="text-lg">msg/day</span>`;
    }

    // Top Model Used
    const topModelEl = document.getElementById('topModelName');
    if (topModelEl) {
        const topModelIconEl = document.getElementById('topModelIcon');
        const sourceCounts = {};
        prompts.forEach(p => {
            const source = (p.source || 'unknown').toLowerCase();
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        });

        let topSourceKey = 'unknown';
        let topSource = '-';
        let maxCount = 0;
        Object.entries(sourceCounts).forEach(([source, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topSourceKey = source;
                topSource = formatSourceName(source);
            }
        });

        topModelEl.textContent = topSource;
        if (topModelIconEl && window.UnpakIcons) {
            topModelIconEl.innerHTML = window.UnpakIcons.getToolIcon(topSourceKey);
        }
    }
}

// formatSourceName is now in utils/common.js

// Update category breakdown display - donut chart
function updateCategoryBreakdown(prompts) {
    prompts = prompts || state.prompts;
    const container = document.getElementById('categoryBreakdown');
    if (!container) return;

    if (prompts.length === 0) {
        container.innerHTML = '<p class="text-sm text-parchment-400 italic">No data yet</p>';
        return;
    }

    // Group by mainCategory and then subcategory
    const hierarchy = {};
    prompts.forEach(p => {
        const main = p.mainCategory || p.category || 'Other';
        const sub = p.subcategory || 'General';

        if (!hierarchy[main]) {
            hierarchy[main] = {
                name: main,
                count: 0,
                subcategories: {}
            };
        }
        hierarchy[main].count++;

        if (!hierarchy[main].subcategories[sub]) {
            hierarchy[main].subcategories[sub] = 0;
        }
        hierarchy[main].subcategories[sub]++;
    });

    // Exclude "Other" category from donut chart
    const otherKey = Object.keys(hierarchy).find(k => k.toLowerCase().trim() === 'other');
    if (otherKey) {
        delete hierarchy[otherKey];
    }

    // Calculate total excluding Other for percentage calculation
    const categorizedTotal = Object.values(hierarchy).reduce((sum, cat) => sum + cat.count, 0);

    if (categorizedTotal === 0) {
        container.innerHTML = '<p class="text-sm text-parchment-400 italic">No categorized data yet</p>';
        return;
    }

    // Convert to sorted array and calculate percentages based on categorized total
    const sortedCategories = Object.values(hierarchy)
        .sort((a, b) => b.count - a.count)
        .map(cat => {
            return {
                name: cat.name,
                count: cat.count,
                percentage: Math.round((cat.count / categorizedTotal) * 100),
                subcategories: Object.entries(cat.subcategories)
                    .map(([name, count]) => ({
                        name: name,
                        count: count,
                        percentage: Math.round((count / cat.count) * 100)
                    }))
                    .sort((a, b) => b.count - a.count)
            };
        });

    state.categories = sortedCategories;
    state.totalCategoryPrompts = prompts.length;

    renderDonutChart(container, sortedCategories);
}

// Donut chart renderer
function renderDonutChart(container, categories) {
    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius * 0.65;

    const topCategories = categories.slice(0, 4);

    let currentAngle = -90;

    const paths = categories.map((cat, index) => {
        const color = chartColors[index % chartColors.length];
        const sliceAngle = (cat.percentage / 100) * 360;

        const endAngle = (index === categories.length - 1)
            ? 270
            : currentAngle + sliceAngle;

        const path = Utils.createArcPath(center, center, innerRadius, outerRadius, currentAngle, endAngle);

        const startAngle = currentAngle;
        currentAngle = endAngle;

        return `
            <path
                d="${path}"
                fill="${color}"
                class="donut-segment"
                data-index="${index}"
                data-category="${Utils.escapeHtml(cat.name)}"
                data-percentage="${cat.percentage}"
                data-start-angle="${startAngle}"
                data-end-angle="${endAngle}"
                style="transform-origin: ${center}px ${center}px; transition: transform 0.2s ease-out, opacity 0.2s ease-out;"
            />
        `;
    }).join('');

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
                    <span id="centerPercent" class="text-4xl font-light tracking-tighter text-slate-900">${state.totalCategoryPrompts || 0}</span>
                    <span id="centerLabel" class="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mt-2 text-center px-4">TOTAL PROMPTS</span>
                </div>
            </div>

            <!-- Key: 2x2 Grid Layout -->
            <div id="categoryGrid" class="grid grid-cols-2 gap-x-8 gap-y-3 w-full mt-8">
                ${topCategories.map((cat, index) => {
        const color = chartColors[index % chartColors.length];
        const percent = Math.round(cat.percentage);
        return `
                        <div class="flex items-center justify-between pb-1.5">
                            <div class="flex items-center gap-2 overflow-hidden">
                                <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></div>
                                <span class="text-sm text-ink-light font-medium whitespace-nowrap overflow-hidden text-ellipsis" title="${Utils.escapeHtml(cat.name)}">${Utils.escapeHtml(cat.name)}</span>
                            </div>
                            <span class="text-sm font-bold text-ink ml-2 flex-shrink-0">${percent}%</span>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    container.style.overflow = 'visible';

    // Add hover event listeners to segments
    const donutContainer = document.getElementById('donutContainer');
    const segments = donutContainer.querySelectorAll('.donut-segment');
    segments.forEach(segment => {
        segment.addEventListener('mouseenter', handleSegmentHover);
        // mousemove too: recreates the breakdown if the overlay was purged
        // while the pointer stayed inside (early-returns while it is alive).
        segment.addEventListener('mousemove', handleSegmentHover);
        segment.addEventListener('mouseleave', handleSegmentLeave);
    });

    donutContainer.addEventListener('mouseleave', handleChartLeave);
}

// Handle segment hover - show subcategory breakdown
function handleSegmentHover(e) {
    const segment = e.target;
    const index = parseInt(segment.dataset.index);
    const category = state.categories[index];

    if (hoveredSegmentIndex === index && document.getElementById('subcategoryOverlay')) return;

    if (hoveredSegmentIndex !== null) {
        const prevSegment = document.querySelector(`.donut-segment[data-index="${hoveredSegmentIndex}"]`);
        if (prevSegment) {
            prevSegment.style.opacity = '1';
            prevSegment.style.transform = 'scale(1)';
            prevSegment.style.filter = 'brightness(1)';
        }
        if (subcategoryOverlay) {
            subcategoryOverlay.remove();
            subcategoryOverlay = null;
        }
    }

    hoveredSegmentIndex = index;

    // Update center text
    const centerPercent = document.getElementById('centerPercent');
    const centerLabel = document.getElementById('centerLabel');
    if (centerPercent) centerPercent.textContent = `${category.percentage}%`;
    if (centerLabel) centerLabel.textContent = category.name;

    // If no subcategories, just scale up
    if (!category.subcategories || category.subcategories.length === 0) {
        segment.style.transform = 'scale(1.05)';
        segment.style.filter = 'brightness(1.05)';
        return;
    }

    segment.style.opacity = '0';

    const startAngle = parseFloat(segment.dataset.startAngle);
    const endAngle = parseFloat(segment.dataset.endAngle);
    const parentColor = segment.getAttribute('fill');

    renderSubcategoryBreakdown(category, startAngle, endAngle, parentColor, index);
}

// Helper: Truncate label text to fit available space
function truncateLabelText(name, percentage, maxWidth) {
    const percentStr = ` (${percentage}%)`;
    const fullText = name + percentStr;

    const charWidth = 2.5;
    const maxChars = Math.floor(maxWidth / charWidth);

    if (fullText.length <= maxChars) {
        return fullText;
    }

    const availableForName = maxChars - percentStr.length - 3;

    if (availableForName < 1) {
        return `...${percentStr}`;
    }

    return name.substring(0, availableForName) + '...' + percentStr;
}

// Render subcategory segments with lines and labels
function renderSubcategoryBreakdown(category, parentStartAngle, parentEndAngle, parentColor, parentIndex) {
    // Purge ALL overlays (including ones mid-fade-out) — rapid segment
    // switching otherwise stacks the old category's labels as ghosts.
    document.querySelectorAll('#subcategoryOverlay').forEach(el => el.remove());
    subcategoryOverlay = null;

    const donutContainer = document.getElementById('donutContainer');
    if (!donutContainer) return;

    const parentCard = donutContainer.closest('.rounded-clay') || donutContainer.closest('section') || donutContainer.parentElement;
    const cardRect = parentCard.getBoundingClientRect();
    const containerRect = donutContainer.getBoundingClientRect();

    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius * 0.65;
    const expandedOuterRadius = outerRadius + 8;

    const donutCenterX = containerRect.left + containerRect.width / 2;
    const availableLeft = donutCenterX - cardRect.left - 20;
    const availableRight = cardRect.right - donutCenterX - 20;

    const overlayPadding = 100;
    const overlaySize = size + (overlayPadding * 2);

    const totalSubPercent = category.subcategories.reduce((sum, sub) => sum + sub.percentage, 0);
    const angleRange = parentEndAngle - parentStartAngle;

    let currentAngle = parentStartAngle;
    const subcategoryColors = Utils.generateSubcategoryColors(parentColor, category.subcategories.length);

    const parentCenterAngle = parentStartAngle + angleRange / 2;
    const allLabelsRightSide = parentCenterAngle > -90 && parentCenterAngle < 90;

    const cardTopPadding = 80;
    const cardBottomPadding = 100;

    const svgBoundsTop = -(containerRect.top - cardRect.top - cardTopPadding) + center;
    const svgBoundsBottom = (cardRect.bottom - containerRect.top - cardBottomPadding) - center + size;

    const effectiveTop = Math.max(20, Math.min(svgBoundsTop, center - 80));
    const effectiveBottom = Math.min(size - 20, Math.max(svgBoundsBottom, center + 80));

    const maxLabelExtentRight = Math.min(availableRight - 10, 100);
    const maxLabelExtentLeft = Math.min(availableLeft - 10, 100);

    const labelData = category.subcategories.map((sub, idx) => {
        const subAngle = (sub.percentage / totalSubPercent) * angleRange;
        const subEndAngle = currentAngle + subAngle;
        const midAngle = (currentAngle + subEndAngle) / 2;
        const midRad = (midAngle * Math.PI) / 180;

        const idealY = center + (expandedOuterRadius + 25) * Math.sin(midRad);
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
            idealY: idealY
        };
        currentAngle = subEndAngle;
        return res;
    });

    // Spreading algorithm
    const numLabels = labelData.length;
    const availableHeight = effectiveBottom - effectiveTop;
    const idealGap = 20;
    const minGap = Math.max(14, Math.min(idealGap, (availableHeight - numLabels * 12) / (numLabels - 1 || 1)));

    const sortedLabels = [...labelData].sort((a, b) => a.y - b.y);

    for (let pass = 0; pass < 15; pass++) {
        let changed = false;

        for (let i = 0; i < sortedLabels.length - 1; i++) {
            const cur = sortedLabels[i];
            const next = sortedLabels[i + 1];
            const gap = next.y - cur.y;

            if (gap < minGap) {
                const overlap = minGap - gap;
                const pushUp = overlap / 2;
                const pushDown = overlap / 2;

                const newCurY = cur.y - pushUp;
                const newNextY = next.y + pushDown;

                if (newCurY >= effectiveTop) {
                    cur.y = newCurY;
                } else {
                    cur.y = effectiveTop;
                    next.y = Math.min(effectiveBottom, next.y + overlap);
                }

                if (newNextY <= effectiveBottom) {
                    next.y = newNextY;
                } else {
                    next.y = effectiveBottom;
                    cur.y = Math.max(effectiveTop, cur.y - overlap);
                }

                changed = true;
            }
        }

        sortedLabels.sort((a, b) => a.y - b.y);

        if (!changed) break;
    }

    labelData.forEach(label => {
        const spreadLabel = sortedLabels.find(s => s.name === label.name);
        if (spreadLabel) {
            label.y = spreadLabel.y;
        }
    });

    // Render
    const segments = [];
    const lines = [];
    const labels = [];

    labelData.forEach((label, idx) => {
        const midRad = label.midRad;

        const lineStartX = center + expandedOuterRadius * Math.cos(midRad);
        const lineStartY = center + expandedOuterRadius * Math.sin(midRad);

        const maxExtent = label.isRightSide ? maxLabelExtentRight : maxLabelExtentLeft;
        const labelOffset = Math.min(55, maxExtent - 20);

        const baseLabelX = label.isRightSide
            ? center + expandedOuterRadius + labelOffset
            : center - expandedOuterRadius - labelOffset;

        const elbowOffset = label.isRightSide ? -25 : 25;
        const baseElbowX = baseLabelX + elbowOffset;

        const finalLabelY = label.y;
        const textAnchor = label.isRightSide ? 'start' : 'end';

        const yDiff = finalLabelY - lineStartY;
        let elbowY;

        if (Math.abs(yDiff) < 15) {
            elbowY = lineStartY;
        } else {
            elbowY = lineStartY + yDiff * 0.3;
        }

        const displayText = truncateLabelText(label.name, label.percentage, maxExtent);

        segments.push(`
            <path
                d="${label.path}"
                fill="${label.color}"
                class="subcategory-segment"
                style="transform-origin: ${center}px ${center}px; animation: subcategoryFadeIn 0.2s ease-out forwards;"
            />
        `);

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
                style="animation: subcategoryLabelFadeIn 0.25s ease-out ${idx * 0.03 + 0.08}s both;"
            >
                ${Utils.escapeHtml(displayText)}
            </text>
        `);
    });

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

    donutContainer.appendChild(subcategoryOverlay);
}

// Handle segment leave
function handleSegmentLeave(e) {
    const segment = e.target;
    const index = parseInt(segment.dataset.index);

    if (hoveredSegmentIndex !== index) return;

    const relatedTarget = e.relatedTarget;
    if (relatedTarget && (relatedTarget.closest('#subcategoryOverlay') || relatedTarget.closest('.donut-segment'))) {
        return;
    }

    hoveredSegmentIndex = null;
    if (subcategoryOverlay) {
        removeSubcategoryOverlayWithAnimation(subcategoryOverlay);
        subcategoryOverlay = null;
    }

    segment.style.opacity = '1';
    segment.style.transform = 'scale(1)';
    segment.style.filter = 'brightness(1)';

    const centerPercent = document.getElementById('centerPercent');
    const centerLabel = document.getElementById('centerLabel');
    if (centerPercent) centerPercent.textContent = state.totalCategoryPrompts;
    if (centerLabel) centerLabel.textContent = 'TOTAL PROMPTS';
}

// Handle leaving the entire donut chart
function handleChartLeave(e) {
    const relatedTarget = e.relatedTarget;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
        return;
    }

    if (subcategoryOverlay) {
        removeSubcategoryOverlayWithAnimation(subcategoryOverlay);
        subcategoryOverlay = null;
    }

    const segments = document.querySelectorAll('.donut-segment');
    segments.forEach(segment => {
        segment.style.opacity = '1';
        segment.style.transform = 'scale(1)';
        segment.style.filter = 'brightness(1)';
    });

    hoveredSegmentIndex = null;

    const centerPercent = document.getElementById('centerPercent');
    const centerLabel = document.getElementById('centerLabel');
    if (centerPercent) centerPercent.textContent = state.totalCategoryPrompts;
    if (centerLabel) centerLabel.textContent = 'TOTAL PROMPTS';
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

// Update the activity trend chart
function updateActivityChart(animate) {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Prepare labels (pre-computed by bucketActivityData)
    const labels = state.dailyActivity.map(item => item.label);

    // Utils.MODEL_COLORS is now used directly

    // 1. Determine the maximum number of "layers" needed (max unique models in a single day)
    let maxLayers = 0;
    state.dailyActivity.forEach(day => {
        const count = Object.keys(day.modelBreakdown).length;
        if (count > maxLayers) maxLayers = count;
    });

    // Ensure at least one layer so chart renders even if empty
    if (maxLayers === 0) maxLayers = 1;

    // 2. Initialize Rank-Based Datasets
    const datasets = Array.from({ length: maxLayers }, (_, i) => ({
        label: `Rank ${i + 1}`,
        data: [],
        backgroundColor: [],
        modelNames: [],
        borderColor: [],
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
        borderRadius: 3,
        borderSkipped: false,
        stack: 'activity',
        barPercentage: 0.7
    }));

    // 3. Fill Datasets Column by Column (Day by Day)
    state.dailyActivity.forEach(day => {
        const dayModels = Object.entries(day.modelBreakdown).map(([name, count]) => ({ name, count }));

        // Sort DESCENDING (Largest first)
        dayModels.sort((a, b) => {
            const diff = b.count - a.count;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < maxLayers; i++) {
            if (i < dayModels.length) {
                const model = dayModels[i];
                // Use standard model colors, fallback to chart colors if not found
                // Note: model names are lowercased in Utils.MODEL_COLORS
                const color = Utils.MODEL_COLORS[model.name.toLowerCase()] ||
                    Utils.CHART_COLORS[i % Utils.CHART_COLORS.length];

                datasets[i].data.push(model.count);
                datasets[i].backgroundColor.push(color);
                datasets[i].borderColor.push(color);
                datasets[i].modelNames.push(model.name.charAt(0).toUpperCase() + model.name.slice(1));
            } else {
                datasets[i].data.push(0);
                datasets[i].backgroundColor.push('transparent');
                datasets[i].borderColor.push('transparent');
                datasets[i].modelNames.push('');
            }
        }
    });

    const maxValue = Math.max(...state.dailyActivity.map(item => item.count), 0);
    const { suggestedMax, stepSize } = calculateChartScales(maxValue);

    if (state.activityChart) {
        state.activityChart.data.labels = labels;
        state.activityChart.data.datasets = datasets;
        state.activityChart.options.scales.y.suggestedMax = suggestedMax;
        state.activityChart.options.scales.y.ticks.stepSize = stepSize;
        state.activityChart.update(animate ? undefined : 'none');
        return;
    }

    state.activityChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 20 }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Manrope', size: 11 },
                        color: '#5e5b56',
                        maxRotation: 0,
                        autoSkip: true
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax,
                    grid: {
                        color: 'rgba(220, 214, 200, 0.5)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { family: 'Manrope', size: 11 },
                        color: '#5e5b56',
                        stepSize
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: true
            },
            animation: {
                duration: 500,
                easing: 'easeOutExpo'
            }
        },
        plugins: [{
            id: 'customHoverEffect',
            afterDraw: (chart) => {
                const activeElements = chart.getActiveElements();
                const now = performance.now();

                const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

                const POP_DURATION = 200;
                const LINE_DURATION = 250;
                const LINE_DELAY = 80;
                const LABEL_DURATION = 200;
                const LABEL_DELAY = 160;
                const EXIT_DURATION = 200;

                if (activeElements && activeElements.length > 0) {
                    const active = activeElements[0];
                    const dsIdx = active.datasetIndex;
                    const bIdx = active.index;

                    if (!activityHoverAnim.active || activityHoverAnim.datasetIndex !== dsIdx || activityHoverAnim.barIndex !== bIdx) {
                        activityHoverAnim.active = true;
                        activityHoverAnim.exiting = false;
                        activityHoverAnim.datasetIndex = dsIdx;
                        activityHoverAnim.barIndex = bIdx;
                        activityHoverAnim.startTime = now;
                        activityHoverAnim.progress = 0;
                        activityHoverAnim.snapshot = null;
                    }
                } else if (activityHoverAnim.active && !activityHoverAnim.exiting) {
                    activityHoverAnim.exiting = true;
                    activityHoverAnim.exitStartTime = now;
                    activityHoverAnim.exitProgress = 0;

                    const dsIdx = activityHoverAnim.datasetIndex;
                    const bIdx = activityHoverAnim.barIndex;
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (meta && meta.data[bIdx]) {
                        const bar = meta.data[bIdx];
                        const dataset = chart.data.datasets[dsIdx];
                        const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);

                        const color = dataset.backgroundColor[bIdx] || dataset.backgroundColor;
                        const modelName = dataset.modelNames ? dataset.modelNames[bIdx] : dataset.label;

                        activityHoverAnim.snapshot = {
                            x, y, base, width,
                            color,
                            modelName,
                            value: dataset.data[bIdx],
                            dayTotal: state.dailyActivity[bIdx]?.count || 0,
                            chartArea: { ...chart.chartArea }
                        };
                    }
                }

                if (!activityHoverAnim.active) return;

                let drawData;
                if (activityHoverAnim.exiting && activityHoverAnim.snapshot) {
                    drawData = activityHoverAnim.snapshot;
                } else {
                    const dsIdx = activityHoverAnim.datasetIndex;
                    const bIdx = activityHoverAnim.barIndex;
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (!meta || !meta.data[bIdx]) return;
                    const bar = meta.data[bIdx];
                    const dataset = chart.data.datasets[dsIdx];
                    const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);

                    const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[bIdx] : dataset.backgroundColor;
                    const modelName = dataset.modelNames ? dataset.modelNames[bIdx] : dataset.label;

                    drawData = {
                        x, y, base, width,
                        color,
                        modelName,
                        value: dataset.data[bIdx],
                        dayTotal: state.dailyActivity[bIdx]?.count || 0,
                        chartArea: { ...chart.chartArea }
                    };
                }

                let masterT;
                if (activityHoverAnim.exiting) {
                    const elapsed = now - activityHoverAnim.exitStartTime;
                    const rawT = Math.min(elapsed / EXIT_DURATION, 1);
                    masterT = 1 - easeOutQuart(rawT);
                    activityHoverAnim.exitProgress = rawT;
                    if (rawT >= 1) {
                        activityHoverAnim.active = false;
                        activityHoverAnim.exiting = false;
                        activityHoverAnim.snapshot = null;
                        return;
                    }
                } else {
                    const elapsed = now - activityHoverAnim.startTime;
                    activityHoverAnim.progress = Math.min(elapsed / (LABEL_DELAY + LABEL_DURATION), 1);
                    masterT = 1;
                }

                const ctx2d = chart.ctx;
                const { x, y, base, width, color, modelName, value, dayTotal, chartArea } = drawData;
                const height = Math.abs(base - y);
                const percentage = dayTotal > 0 ? Math.round((value / dayTotal) * 100) : 0;

                let popT, lineT, labelT;
                if (activityHoverAnim.exiting) {
                    popT = lineT = labelT = masterT;
                } else {
                    const elapsed = now - activityHoverAnim.startTime;
                    popT = easeOutQuart(Math.min(Math.max(elapsed, 0) / POP_DURATION, 1));
                    lineT = easeOutQuart(Math.min(Math.max(elapsed - LINE_DELAY, 0) / LINE_DURATION, 1));
                    labelT = easeOutQuart(Math.min(Math.max(elapsed - LABEL_DELAY, 0) / LABEL_DURATION, 1));
                }

                // Bar pop-out
                const maxExtraW = 6;
                const maxExtraH = 4;
                const curExtraW = maxExtraW * popT;
                const curExtraH = maxExtraH * popT;
                const popWidth = width + curExtraW;
                const popHeight = height + curExtraH;
                const popX = x - popWidth / 2;
                const popY = y - (curExtraH / 2);

                ctx2d.save();
                ctx2d.globalAlpha = Math.max(popT, 0.01);
                ctx2d.shadowColor = `rgba(0, 0, 0, ${0.2 * popT})`;
                ctx2d.shadowBlur = 10 * popT;
                ctx2d.shadowOffsetY = 4 * popT;
                ctx2d.fillStyle = color;
                ctx2d.filter = `brightness(${1 + 0.1 * popT})`;
                const radius = 4;
                ctx2d.beginPath();
                ctx2d.roundRect(popX, popY, popWidth, popHeight, radius);
                ctx2d.fill();
                ctx2d.restore();

                // Connector line with smart routing
                if (lineT > 0) {
                    ctx2d.save();
                    ctx2d.strokeStyle = color;
                    ctx2d.lineWidth = 1.5;
                    ctx2d.lineCap = 'round';
                    ctx2d.globalAlpha = Math.min(lineT * 3, 1);

                    const centerY = popY + popHeight / 2;
                    const centerX = popX + popWidth / 2;

                    const isRightSide = x > (chartArea.left + (chartArea.right - chartArea.left) / 2);

                    const getStackTop = (idx) => {
                        let minTop = chartArea.bottom;
                        chart.data.datasets.forEach((_, i) => {
                            const meta = chart.getDatasetMeta(i);
                            if (meta.hidden) return;
                            const el = meta.data[idx];
                            if (el && !el.skip) {
                                const props = el.getProps(['y'], true);
                                if (props.y < minTop) minTop = props.y;
                            }
                        });
                        return minTop;
                    };

                    const currentStackTop = getStackTop(activityHoverAnim.barIndex);
                    const neighborIdx = isRightSide ? activityHoverAnim.barIndex - 1 : activityHoverAnim.barIndex + 1;
                    const neighborStackTop = (neighborIdx >= 0 && neighborIdx < state.dailyActivity.length)
                        ? getStackTop(neighborIdx)
                        : chartArea.bottom;

                    const highestPeak = Math.min(currentStackTop, neighborStackTop);
                    const safeY = Math.min(highestPeak - 15, centerY - 30);

                    const reach = 30;
                    const targetX = isRightSide ? centerX - reach : centerX + reach;

                    const t = lineT;
                    const p0 = { x: centerX, y: centerY };
                    const p1 = { x: centerX, y: safeY };
                    const p2 = { x: targetX, y: safeY };

                    const q0 = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
                    const q1 = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
                    const b = { x: q0.x + (q1.x - q0.x) * t, y: q0.y + (q1.y - q0.y) * t };

                    ctx2d.beginPath();
                    ctx2d.moveTo(centerX, centerY);
                    ctx2d.quadraticCurveTo(q0.x, q0.y, b.x, b.y);
                    ctx2d.stroke();
                    ctx2d.restore();

                    // Label text
                    if (labelT > 0) {
                        ctx2d.save();
                        ctx2d.globalAlpha = labelT;
                        ctx2d.font = 'bold 11px "Manrope", sans-serif';
                        ctx2d.textBaseline = 'middle';

                        const labelText = `${modelName} ${percentage}%`;
                        const textMetrics = ctx2d.measureText(labelText);
                        const textWidth = textMetrics.width;
                        const boxPadding = 8;
                        const boxHeight = 24;
                        const boxWidth = textWidth + (boxPadding * 2);

                        const finalLabelY = safeY;
                        const boxX = isRightSide ? targetX - boxWidth : targetX;
                        const boxY = finalLabelY - (boxHeight / 2);

                        ctx2d.shadowColor = 'rgba(0, 0, 0, 0.1)';
                        ctx2d.shadowBlur = 6;
                        ctx2d.shadowOffsetY = 3;
                        ctx2d.fillStyle = 'rgba(255, 255, 255, 0.98)';
                        ctx2d.beginPath();
                        ctx2d.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
                        ctx2d.fill();

                        ctx2d.shadowColor = 'transparent';
                        ctx2d.fillStyle = '#4b5563';
                        ctx2d.textAlign = 'center';
                        ctx2d.fillText(labelText, boxX + boxWidth / 2, finalLabelY);
                        ctx2d.restore();
                    }
                }

                // Request next frame if animation is still running
                const animStillRunning = activityHoverAnim.exiting
                    ? activityHoverAnim.exitProgress < 1
                    : activityHoverAnim.progress < 1;
                if (animStillRunning) {
                    if (activityHoverAnim.rafId) cancelAnimationFrame(activityHoverAnim.rafId);
                    activityHoverAnim.rafId = requestAnimationFrame(() => {
                        activityHoverAnim.rafId = null;
                        chart.draw();
                    });
                }
            }
        }]
    });
}

/**
 * Helper to calculate chart scales consistently
 */
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

// getDaySuffix is now in utils/common.js

// Update contribution heatmap
function updateContributionHeatmap() {
    const container = document.getElementById('contributionHeatmap');
    if (!container) return;

    // Initialize custom tooltip if not exists
    if (!document.getElementById('heatmap-tooltip')) {
        const tooltip = document.createElement('div');
        tooltip.id = 'heatmap-tooltip';
        tooltip.className = 'fixed hidden pointer-events-none z-50 px-3 py-1.5 text-xs font-bold text-white bg-sage-900 rounded-md shadow-lg transform -translate-x-1/2 -translate-y-full transition-none whitespace-nowrap';
        document.body.appendChild(tooltip);

        document.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.heatmap-cell');
            if (cell) {
                const date = cell.getAttribute('data-date');
                const count = cell.getAttribute('data-count');
                const tooltipEl = document.getElementById('heatmap-tooltip');

                if (date && count && tooltipEl) {
                    tooltipEl.textContent = `${count} contribution${count !== '1' ? 's' : ''} on ${date} `;
                    tooltipEl.classList.remove('hidden');

                    const rect = cell.getBoundingClientRect();
                    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
                    tooltipEl.style.top = `${rect.top - 8}px`;
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const cell = e.target.closest('.heatmap-cell');
            if (cell) {
                const tooltipEl = document.getElementById('heatmap-tooltip');
                if (tooltipEl) tooltipEl.classList.add('hidden');
            }
        });
    }

    // Calculate total contributions
    const totalContributions = state.heatmapData.reduce((sum, day) => sum + day.count, 0);
    const maxCount = Math.max(...state.heatmapData.map(d => d.count), 1);

    // Group by weeks
    const weeks = [];
    let currentWeek = [];

    state.heatmapData.forEach((day, index) => {
        currentWeek.push(day);
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });
    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }

    // Month labels logic
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
        const firstDay = week[0].date;
        if (firstDay && firstDay.getMonth() !== lastMonth) {
            monthLabels.push({
                month: firstDay.toLocaleString('default', { month: 'short' }),
                weekIndex: weekIndex
            });
            lastMonth = firstDay.getMonth();
        }
    });

    const isRecent = state.heatmapView === 'recent';

    let html = `
                <div class="flex flex-col w-full">
            <div class="flex justify-between items-end mb-2">
                <h4 class="text-sm font-sans font-medium text-ink">${totalContributions} contributions ${isRecent ? 'in the last year' : `in ${state.heatmapView}`}</h4>

                <!-- Legend -->
                <div class="flex items-center gap-2 text-[10px] text-ink-light">
                    <span>Less</span>
                    <div class="flex gap-[2px]">
                        <div class="w-[10px] h-[10px] rounded-[2px] heatmap-level-0"></div>
                        <div class="w-[10px] h-[10px] rounded-[2px] heatmap-level-1"></div>
                        <div class="w-[10px] h-[10px] rounded-[2px] heatmap-level-2"></div>
                        <div class="w-[10px] h-[10px] rounded-[2px] heatmap-level-3"></div>
                        <div class="w-[10px] h-[10px] rounded-[2px] heatmap-level-4"></div>
                    </div>
                    <span>More</span>
                </div>
            </div>

            <div class="flex gap-4">
                <!-- Heatmap Grid Area -->
                <div class="flex-1 overflow-hidden" id="heatmap-scroll-container">
                    <div class="flex">
                        <!-- Weekday labels -->
                        <div class="flex flex-col gap-[3px] pr-2 pt-[18px] text-[9px] text-ink-light h-auto">
                            <div class="h-[10px]"></div> <!-- Sun -->
                            <div class="h-[10px] leading-[10px]">Mon</div>
                            <div class="h-[10px]"></div> <!-- Tue -->
                            <div class="h-[10px] leading-[10px]">Wed</div>
                            <div class="h-[10px]"></div> <!-- Thu -->
                            <div class="h-[10px] leading-[10px]">Fri</div>
                            <div class="h-[10px]"></div> <!-- Sat -->
                        </div>

                        <div class="flex flex-col gap-1 flex-1 relative">
                            <!-- Month labels -->
                            <div class="flex relative h-[14px] text-[9px] text-ink-light w-full">
                                ${monthLabels.map((lbl, i) => {
        return `<div style="position: absolute; left: ${lbl.weekIndex * 13}px">${lbl.month}</div>`;
    }).join('')}
                            </div>

                            <!-- Heatmap Grid -->
                            <div class="flex gap-[3px]">
                                ${weeks.map(week => {
        return `
                                        <div class="flex flex-col gap-[3px]">
                                            ${week.map(day => {
            if (!day || !day.inRange) return '<div class="w-[10px] h-[10px]"></div>';
            const level = getHeatmapLevel(day.count, maxCount);
            const dateStr = day.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            return `<div class="heatmap-cell w-[10px] h-[10px] rounded-[2px] heatmap-level-${level}" data-date="${dateStr}" data-count="${day.count}"></div>`;
        }).join('')}
                                        </div>
                                    `;
    }).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Year Selection Sidebar -->
                <div class="flex flex-col gap-1 min-w-[60px] pt-[14px]">
                    <button onclick="setHeatmapView('recent')"
                        class="px-2 py-1 text-[10px] rounded-md transition-colors text-left ${state.heatmapView === 'recent' ? 'bg-sage-500 text-white font-bold' : 'text-ink-light hover:bg-parchment-200'}">
                        Last Year
                    </button>
                    <button onclick="setHeatmapView('2026')"
                        class="px-2 py-1 text-[10px] rounded-md transition-colors text-left ${state.heatmapView === '2026' ? 'bg-sage-500 text-white font-bold' : 'text-ink-light hover:bg-parchment-200'}">
                        2026
                    </button>
                    <button onclick="setHeatmapView('2025')"
                        class="px-2 py-1 text-[10px] rounded-md transition-colors text-left ${state.heatmapView === '2025' ? 'bg-sage-500 text-white font-bold' : 'text-ink-light hover:bg-parchment-200'}">
                        2025
                    </button>
                </div>
            </div>
        </div >
                `;

    container.innerHTML = html;
}

// Set heatmap view year
function setHeatmapView(view) {
    state.heatmapView = view;
    processActivityData();
    updateContributionHeatmap();
}
window.setHeatmapView = setHeatmapView;

// Get heatmap color level (0-4)
function getHeatmapLevel(count, maxCount) {
    if (count === 0) return 0;
    if (maxCount <= 4) return count;

    const ratio = count / maxCount;
    if (ratio <= 0.2) return 1;
    if (ratio <= 0.4) return 2;
    if (ratio <= 0.7) return 3;
    return 4;
}

// formatCategory is now in utils/common.js

// Navigate back to referrer or manager dashboard
function navigateBack() {
    sessionStorage.removeItem('selectedEmployee');
    const referrer = sessionStorage.getItem('employeeDetailReferrer');
    sessionStorage.removeItem('employeeDetailReferrer');

    if (referrer === 'teamOverview') {
        if (window.navigateWithTransition) {
            navigateWithTransition('teamOverview', '../team/teamOverview.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('teamOverview');
        } else {
            window.location.href = '../team/teamOverview.html';
        }
    } else {
        if (window.navigateWithTransition) {
            navigateWithTransition('index', '../dashboard/index.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('index');
        } else {
            window.location.href = '../dashboard/index.html';
        }
    }
}
window.navigateBack = navigateBack;

// escapeHtml and dynamic styles are now in utils/common.js
