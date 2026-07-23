/**
 * Shared Circular Date Filter Component
 *
 * Usage:
 *   const filter = DateFilter.init({
 *       mountId: 'date-filter-mount',
 *       storageKey: 'dashboardDateFilter',
 *       onFilterChange: (filterState) => { ... },
 *       activeClasses: { add: ['text-primary', 'bg-primary/5'], remove: ['text-slate-500'] },
 *   });
 *
 *   // Access current state:
 *   filter.getState()  // { preset, startDate, endDate }
 *
 *   // Programmatic apply (e.g. restoring on load):
 *   filter.applyFilter('all')
 */
window.DateFilter = (() => {

    const FILTER_HTML = `
        <div id="circularDateFilter" class="pointer-events-auto relative flex items-center justify-end">
            <!-- Content Area (Expands Left) -->
            <div id="dateFilterContent"
                class="absolute right-0 top-0 h-10 bg-white rounded-full shadow-clay-sm border border-slate-100 flex items-center pl-4 gap-2 overflow-hidden transition-all duration-300 ease-out origin-right opacity-0 scale-x-90 pointer-events-none"
                style="width: 40px;">

                <!-- Sliding highlight pill -->
                <div id="filterPill" class="absolute rounded-md bg-primary/5 pointer-events-none transition-all duration-300 ease-out" style="height: 0; width: 0;"></div>

                <button class="filter-option text-xs font-medium text-slate-500 hover:text-primary transition-colors whitespace-nowrap px-2 py-1"
                    data-preset="all">All Time</button>
                <button class="filter-option text-xs font-medium text-slate-500 hover:text-primary transition-colors whitespace-nowrap px-2 py-1"
                    data-preset="7d">Past Week</button>
                <button class="filter-option text-xs font-medium text-slate-500 hover:text-primary transition-colors whitespace-nowrap px-2 py-1"
                    data-preset="30d">Past 30 Days</button>
                <button class="filter-option text-xs font-medium text-slate-500 hover:text-primary transition-colors whitespace-nowrap px-2 py-1"
                    data-preset="custom">Custom</button>

                <!-- Custom Date Inputs (Hidden by default) -->
                <div id="customDateInputs"
                    class="flex items-center gap-2 border-slate-100 overflow-hidden transition-all duration-700 ease-out"
                    style="max-width: 0; opacity: 0; padding-left: 0; margin-left: 0; border-left-width: 0;">
                    <input type="text" id="customStartDate" readonly placeholder="Start Date"
                        class="text-[10px] w-20 border border-parchment-200 bg-parchment-50 rounded-md px-2 py-1 text-ink-light focus:ring-1 focus:ring-sage-300 outline-none transition-shadow cursor-pointer">
                    <span class="text-slate-300">-</span>
                    <input type="text" id="customEndDate" readonly placeholder="End Date"
                        class="text-[10px] w-20 border border-parchment-200 bg-parchment-50 rounded-md px-2 py-1 text-ink-light focus:ring-1 focus:ring-sage-300 outline-none transition-shadow cursor-pointer">
                </div>
            </div>

            <!-- Custom Calendar Popup -->
            <div id="calendarPopup" class="calendar-popup">
                <div class="calendar-header">
                    <button class="calendar-nav-btn" id="prevMonth">
                        <span class="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <span id="calendarMonthYear" class="text-xs font-bold text-ink"></span>
                    <button class="calendar-nav-btn" id="nextMonth">
                        <span class="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                </div>
                <div class="calendar-grid" id="calendarGrid">
                    <!-- Days injected here -->
                </div>
            </div>

            <!-- Toggle Button (Circular) -->
            <button id="dateFilterToggle"
                class="h-10 rounded-full bg-white shadow-clay border border-slate-200 flex items-center justify-center text-slate-600 hover:text-primary hover:border-primary/30 transition-all duration-300 ease-out z-10 relative px-3 gap-1.5">
                <span class="material-symbols-outlined text-[20px]">filter_list</span>
                <span id="dateFilterLabel" class="text-[10px] font-semibold text-slate-500 whitespace-nowrap leading-none text-center min-w-[50px]" style="transition: opacity 150ms ease"></span>
            </button>
        </div>
    `;

    const DEFAULT_ACTIVE_CLASSES = {
        add: ['text-primary', 'font-bold'],
        remove: ['text-slate-500']
    };

    function init(options) {
        const {
            mountId,
            storageKey,
            onFilterChange,
            activeClasses = DEFAULT_ACTIVE_CLASSES,
        } = options;

        // Inject HTML
        const mount = document.getElementById(mountId);
        if (!mount) {
            console.warn('DateFilter: mount element not found:', mountId);
            return null;
        }
        mount.innerHTML = FILTER_HTML;

        // Grab DOM refs
        const toggleBtn = document.getElementById('dateFilterToggle');
        const content = document.getElementById('dateFilterContent');
        const filterOptions = mount.querySelectorAll('.filter-option');
        const customInputs = document.getElementById('customDateInputs');
        const startDateInput = document.getElementById('customStartDate');
        const endDateInput = document.getElementById('customEndDate');
        const filterLabel = document.getElementById('dateFilterLabel');
        const pill = document.getElementById('filterPill');
        const calendarPopup = document.getElementById('calendarPopup');

        if (!toggleBtn || !content) return null;

        // Internal state
        let isExpanded = false;
        let currentPreset = 'all';
        let filterState = { preset: 'all', startDate: null, endDate: null };
        let suppressCallback = false;
        let labelAnimId = null;
        let collapseTimerId = null;

        // Date boundary helpers (hoisted to avoid re-creation per applyFilter call)
        const toLocalStart = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
        };
        const toLocalEnd = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
        };

        // Restore state from sessionStorage
        try {
            const saved = sessionStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                filterState = parsed;
                currentPreset = parsed.preset;

                if (currentPreset === 'custom' && parsed.startDate && parsed.endDate) {
                    const s = new Date(parsed.startDate);
                    const e = new Date(parsed.endDate);
                    startDateInput.value = formatDateStr(s);
                    endDateInput.value = formatDateStr(e);
                }
            }
        } catch (e) { console.error('Failed to restore filter state', e); }

        // Initialize Calendar
        window.calendarInstance = new Utils.CustomCalendar((start, end) => {
            startDateInput.value = formatDateStr(start);
            endDateInput.value = formatDateStr(end);
            if (start && end) {
                applyFilter('custom');
            }
        });

        // Sync calendar with restored state
        if (filterState.startDate && filterState.endDate) {
            window.calendarInstance.setDates(filterState.startDate, filterState.endDate);
        }

        startDateInput.addEventListener('click', (e) => {
            e.stopPropagation();
            window.calendarInstance.show('customStartDate');
        });

        endDateInput.addEventListener('click', (e) => {
            e.stopPropagation();
            window.calendarInstance.show('customEndDate');
        });

        // Smooth collapse: FLIP width from current → toggle button size
        function collapseContent() {
            isExpanded = false;
            if (collapseTimerId) clearTimeout(collapseTimerId);

            // Lock current width so CSS can transition from it
            const w = content.getBoundingClientRect().width;
            content.style.transition = 'none';
            content.style.width = w + 'px';
            content.offsetHeight; // reflow

            // Animate to toggle button width with smooth easing
            content.style.transition = 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)';
            content.classList.add('opacity-0', 'pointer-events-none');
            content.style.width = toggleBtn.offsetWidth + 'px';
            content.style.paddingLeft = '0';

            // After transition completes, restore initial state for next open
            collapseTimerId = setTimeout(() => {
                collapseTimerId = null;
                if (!isExpanded) {
                    content.style.transition = '';
                    content.classList.add('scale-x-90');
                    content.style.width = '40px';
                    content.style.paddingLeft = '';
                }
            }, 450);

            if (window.calendarInstance) window.calendarInstance.hide();
        }

        // Slide highlight pill behind the active filter button
        function positionPill(animate = true) {
            const activeBtn = content.querySelector(`.filter-option[data-preset="${currentPreset}"]`);
            if (!activeBtn || !isExpanded) return;

            if (!animate) {
                pill.style.transition = 'none';
            }
            pill.style.left = activeBtn.offsetLeft + 'px';
            pill.style.top = activeBtn.offsetTop + 'px';
            pill.style.width = activeBtn.offsetWidth + 'px';
            pill.style.height = activeBtn.offsetHeight + 'px';
            if (!animate) {
                pill.offsetHeight; // reflow
                pill.style.transition = '';
            }
        }

        // Sync content panel right-padding to current toggle-button width
        function syncContentPadding(targetWidth) {
            if (!isExpanded) return;
            const w = targetWidth || toggleBtn.offsetWidth;
            content.style.paddingRight = (w + 10) + 'px';
        }

        // Crossfade label text with smooth button width animation
        function updateLabel() {
            const labels = { all: 'All Time', '7d': 'Past Week', '30d': '30 Days', custom: 'Custom' };
            let newText;
            if (currentPreset === 'custom' && startDateInput.value && endDateInput.value) {
                const fmt = (v) => { const [y, m, d] = v.split('-'); return `${m}/${d}`; };
                newText = `${fmt(startDateInput.value)} – ${fmt(endDateInput.value)}`;
            } else {
                newText = labels[currentPreset] || '';
            }

            if (filterLabel.textContent === newText) return;

            // Skip animation on initial load
            if (suppressCallback) {
                filterLabel.textContent = newText;
                return;
            }

            // Cancel any in-progress animation
            if (labelAnimId) clearTimeout(labelAnimId);

            // Phase 1: Capture current width, fade out label
            const startWidth = toggleBtn.getBoundingClientRect().width;
            filterLabel.style.opacity = '0';

            // Phase 2: After fade out, swap text and animate width
            labelAnimId = setTimeout(() => {
                filterLabel.textContent = newText;

                // Measure new natural width
                toggleBtn.style.width = '';
                const endWidth = toggleBtn.getBoundingClientRect().width;

                // FLIP: animate button from old width to new width
                if (Math.abs(startWidth - endWidth) > 1) {
                    toggleBtn.style.transition = 'none';
                    toggleBtn.style.width = startWidth + 'px';
                    toggleBtn.offsetHeight; // force reflow
                    toggleBtn.style.transition = '';
                    toggleBtn.style.width = endWidth + 'px';
                    setTimeout(() => { toggleBtn.style.width = ''; }, 350);
                }

                // Sync content padding to new width
                syncContentPadding(Math.round(endWidth));

                // Phase 3: Fade label back in
                requestAnimationFrame(() => {
                    filterLabel.style.opacity = '1';
                });
                labelAnimId = null;
            }, 150);
        }

        // UI update
        function updateUI() {
            filterOptions.forEach(btn => {
                const isActive = btn.dataset.preset === currentPreset;
                if (isActive) {
                    btn.classList.add(...activeClasses.add);
                    btn.classList.remove(...activeClasses.remove);
                } else {
                    btn.classList.remove(...activeClasses.add);
                    btn.classList.add(...activeClasses.remove);
                }
            });

            if (currentPreset === 'custom') {
                customInputs.style.maxWidth = '250px';
                customInputs.style.opacity = '1';
                customInputs.style.paddingLeft = '8px';
                customInputs.style.marginLeft = '4px';
                customInputs.style.borderLeftWidth = '1px';
            } else {
                customInputs.style.maxWidth = '0';
                customInputs.style.opacity = '0';
                customInputs.style.paddingLeft = '0';
                customInputs.style.marginLeft = '0';
                customInputs.style.borderLeftWidth = '0';
            }

            if (isExpanded) {
                content.style.width = 'auto';
                syncContentPadding();
            }

            positionPill();
            updateLabel();
        }

        // Apply filter
        function applyFilter(preset) {
            currentPreset = preset;
            let startDate = null;
            let endDate = null;

            if (preset === 'all') {
                const today = new Date();
                const todayStr = formatDateStr(today);
                endDate = toLocalEnd(todayStr);
            } else if (preset === '7d') {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 6);
                startDate = toLocalStart(start.toISOString().split('T')[0]);
                endDate = toLocalEnd(end.toISOString().split('T')[0]);
            } else if (preset === '30d') {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 29);
                startDate = toLocalStart(start.toISOString().split('T')[0]);
                endDate = toLocalEnd(end.toISOString().split('T')[0]);
            } else if (preset === 'custom') {
                if (startDateInput.value && endDateInput.value) {
                    startDate = toLocalStart(startDateInput.value);
                    endDate = toLocalEnd(endDateInput.value);
                } else {
                    return;
                }
            }

            filterState = { preset, startDate, endDate };
            sessionStorage.setItem(storageKey, JSON.stringify(filterState));

            if (!suppressCallback && onFilterChange) {
                onFilterChange(filterState);
            }

            updateUI();
        }

        // Toggle expand/collapse
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;

            if (isExpanded) {
                if (collapseTimerId) { clearTimeout(collapseTimerId); collapseTimerId = null; }
                content.classList.remove('opacity-0', 'scale-x-90', 'pointer-events-none');
                content.style.width = 'auto';
                syncContentPadding();
                requestAnimationFrame(() => positionPill(false));
            } else {
                collapseContent();
            }
        });

        // Option clicks
        filterOptions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const preset = e.target.dataset.preset;
                if (preset !== 'custom') {
                    if (window.calendarInstance) window.calendarInstance.hide();
                    applyFilter(preset);
                } else {
                    currentPreset = 'custom';
                    updateUI();
                    if (window.calendarInstance) {
                        window.calendarInstance.show('customStartDate');
                    }
                    if (startDateInput.value && endDateInput.value) {
                        applyFilter('custom');
                    }
                }
            });
        });

        // Custom input changes
        const handleCustomChange = () => {
            if (currentPreset === 'custom' && startDateInput.value && endDateInput.value) {
                applyFilter('custom');
            }
        };
        startDateInput.addEventListener('change', handleCustomChange);
        endDateInput.addEventListener('change', handleCustomChange);

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (isExpanded && !content.contains(e.target) && !toggleBtn.contains(e.target) && !calendarPopup.contains(e.target)) {
                collapseContent();
            }
        });

        // Initial UI setup
        suppressCallback = true;
        applyFilter(currentPreset);
        suppressCallback = false;

        // Public API
        return {
            getState: () => filterState,
            applyFilter,
        };
    }

    function formatDateStr(date) {
        if (!date) return '';
        if (typeof date === 'string') date = new Date(date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    return { init };
})();
