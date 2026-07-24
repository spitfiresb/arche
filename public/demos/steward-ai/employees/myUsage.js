// GenAI Monitor - My Usage Page JavaScript

const state = {
    prompts: [],
    activityChart: null,
    dailyActivity: [],
    activityMap: new Map(), // date string -> count, shared across stats & heatmap
    heatmapData: [],
    heatmapView: 'recent', // 'recent', '2026', '2025'
    userProfile: null,
    categories: [],
    totalCategoryPrompts: 0,
    dateFilter: { preset: 'all', startDate: null, endDate: null }
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
    progress: 0, // 0..1 for enter, tracks current interpolated value
    exiting: false,
    exitStartTime: 0,
    exitProgress: 0,
    // Snapshot of bar data so we can still draw during exit
    snapshot: null,
    rafId: null
};

// Fixed colors for chart slices (matched across UI)
// Fixed colors for chart slices (matched across UI)
const chartColors = Utils.CHART_COLORS || [
    '#4d6159', '#c2a894', '#7d8c82', '#5e503f', '#9ea39a', '#a7877f', '#6b705c', '#1a1a2e'
];

document.addEventListener('DOMContentLoaded', () => {
    // Track load time for transition synchronization
    window.pageLoadTime = window.performance.now();

    // Apply enter animation immediately for smooth transition
    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    // Initialize event listeners and load data in background
    initEventListeners();

    // Initialize shared date filter component
    window.dateFilterInstance = DateFilter.init({
        mountId: 'date-filter-mount',
        storageKey: 'myUsageDateFilter',
        onFilterChange: (filterState) => {
            state.dateFilter = filterState;
            updateAllDisplays(true);
        },
    });
    if (window.dateFilterInstance) {
        state.dateFilter = window.dateFilterInstance.getState();
    }

    if (window.showPageLoadingOverlay) window.showPageLoadingOverlay();
    loadInitialData().then(() => {
        if (window.hidePageLoadingOverlay) window.hidePageLoadingOverlay();
    });
});

// Initialize event listeners from main process
function initEventListeners() {
    if (!window.electronAPI) {
        // Load demo data for browser preview
        loadDemoData();
        return;
    }

    // Listen for new captured prompts
    window.electronAPI.onPromptCaptured((prompt) => {
        // Real-time prompts have 'timestamp' but not 'createdAt' — normalize
        if (!prompt.createdAt && prompt.timestamp) {
            prompt.createdAt = prompt.timestamp;
        }
        state.prompts.unshift(prompt);
        updateAllDisplays();
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

// Load demo data for browser preview
function loadDemoData() {
    // Sample prompts for demonstration
    const categories = ['debugging code', 'writing email', 'creating presentation', 'researching topic', 'explaining concept', 'analyzing data', 'writing content'];
    const sources = ['claude', 'chatgpt', 'cursor'];

    const now = new Date();
    state.prompts = [];

    // Generate ~500 sample prompts over the past year
    for (let i = 0; i < 500; i++) {
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

    // Override the first 200 prompts to make 'debugging code' the dominant category
    for (let i = 0; i < 200 && i < state.prompts.length; i++) {
        state.prompts[i].category = 'debugging code';
    }

    updateAllDisplays();
}

// Load initial data from main process
async function loadInitialData() {
    if (!window.electronAPI) return;

    try {
        // Load user profile
        const profile = await window.electronAPI.getUserProfile();
        if (profile) {
            state.userProfile = profile;
            updateUserProfile(profile);
        }

        // Load prompts
        const newPrompts = await window.electronAPI.getPrompts({ limit: 2000 });

        state.prompts = newPrompts;

        // Delay update if we just entered the page to let the transition finish
        const TRANSITION_DURATION = 400;
        const timeSinceLoad = window.performance.now() - (window.pageLoadTime || 0);

        if (timeSinceLoad < TRANSITION_DURATION) {
            setTimeout(() => {
                requestAnimationFrame(() => updateAllDisplays());
            }, TRANSITION_DURATION - timeSinceLoad);
        } else {
            requestAnimationFrame(() => updateAllDisplays());
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

// Filter prompts to the currently selected date window
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
    // Apply date filter before processing (heatmap keeps its own view logic)
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
    // Normalize to end of day
    now.setHours(23, 59, 59, 999);

    // Build map of date string -> count (stored on state for reuse in updateStatsCards)
    state.activityMap = new Map();
    state.modelActivityMap = new Map();
    prompts.forEach(prompt => {
        const date = new Date(prompt.createdAt);
        const dateStr = date.toDateString();
        state.activityMap.set(dateStr, (state.activityMap.get(dateStr) || 0) + 1);
        // Per-model count
        const source = (prompt.source || 'unknown').toLowerCase();
        if (!state.modelActivityMap.has(dateStr)) state.modelActivityMap.set(dateStr, {});
        const dayMap = state.modelActivityMap.get(dateStr);
        dayMap[source] = (dayMap[source] || 0) + 1;
    });
    const activityMap = state.activityMap;

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

        // Always show full year even if in future
    }

    // Align start to Sunday for consistent grid
    const dayOfWeek = start.getDay(); // 0 is Sunday
    const graphStartDate = new Date(start);
    graphStartDate.setDate(graphStartDate.getDate() - dayOfWeek);

    // Generate daily data
    for (let d = new Date(graphStartDate); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toDateString();
        state.heatmapData.push({
            date: new Date(d),
            count: activityMap.get(dateStr) || 0,
            inRange: d >= start && d <= end // Flag to dim days outside range if needed
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
        // Reuse activityMap built in processActivityData (keys = unique active days)
        const numDays = state.activityMap.size || 1;
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

// Update category breakdown display
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

    // Exclude "Other" category from donut chart (matching backend logic in handleDashboardCategories)
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

    renderMyUsageDonut(container, sortedCategories);
}

// Custom donut renderer for myUsage - replicating main dashboard logic exactly
function renderMyUsageDonut(container, categories) {
    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius * 0.65;

    const topCategories = categories.slice(0, 4); // Show top 4 in 2x2 grid

    let currentAngle = -90; // Start from top (12 o'clock position)

    // Render ALL categories in donut (like main dashboard), not just top 4
    // Use raw count fractions for angles to avoid rounding gaps
    const totalCount = categories.reduce((sum, cat) => sum + cat.count, 0);
    const paths = categories.map((cat, index) => {
        const color = chartColors[index % chartColors.length];
        const sliceAngle = (cat.count / totalCount) * 360;

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

    // Clear old conic gradient background and ensure overflow is visible for subcategory labels
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

    // Add mouseleave on container to clean up when leaving the chart entirely
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

    // Approximate character width (~2.5px per char at font-size 10 for proportional fonts)
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

// Render subcategory segments with lines and labels - replicating main dashboard logic
function renderSubcategoryBreakdown(category, parentStartAngle, parentEndAngle, parentColor, parentIndex) {
    // Purge ALL overlays (including ones mid-fade-out) — rapid segment
    // switching otherwise stacks the old category's labels as ghosts.
    document.querySelectorAll('#subcategoryOverlay').forEach(el => el.remove());
    subcategoryOverlay = null;

    const donutContainer = document.getElementById('donutContainer');
    if (!donutContainer) return;

    // Get the parent card element for boundary calculations
    const parentCard = donutContainer.closest('.rounded-clay') || donutContainer.closest('section') || donutContainer.parentElement;
    const cardRect = parentCard.getBoundingClientRect();
    const containerRect = donutContainer.getBoundingClientRect();

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
    // Leave room for the header and legend below
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
            idx, // Unique identifier for matching after spreading
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

    // Multi-pass spreading with boundary awareness
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

        // Re-sort after adjustments
        sortedLabels.sort((a, b) => a.y - b.y);

        if (!changed) break;
    }

    // Update original labelData with spread positions (match by unique idx)
    labelData.forEach(label => {
        const spreadLabel = sortedLabels.find(s => s.idx === label.idx);
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
                style="transform-origin: ${center}px ${center}px; animation: subcategoryFadeIn 0.2s ease-out forwards;"
            />
        `);

        // Connector line with bezier curve for smoother appearance
        const controlX = lineStartX + (baseElbowX - lineStartX) * 0.5;

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
                style="animation: subcategoryLabelFadeIn 0.25s ease-out ${idx * 0.03 + 0.08}s both;"
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

    donutContainer.appendChild(subcategoryOverlay);
}

// Reset donut center text to default state
function resetDonutCenter() {
    const centerPercent = document.getElementById('centerPercent');
    const centerLabel = document.getElementById('centerLabel');
    if (centerPercent) centerPercent.textContent = state.totalCategoryPrompts;
    if (centerLabel) centerLabel.textContent = 'TOTAL PROMPTS';
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

    resetDonutCenter();
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

    resetDonutCenter();
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
    // datasets[0] = Rank 1 (Largest), datasets[1] = Rank 2, etc.
    const datasets = Array.from({ length: maxLayers }, (_, i) => ({
        label: `Rank ${i + 1}`, // Internal label, not shown
        data: [],
        backgroundColor: [], // Array of colors per bar
        modelNames: [],      // Custom array: Model Name per bar
        borderColor: [],      // Array of border colors per bar
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
        // Get models for this day
        const dayModels = Object.entries(day.modelBreakdown).map(([name, count]) => ({ name, count }));

        // Sort DESCENDING (Largest first) -> Largest goes to Index 0 (Bottom of Stack)
        dayModels.sort((a, b) => {
            const diff = b.count - a.count; // Large -> Small
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });

        // Distribute into ranks
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
                // No model for this rank on this day
                datasets[i].data.push(0);
                datasets[i].backgroundColor.push('transparent'); // Invisible
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

                // Easing: cubic-bezier(0.25, 1, 0.5, 1) approximation
                const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

                // Animation durations (ms) — matched to donut chart feel
                const POP_DURATION = 200;   // subcategoryFadeIn 0.2s
                const LINE_DURATION = 250;  // subcategoryLineGrow 0.3s
                const LINE_DELAY = 80;      // slight delay after pop starts
                const LABEL_DURATION = 200; // subcategoryLabelFadeIn 0.25s
                const LABEL_DELAY = 160;    // after line is ~60% drawn
                const EXIT_DURATION = 200;  // subcategoryFadeOut 0.2s

                // Detect hover change
                if (activeElements && activeElements.length > 0) {
                    const active = activeElements[0];
                    const dsIdx = active.datasetIndex;
                    const bIdx = active.index;

                    if (!activityHoverAnim.active || activityHoverAnim.datasetIndex !== dsIdx || activityHoverAnim.barIndex !== bIdx) {
                        // New hover target — start enter animation
                        activityHoverAnim.active = true;
                        activityHoverAnim.exiting = false;
                        activityHoverAnim.datasetIndex = dsIdx;
                        activityHoverAnim.barIndex = bIdx;
                        activityHoverAnim.startTime = now;
                        activityHoverAnim.progress = 0;
                        activityHoverAnim.snapshot = null;
                    }
                } else if (activityHoverAnim.active && !activityHoverAnim.exiting) {
                    // Just lost hover — start exit animation
                    activityHoverAnim.exiting = true;
                    activityHoverAnim.exitStartTime = now;
                    activityHoverAnim.exitProgress = 0;

                    // Snapshot the current draw data so we can still render during exit
                    const dsIdx = activityHoverAnim.datasetIndex;
                    const bIdx = activityHoverAnim.barIndex;
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (meta && meta.data[bIdx]) {
                        const bar = meta.data[bIdx];
                        const dataset = chart.data.datasets[dsIdx];
                        const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);

                        // FIX: Retrieve dynamic color and model name from arrays
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

                // Nothing to draw
                if (!activityHoverAnim.active) return;

                // Determine data source (live bar or snapshot during exit)
                let drawData;
                if (activityHoverAnim.exiting && activityHoverAnim.snapshot) {
                    const s = activityHoverAnim.snapshot;
                    drawData = s;
                } else {
                    const dsIdx = activityHoverAnim.datasetIndex;
                    const bIdx = activityHoverAnim.barIndex;
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (!meta || !meta.data[bIdx]) return;
                    const bar = meta.data[bIdx];
                    const dataset = chart.data.datasets[dsIdx];
                    const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);

                    // FIX: Retrieve dynamic color and model name from arrays
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

                // Calculate animation progress
                let masterT; // 0..1 overall animation factor
                if (activityHoverAnim.exiting) {
                    const elapsed = now - activityHoverAnim.exitStartTime;
                    const rawT = Math.min(elapsed / EXIT_DURATION, 1);
                    masterT = 1 - easeOutQuart(rawT); // reverse
                    activityHoverAnim.exitProgress = rawT;
                    if (rawT >= 1) {
                        activityHoverAnim.active = false;
                        activityHoverAnim.exiting = false;
                        activityHoverAnim.snapshot = null;
                        return; // exit done
                    }
                } else {
                    const elapsed = now - activityHoverAnim.startTime;
                    // Use the longest sub-animation to determine overall progress for requesting redraws
                    activityHoverAnim.progress = Math.min(elapsed / (LABEL_DELAY + LABEL_DURATION), 1);
                    masterT = 1; // individual sub-animations have their own timing
                }

                const ctx = chart.ctx;
                const { x, y, base, width, color, modelName, value, dayTotal, chartArea } = drawData;
                const height = Math.abs(base - y);
                const percentage = dayTotal > 0 ? Math.round((value / dayTotal) * 100) : 0;

                // --- Sub-animation progress calculations ---
                let popT, lineT, labelT;
                if (activityHoverAnim.exiting) {
                    popT = lineT = labelT = masterT;
                } else {
                    const elapsed = now - activityHoverAnim.startTime;
                    popT = easeOutQuart(Math.min(Math.max(elapsed, 0) / POP_DURATION, 1));
                    lineT = easeOutQuart(Math.min(Math.max(elapsed - LINE_DELAY, 0) / LINE_DURATION, 1));
                    labelT = easeOutQuart(Math.min(Math.max(elapsed - LABEL_DELAY, 0) / LABEL_DURATION, 1));
                }

                // --- 1. Bar pop-out (scale from original to expanded) ---
                const maxExtraW = 6;
                const maxExtraH = 4;
                const curExtraW = maxExtraW * popT;
                const curExtraH = maxExtraH * popT;
                const popWidth = width + curExtraW;
                const popHeight = height + curExtraH;
                const popX = x - popWidth / 2;
                const popY = y - (curExtraH / 2);

                ctx.save();
                ctx.globalAlpha = Math.max(popT, 0.01); // slight fade-in for the shadow
                ctx.shadowColor = `rgba(0, 0, 0, ${0.2 * popT})`;
                ctx.shadowBlur = 10 * popT;
                ctx.shadowOffsetY = 4 * popT;
                ctx.fillStyle = color;
                ctx.filter = `brightness(${1 + 0.1 * popT})`;
                const radius = 4;
                ctx.beginPath();
                ctx.roundRect(popX, popY, popWidth, popHeight, radius);
                ctx.fill();
                ctx.restore();

                // --- 2. Connector line with Smart Routing ---
                if (lineT > 0) {
                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.lineCap = 'round';
                    ctx.globalAlpha = Math.min(lineT * 3, 1);

                    const centerY = popY + popHeight / 2;
                    const centerX = popX + popWidth / 2;

                    const isRightSide = x > (chartArea.left + (chartArea.right - chartArea.left) / 2);

                    // --- SMART INWARD ROUTING LOGIC ---
                    // 1. Find the top of the current stack (min Y)
                    const getStackTop = (idx) => {
                        let minTop = chartArea.bottom;
                        chart.data.datasets.forEach((ds, i) => {
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

                    // 2. Find the neighbor TOWARDS THE CENTER (Inward)
                    // If Right Side -> Route Left (idx - 1)
                    // If Left Side -> Route Right (idx + 1)
                    const neighborIdx = isRightSide ? activityHoverAnim.barIndex - 1 : activityHoverAnim.barIndex + 1;

                    const neighborStackTop = (neighborIdx >= 0 && neighborIdx < state.dailyActivity.length)
                        ? getStackTop(neighborIdx)
                        : chartArea.bottom;

                    // 3. Determine "Safe Altitude"
                    const highestPeak = Math.min(currentStackTop, neighborStackTop);
                    // Minimal climb is 25px, but ensure we clear the peak
                    const safeY = Math.min(highestPeak - 15, centerY - 30);

                    // 4. Define Curved Path
                    // Control Point is the corner (centerX, safeY)
                    // Target is (targetX, safeY)
                    const reach = 30;
                    const targetX = isRightSide
                        ? centerX - reach  // Route Left
                        : centerX + reach; // Route Right

                    // Curve Animation logic is tricky with bezier
                    // We can approximate the drawing progress by interpolating the points

                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);

                    // Simple Quadratic Curve
                    // P0 = (centerX, centerY)
                    // P1 = (centerX, safeY) (Control Point - corner)
                    // P2 = (targetX, safeY) (End Point)

                    // De Casteljau's algorithm for partial curve drawing
                    const t = lineT;
                    const p0 = { x: centerX, y: centerY };
                    const p1 = { x: centerX, y: safeY };
                    const p2 = { x: targetX, y: safeY };

                    // Interpolate points for time t
                    const q0 = {
                        x: p0.x + (p1.x - p0.x) * t,
                        y: p0.y + (p1.y - p0.y) * t
                    };
                    const q1 = {
                        x: p1.x + (p2.x - p1.x) * t,
                        y: p1.y + (p2.y - p1.y) * t
                    };
                    const b = {
                        x: q0.x + (q1.x - q0.x) * t,
                        y: q0.y + (q1.y - q0.y) * t
                    };

                    // Draw the partial curve
                    ctx.quadraticCurveTo(q0.x, q0.y, b.x, b.y);
                    ctx.stroke();
                    ctx.restore();

                    // --- 3. Label text (fades in) ---
                    if (labelT > 0) {
                        ctx.save();
                        ctx.globalAlpha = labelT;
                        ctx.font = 'bold 11px "Manrope", sans-serif';
                        ctx.textBaseline = 'middle';

                        const labelText = `${modelName} ${percentage}%`;
                        const textMetrics = ctx.measureText(labelText);
                        const textWidth = textMetrics.width;
                        const boxPadding = 8;
                        const boxHeight = 24;
                        const boxWidth = textWidth + (boxPadding * 2);

                        // Center label vertically on the line end (safeY)
                        const finalLabelY = safeY;

                        // Box position
                        // If routing Left (isRightSide), box is to the Left of targetX
                        // If routing Right (!isRightSide), box is to the Right of targetX
                        const boxX = isRightSide
                            ? targetX - boxWidth
                            : targetX;

                        const boxY = finalLabelY - (boxHeight / 2);

                        // Draw rounded background box
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetY = 3;
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';

                        ctx.beginPath();
                        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
                        ctx.fill();

                        // Draw Text
                        ctx.shadowColor = 'transparent';
                        ctx.fillStyle = '#4b5563'; // slightly darker gray

                        // Text alignment inside the box
                        ctx.textAlign = 'center';
                        const textDrawX = boxX + (boxWidth / 2);

                        ctx.fillText(labelText, textDrawX, finalLabelY);
                        ctx.restore();
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

        // Add event listeners for tooltip behavior using delegation
        document.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.heatmap-cell');
            if (cell) {
                const date = cell.getAttribute('data-date');
                const count = cell.getAttribute('data-count');
                const tooltipEl = document.getElementById('heatmap-tooltip');

                if (date && count && tooltipEl) {
                    tooltipEl.textContent = `${count} contribution${count !== '1' ? 's' : ''} on ${date}`;
                    tooltipEl.classList.remove('hidden');

                    const rect = cell.getBoundingClientRect();
                    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
                    tooltipEl.style.top = `${rect.top - 8}px`; // 8px spacing
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

    // Calculate total contributions (only count days within the selected range)
    const totalContributions = state.heatmapData
        .filter(day => day.inRange)
        .reduce((sum, day) => sum + day.count, 0);
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
    // Push last partial week if any
    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }

    // Month labels logic
    // We need to place month labels at the approximate week index where the month starts
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
        // Use the first day of the week to determine month
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
                <!-- Headmap Grid Area -->
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
        // Cell width 10px + gap 3px = 13px per column
        // This is an approximation, might need fine tuning or a true grid layout
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

                <!-- Year Selection Sidebar (dynamically generated) -->
                <div class="flex flex-col gap-1 min-w-[60px] pt-[14px]">
                    <button onclick="setHeatmapView('recent')" 
                        class="px-2 py-1 text-[10px] rounded-md transition-colors text-left ${state.heatmapView === 'recent' ? 'bg-sage-500 text-white font-bold' : 'text-ink-light hover:bg-parchment-200'}">
                        Last Year
                    </button>
                    ${getHeatmapYearButtons()}
                </div>
            </div>
        </div >
                `;

    container.innerHTML = html;
}

// Generate year buttons dynamically based on the current year and earliest prompt
function getHeatmapYearButtons() {
    const currentYear = new Date().getFullYear();
    let earliestYear = currentYear;

    // Find the earliest year in prompts data
    state.prompts.forEach(p => {
        const year = new Date(p.createdAt).getFullYear();
        if (year < earliestYear) earliestYear = year;
    });

    const buttons = [];
    for (let y = currentYear; y >= earliestYear; y--) {
        const yearStr = String(y);
        const isActive = state.heatmapView === yearStr;
        buttons.push(`
            <button onclick="setHeatmapView('${yearStr}')" 
                class="px-2 py-1 text-[10px] rounded-md transition-colors text-left ${isActive ? 'bg-sage-500 text-white font-bold' : 'text-ink-light hover:bg-parchment-200'}">
                ${yearStr}
            </button>
        `);
    }
    return buttons.join('');
}

// Set heatmap view year
function setHeatmapView(view) {
    state.heatmapView = view;
    // Only update processing and heatmap, not everything to avoid flickering charts
    processActivityData();
    updateContributionHeatmap();
}
window.setHeatmapView = setHeatmapView; // Export for onclick handlers

// Get heatmap color level (0-4)
function getHeatmapLevel(count, maxCount) {
    if (count === 0) return 0;
    // GitHub logic is roughly quantiles, but we can stick to linear/log for simplicity
    // Let's use a slightly more aggressive scale so small numbers show up
    if (maxCount <= 4) return count; // Direct mapping if low volume

    const ratio = count / maxCount;
    if (ratio <= 0.2) return 1;
    if (ratio <= 0.4) return 2;
    if (ratio <= 0.7) return 3;
    return 4;
}

// Update user profile display (delegates to shared utility)
function updateUserProfile(profile) {
    Utils.updateUserProfileDisplay(profile);

    // Show back button for managers and admins
    const role = (profile?.role || '').toLowerCase();
    if (profile && (role === 'manager' || role === 'admin')) {
        const backBtn = document.getElementById('backButton');
        if (backBtn) backBtn.classList.remove('hidden');
    }
}

// Navigate to main dashboard (admin goes to admin dashboard, manager to manager dashboard)
function navigateToIndex() {
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
        return;
    } else if (referrer === 'dashboard') {
        if (window.navigateWithTransition) {
            window.navigateWithTransition('index', '../dashboard/index.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('index');
        } else {
            window.location.href = '../dashboard/index.html';
        }
        return;
    }

    // Fallback if no referrer is explicitly set
    const role = (state.userProfile?.role || '').toLowerCase();
    if (role === 'admin') {
        if (window.navigateWithTransition) {
            window.navigateWithTransition('adminDashboard', '../admin/admin.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('adminDashboard');
        } else {
            window.location.href = '../admin/admin.html';
        }
    } else {
        if (window.navigateWithTransition) {
            window.navigateWithTransition('index', '../dashboard/index.html', 'back');
        } else if (window.electronAPI) {
            window.electronAPI.navigateTo('index');
        } else {
            window.location.href = '../dashboard/index.html';
        }
    }
}

// Global Exports
window.navigateToIndex = navigateToIndex;

