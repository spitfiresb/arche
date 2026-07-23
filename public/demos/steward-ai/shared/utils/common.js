// Shared Utilities Module
// Extracted from duplicated code across UI files
// This module adds utilities to window.Utils namespace

(function () {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Standardized Color Palettes
    const MODEL_COLORS = {
        'claude': '#4d6159',      // Sage
        'claude-code': '#3b4d44', // Dark Sage
        'chatgpt': '#c2a894',     // Tan
        'cursor': '#5e503f',      // Brown
        'antigravity': '#7d8c82', // Green-Grey
        'copilot': '#d9d2c5',     // Sand
        'perplexity': '#b0c4bd',  // Muted Teal
        'gemini': '#8b7355',      // Earth Brown
        'grok': '#1a1a2e',        // Deep Navy
        'notebooklm': '#6b8f71',  // Fern Green
        'z.ai': '#8c7a6b',       // Driftwood
        'deepseek': '#5b7a8c',   // Steel Blue
        'other': '#a8a29e'        // Warm Slate
    };

    const CHART_COLORS = [
        '#4d6159', // Primary sage
        '#c2a894', // Muted clay/tan
        '#7d8c82', // Medium sage
        '#5e503f', // Dark umber
        '#9ea39a', // Light sage-gray
        '#a7877f', // Rose-clay
        '#6b705c', // Olive-sage
        '#1a1a2e'  // Deep navy (grok)
    ];

    // ============================================
    // String Utilities
    // ============================================

    const SYNTHETIC_EMAIL_DOMAIN = 'unpak.invalid';

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** Escape for use inside single-quoted JS strings within HTML attributes */
    function escapeJsAttr(text) {
        if (!text) return '';
        return escapeHtml(text.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    }

    /**
     * Format category name to title case
     * @param {string} category - Category string
     * @returns {string} Formatted category
     */
    function formatCategory(category) {
        if (!category) return 'General Question';
        return category.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    /**
     * Get initials from a name
     * @param {string} name - Full name
     * @returns {string} Initials (max 2 characters)
     */
    function getInitials(name) {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    /**
     * Truncate text to a maximum length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text with ellipsis if needed
     */
    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Detect the synthetic placeholder email used when an IdP does not return an email/UPN.
     * @param {string} email
     * @returns {boolean}
     */
    function isSyntheticEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const e = email.trim().toLowerCase();
        return e.startsWith('no-email+') && e.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
    }

    /**
     * Normalize email for display. Hides synthetic placeholders and provides a fallback label.
     * @param {string|null|undefined} email
     * @param {string} fallback
     * @returns {string}
     */
    function formatEmailForDisplay(email, fallback = '') {
        if (!email || typeof email !== 'string') return fallback;
        const e = email.trim();
        if (!e) return fallback;
        if (isSyntheticEmail(e)) return fallback;
        return e;
    }

    // ============================================
    // Date/Time Utilities
    // ============================================

    /**
     * Format timestamp as relative time (e.g., "5 min ago")
     * @param {string} isoString - ISO date string
     * @returns {string} Formatted relative time
     */
    function formatTimestamp(isoString) {
        if (!isoString) return '';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString();
    }

    /**
     * Format timestamp in short uppercase format (e.g., "10 MINS AGO")
     * @param {string} isoString - ISO date string
     * @returns {string} Formatted relative time in uppercase
     */
    function formatTimestampShort(isoString) {
        if (!isoString) return 'JUST NOW';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'JUST NOW';
        if (diffMins === 1) return '1 MIN AGO';
        if (diffMins < 60) return `${diffMins} MINS AGO`;
        if (diffHours === 1) return '1 HOUR AGO';
        if (diffHours < 24) return `${diffHours} HOURS AGO`;
        if (diffDays === 1) return '1 DAY AGO';
        if (diffDays < 7) return `${diffDays} DAYS AGO`;

        return date.toLocaleDateString().toUpperCase();
    }

    /**
     * Format date as short string (e.g., "Jan 15")
     * @param {string} isoString - ISO date string
     * @returns {string} Short date format
     */
    function formatDateShort(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    /**
     * Get day suffix (1st, 2nd, 3rd, etc.)
     * @param {number} day - Day of month
     * @returns {string} Day suffix
     */
    function getDaySuffix(day) {
        if (day >= 11 && day <= 13) return 'th';
        switch (day % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    }

    // ============================================
    // UI Utilities
    // ============================================

    /**
     * Show a notification toast
     * @param {string} message - Message to display
     * @param {string} type - Notification type: 'info', 'success', or 'error'
     */
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-clay shadow-clay z-50 animate-slide-up ${type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            type === 'success' ? 'bg-sage-100 text-sage-800 border border-sage-200' :
                'bg-white text-ink border border-parchment-200'
            }`;
        notification.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined">${type === 'error' ? 'error' :
                type === 'success' ? 'check_circle' : 'info'
            }</span>
                <span class="text-sm font-sans">${escapeHtml(message)}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('animate-fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Initialize dynamic animation styles if not already present
     */
    function initDynamicStyles() {
        if (document.getElementById('dynamic-styles')) return;

        const style = document.createElement('style');
        style.id = 'dynamic-styles';
        style.textContent = `
            @keyframes fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes slide-up {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fade-out {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes page-enter {
                from { opacity: 0; transform: translateX(20px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes page-exit {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(-20px); }
            }
            @keyframes page-enter-back {
                from { opacity: 0; transform: translateX(-20px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes page-exit-back {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(20px); }
            }
            .animate-fade-in {
                animation: fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                opacity: 0;
            }
            .animate-slide-up {
                animation: slide-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            }
            .animate-fade-out {
                animation: fade-out 0.3s ease-out forwards;
            }
            .animate-page-enter {
                animation: page-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                will-change: opacity, transform;
            }
            .animate-page-exit {
                animation: page-exit 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                will-change: opacity, transform;
            }
            .animate-page-enter-back {
                animation: page-enter-back 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                will-change: opacity, transform;
            }
            .animate-page-exit-back {
                animation: page-exit-back 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                will-change: opacity, transform;
            }
            .page-transition-wrapper {
                will-change: opacity, transform;
            }
            @keyframes page-loader-spin {
                to { transform: rotate(360deg); }
            }
            .page-loader-spinner {
                width: 32px;
                height: 32px;
                border: 2.5px solid rgba(77, 97, 89, 0.15);
                border-top-color: #4d6159;
                border-radius: 50%;
                animation: page-loader-spin 0.75s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Navigate with smooth page transition
     * @param {string} page - Page name for Electron API
     * @param {string} fallbackPath - Fallback path for browser mode
     * @param {string} direction - Animation direction: 'forward' or 'back'
     */
    function navigateWithTransition(page, fallbackPath, direction = 'forward') {
        initDynamicStyles();

        // Store navigation direction for target page to pick up
        try {
            sessionStorage.setItem('pageTransitionDirection', direction);
        } catch (e) {
            // sessionStorage may not be available
        }

        const mainContent = document.querySelector('main') || document.querySelector('.page-transition-wrapper') || document.body.firstElementChild;
        if (!mainContent) {
            navigateTo(page, fallbackPath);
            return;
        }

        const exitClass = direction === 'back' ? 'animate-page-exit-back' : 'animate-page-exit';
        mainContent.classList.add(exitClass);

        setTimeout(() => {
            if (window.electronAPI) {
                window.electronAPI.navigateTo(page);
            } else {
                window.location.href = fallbackPath || `${page}.html`;
            }
        }, 150);
    }

    /**
     * Apply page enter animation on load
     * Uses stored direction from navigation or defaults to provided direction
     * @param {string} defaultDirection - Default animation direction: 'forward' or 'back'
     */
    function applyPageEnterAnimation(defaultDirection = 'forward') {
        initDynamicStyles();

        // Check for stored navigation direction
        let direction = defaultDirection;
        try {
            const storedDirection = sessionStorage.getItem('pageTransitionDirection');
            if (storedDirection) {
                direction = storedDirection;
                sessionStorage.removeItem('pageTransitionDirection');
            }
        } catch (e) {
            // sessionStorage may not be available
        }

        const mainContent = document.querySelector('main') || document.querySelector('.page-transition-wrapper') || document.body.firstElementChild;
        if (!mainContent) return;

        mainContent.style.opacity = '0';
        mainContent.style.willChange = 'opacity, transform';

        // Use a slightly longer delay if needed to ensure the browser has painted the initial state
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const enterClass = direction === 'back' ? 'animate-page-enter-back' : 'animate-page-enter';
                mainContent.classList.add(enterClass);
                mainContent.style.opacity = '';
            });
        });
    }

    function showPageLoadingOverlay() {
        const existing = document.getElementById('page-loading-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'page-loading-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '45',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fbfaf8',
            opacity: '1',
            transition: 'opacity 0.15s ease',
            pointerEvents: 'auto',
        });
        const spinner = document.createElement('div');
        spinner.className = 'page-loader-spinner';
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);

        return overlay;
    }

    function hidePageLoadingOverlay() {
        const overlay = document.getElementById('page-loading-overlay');
        if (!overlay) return Promise.resolve();
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        return new Promise(resolve => {
            setTimeout(() => { overlay.remove(); resolve(); }, 200);
        });
    }

    // ============================================
    // Extension Warning Modal
    // ============================================

    const EXTENSION_WARNING_DEFAULTS = {
        title: 'Browser Extension Not Connected',
        browserTextTemplate: 'Detected in {browser}',
        message: 'Your prompts in this browser may not be captured. Please check that the Unpak extension is installed and enabled.',
        showInstallLink: true,
        stepTitle: 'Already installed? To fix this:',
        steps: [
            'Open your browser extension settings',
            'Find the Unpak extension',
            'Make sure it is enabled'
        ],
        statusText: 'Waiting for extension to reconnect...'
    };

    function resolveExtensionWarningData(data = {}) {
        const browserName = data.browser || 'Google Chrome';

        const browserText = data.browserText !== undefined
            ? data.browserText
            : EXTENSION_WARNING_DEFAULTS.browserTextTemplate.replace('{browser}', browserName);

        return {
            title: data.title || EXTENSION_WARNING_DEFAULTS.title,
            browserText,
            message: data.message || EXTENSION_WARNING_DEFAULTS.message,
            showInstallLink: typeof data.showInstallLink === 'boolean'
                ? data.showInstallLink
                : EXTENSION_WARNING_DEFAULTS.showInstallLink,
            stepTitle: data.stepTitle || EXTENSION_WARNING_DEFAULTS.stepTitle,
            steps: Array.isArray(data.steps) && data.steps.length > 0
                ? data.steps
                : EXTENSION_WARNING_DEFAULTS.steps,
            statusText: data.statusText || EXTENSION_WARNING_DEFAULTS.statusText
        };
    }

    /**
     * Shows the extension warning modal
     * @param {Object} data - Warning data
     */
    function showExtensionWarning(data = {}) {
        const modal = document.getElementById('extension-warning-modal');
        const warning = resolveExtensionWarningData(data);

        const titleEl = document.getElementById('extension-warning-title');
        const browserEl = document.getElementById('extension-warning-browser');
        const messageEl = document.getElementById('extension-warning-message');
        const installLink = document.getElementById('extension-warning-install-link');
        const stepsTitleEl = document.getElementById('extension-warning-steps-title');
        const stepsListEl = document.getElementById('extension-warning-steps-list');
        const statusEl = document.getElementById('extension-warning-status');

        if (modal) {
            if (titleEl) {
                titleEl.textContent = warning.title;
            }

            if (browserEl) {
                browserEl.textContent = warning.browserText || '';
                browserEl.classList.toggle('hidden', !warning.browserText);
            }

            if (messageEl) {
                messageEl.textContent = warning.message;
            }

            if (installLink) {
                installLink.classList.toggle('hidden', !warning.showInstallLink);
            }

            if (stepsTitleEl) {
                stepsTitleEl.textContent = warning.stepTitle;
            }

            if (stepsListEl) {
                stepsListEl.innerHTML = warning.steps
                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                    .join('');
            }

            if (statusEl) {
                statusEl.textContent = warning.statusText;
            }

            modal.classList.remove('hidden');
            _initExtensionInstallLink();
        }
    }

    /**
     * Sets up the extension install link in the extension warning modal.
     * Opens the appropriate store link for the disconnected browser(s).
     * Falls back to the Chrome Web Store URL.
     */
    function _initExtensionInstallLink() {
        const link = document.getElementById('extension-warning-install-link');
        if (!link || link.dataset.initialized) return;
        link.dataset.initialized = 'true';

        link.addEventListener('click', async (e) => {
            e.preventDefault();
            // Find the best store URL to open based on SUPPORTED_BROWSERS
            const browsers = window.UnpakConstants?.SUPPORTED_BROWSERS || [];
            const fallbackUrl = window.UnpakConstants?.CHROME_EXTENSION_URL
                || 'https://chromewebstore.google.com/detail/maohmchocbmieloilmmlhdflghhaggkn?authuser=0&hl=en';

            // Try to open the first browser with a store URL
            const browserWithStore = browsers.find(b => b.storeUrl);
            const url = browserWithStore?.storeUrl || fallbackUrl;
            const browserId = browserWithStore?.id || 'chrome';

            if (window.electronAPI?.openUrlInBrowser) {
                try {
                    await window.electronAPI.openUrlInBrowser(browserId, url);
                } catch (err) {
                    console.error('Failed to open extension store:', err);
                    if (window.electronAPI?.openUrlInChrome) {
                        await window.electronAPI.openUrlInChrome(url).catch(() => window.open(url, '_blank'));
                    } else {
                        window.open(url, '_blank');
                    }
                }
            } else if (window.electronAPI?.openUrlInChrome) {
                try {
                    await window.electronAPI.openUrlInChrome(url);
                } catch (err) {
                    window.open(url, '_blank');
                }
            } else {
                window.open(url, '_blank');
            }
        });
    }

    /**
     * Dismisses the extension warning modal
     */
    function dismissExtensionWarning() {
        const modal = document.getElementById('extension-warning-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // ============================================
    // Navigation Utilities
    // ============================================

    /**
     * Navigate to a page using Electron API or fallback to location
     * @param {string} page - Page name (e.g., 'index', 'myUsage')
     * @param {string} fallbackPath - Fallback relative path for browser mode
     */
    function navigateTo(page, fallbackPath) {
        if (window.electronAPI) {
            window.electronAPI.navigateTo(page);
        } else {
            window.location.href = fallbackPath || `${page}.html`;
        }
    }

    /**
     * Navigate back to the main dashboard
     */
    function navigateBack() {
        navigateTo('index', 'index.html');
    }

    // ============================================
    // Formatting Utilities
    // ============================================

    /**
     * Format source/model name for display
     * @param {string} source - Source identifier
     * @returns {string} Display name
     */
    function formatSourceName(source) {
        const names = {
            'claude': 'Claude',
            'claude-code': 'Claude Code',
            'chatgpt': 'ChatGPT',
            'cursor': 'Cursor',
            'antigravity': 'Antigravity',
            'copilot': 'Copilot',
            'perplexity': 'Perplexity',
            'gemini': 'Gemini',
            'grok': 'Grok',
            'github-copilot': 'GitHub Copilot',
            'copilot-studio': 'Copilot Studio',
            'security-copilot': 'Security Copilot',
            'copilot-pages': 'Copilot Pages',
            'copilot-notebooks': 'Copilot Notebooks',
            'copilot-word': 'Copilot Word',
            'copilot-excel': 'Copilot Excel',
            'copilot-powerpoint': 'Copilot PowerPoint',
            'copilot-outlook': 'Copilot Outlook',
            'copilot-onenote': 'Copilot OneNote',
            'copilot-teams': 'Copilot Teams',
            'notebooklm': 'NotebookLM',
            'z.ai': 'Z.ai',
            'deepseek': 'DeepSeek',
        };
        return names[source] || source.charAt(0).toUpperCase() + source.slice(1);
    }

    // ============================================
    // User Profile Utilities
    // ============================================

    /**
     * Update user profile display elements
     * @param {Object} profile - User profile object
     * @param {Object} elements - DOM element IDs to update
     */
    function updateUserProfileDisplay(profile, elements = {}) {
        const {
            nameEl = document.getElementById('userName'),
            roleEl = document.getElementById('userRole')
        } = elements;

        if (!profile) return;

        if (nameEl) nameEl.textContent = profile.full_name || 'User';
        if (roleEl) roleEl.textContent = (profile.role || 'Employee').toUpperCase();
    }

    // ============================================
    // Chart Utilities
    // ============================================

    /**
     * Create SVG arc path for donut segment
     */
    function createArcPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
        // SVG arcs cannot draw a full 360° circle (start == end = zero-length path)
        if (endAngle - startAngle >= 360) {
            endAngle = startAngle + 359.99;
        }
        // Convert angles to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        // Calculate arc points
        const x1 = cx + outerRadius * Math.cos(startRad);
        const y1 = cy + outerRadius * Math.sin(startRad);
        const x2 = cx + outerRadius * Math.cos(endRad);
        const y2 = cy + outerRadius * Math.sin(endRad);
        const x3 = cx + innerRadius * Math.cos(endRad);
        const y3 = cy + innerRadius * Math.sin(endRad);
        const x4 = cx + innerRadius * Math.cos(startRad);
        const y4 = cy + innerRadius * Math.sin(startRad);

        // Determine if arc should be drawn the long way
        const largeArcFlag = (endAngle - startAngle) > 180 ? 1 : 0;

        // Create path: outer arc, line to inner, inner arc (reverse), close
        return `
            M ${x1} ${y1}
            A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
            L ${x3} ${y3}
            A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
            Z
        `;
    }

    /**
     * Generate color variations for subcategories
     */
    function generateSubcategoryColors(baseColor, count) {
        const colors = [];
        const hsl = hexToHsl(baseColor);

        for (let i = 0; i < count; i++) {
            // Vary lightness and saturation slightly
            const lightnessOffset = (i - count / 2) * 8;
            const newLightness = Math.max(25, Math.min(75, hsl.l + lightnessOffset));
            colors.push(hslToHex(hsl.h, hsl.s, newLightness));
        }

        return colors;
    }

    /**
     * Convert hex to HSL
     */
    function hexToHsl(hex) {
        if (!hex || hex.length < 7) return { h: 0, s: 0, l: 0 };
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    /**
     * Convert HSL to hex
     */
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    // ============================================
    // Expose to window.Utils namespace
    // ============================================

    // ============================================
    // Custom Calendar Class
    // ============================================

    class CustomCalendar {
        constructor(onSelect) {
            this.onSelect = onSelect;
            this.currentDate = new Date();
            this.selectedStartDate = null;
            this.selectedEndDate = null;
            this.selecting = 'start'; // 'start' | 'end'

            this.popup = document.getElementById('calendarPopup');
            this.grid = document.getElementById('calendarGrid');
            this.monthYearLabel = document.getElementById('calendarMonthYear');
            this.prevBtn = document.getElementById('prevMonth');
            this.nextBtn = document.getElementById('nextMonth');

            this.init();
        }

        init() {
            if (!this.popup || !this.grid || !this.monthYearLabel || !this.prevBtn || !this.nextBtn) {
                console.warn('CustomCalendar: Missing required DOM elements');
                return;
            }

            this.prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                this.render();
            });

            this.nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                this.render();
            });

            document.addEventListener('click', (e) => {
                if (this.popup.classList.contains('is-visible') && !this.popup.contains(e.target)) {
                    this.hide();
                }
            });
        }

        show(targetInputId) {
            this.selecting = targetInputId === 'customStartDate' ? 'start' : 'end';
            this.popup.classList.add('is-visible');
            this.render();
        }

        hide() {
            this.popup.classList.remove('is-visible');
        }

        render() {
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();

            this.monthYearLabel.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.currentDate);

            let html = '';
            const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
            dayHeaders.forEach(day => {
                html += `<div class="calendar-day-header">${day}</div>`;
            });

            // Padding days
            for (let i = 0; i < firstDay; i++) {
                html += `<div class="calendar-day other-month"></div>`;
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const isSelected = (this.selectedStartDate && date.toDateString() === this.selectedStartDate.toDateString()) || (this.selectedEndDate && date.toDateString() === this.selectedEndDate.toDateString());
                const isToday = date.toDateString() === today.toDateString();
                const isInRange = this.selectedStartDate && this.selectedEndDate && date > this.selectedStartDate && date < this.selectedEndDate;

                html += `<div class="calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isInRange ? 'bg-parchment-100' : ''}" 
                            onclick="window.calendarInstance.selectDate(${year}, ${month}, ${day}, event)">${day}</div>`;
            }

            this.grid.innerHTML = html;
        }

        selectDate(year, month, day, event) {
            event.stopPropagation();
            const date = new Date(year, month, day);
            if (this.selecting === 'start') {
                this.selectedStartDate = date;
                if (this.selectedEndDate && this.selectedStartDate > this.selectedEndDate) {
                    this.selectedEndDate = null;
                }
                this.selecting = 'end';
            } else {
                if (this.selectedStartDate && date < this.selectedStartDate) {
                    this.selectedStartDate = date;
                    this.selectedEndDate = null;
                    this.selecting = 'end';
                } else {
                    this.selectedEndDate = date;
                    this.selecting = 'start';
                    this.hide();
                }
            }
            this.onSelect(this.selectedStartDate, this.selectedEndDate);
            this.render();
        }

        setDates(start, end) {
            this.selectedStartDate = start ? new Date(start) : null;
            this.selectedEndDate = end ? new Date(end) : null;
        }
    }

    /**
     * Bucket activity data with smart granularity based on date range.
     * ≤60 days → daily, 61–180 → weekly, 181+ → monthly.
     */
    function bucketActivityData(prompts, startDate, endDate) {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        // Build per-day maps from prompts
        const dayCount = new Map();
        const dayModels = new Map();
        let earliestPrompt = null;
        (prompts || []).forEach(p => {
            const d = new Date(p.createdAt);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            dayCount.set(key, (dayCount.get(key) || 0) + 1);
            if (!dayModels.has(key)) dayModels.set(key, {});
            const m = dayModels.get(key);
            const src = (p.source || 'unknown').toLowerCase();
            m[src] = (m[src] || 0) + 1;
            if (!earliestPrompt || d < earliestPrompt) earliestPrompt = d;
        });

        // Effective range
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        let effStart = startDate ? new Date(startDate) : (earliestPrompt ? new Date(earliestPrompt) : new Date(now.getTime() - 6 * 86400000));
        let effEnd = endDate ? new Date(endDate) : now;
        effStart.setHours(0, 0, 0, 0);
        effEnd.setHours(23, 59, 59, 999);

        const rangeDays = Math.round((effEnd - effStart) / 86400000) + 1;
        const bucketType = rangeDays <= 60 ? 'daily' : rangeDays <= 180 ? 'weekly' : 'monthly';

        // Helpers
        const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

        const multiYear = effStart.getFullYear() !== effEnd.getFullYear();

        function makeBuckets() {
            const buckets = [];
            if (bucketType === 'daily') {
                for (let d = new Date(effStart); d <= effEnd; d = addDays(d, 1)) {
                    buckets.push({ start: new Date(d), end: new Date(d), label: `${MONTHS[d.getMonth()]} ${d.getDate()}` });
                }
            } else if (bucketType === 'weekly') {
                // Start on Monday on/before effStart
                let cur = new Date(effStart);
                const dow = cur.getDay();
                cur.setDate(cur.getDate() - ((dow + 6) % 7)); // back to Monday
                cur.setHours(0, 0, 0, 0);
                while (cur <= effEnd) {
                    const wEnd = addDays(cur, 6);
                    const bStart = cur < effStart ? new Date(effStart) : new Date(cur);
                    const bEnd = wEnd > effEnd ? new Date(effEnd) : new Date(wEnd);
                    const sMonth = MONTHS[bStart.getMonth()];
                    const eMonth = MONTHS[bEnd.getMonth()];
                    const label = sMonth === eMonth
                        ? `${sMonth} ${bStart.getDate()}–${bEnd.getDate()}`
                        : `${sMonth} ${bStart.getDate()}–${eMonth} ${bEnd.getDate()}`;
                    buckets.push({ start: bStart, end: bEnd, label });
                    cur = addDays(cur, 7);
                }
            } else {
                // Monthly
                let cur = new Date(effStart.getFullYear(), effStart.getMonth(), 1);
                while (cur <= effEnd) {
                    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0); // last day of month
                    const bStart = cur < effStart ? new Date(effStart) : new Date(cur);
                    const bEnd = mEnd > effEnd ? new Date(effEnd) : new Date(mEnd);
                    const label = multiYear ? `${MONTHS[cur.getMonth()]} '${String(cur.getFullYear()).slice(2)}` : MONTHS[cur.getMonth()];
                    buckets.push({ start: bStart, end: bEnd, label });
                    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                }
            }
            return buckets;
        }

        const buckets = makeBuckets();
        const activity = buckets.map(b => {
            let count = 0;
            const modelBreakdown = {};
            for (let d = new Date(b.start); d <= b.end; d = addDays(d, 1)) {
                const k = dayKey(d);
                count += dayCount.get(k) || 0;
                const dm = dayModels.get(k);
                if (dm) {
                    for (const [model, c] of Object.entries(dm)) {
                        modelBreakdown[model] = (modelBreakdown[model] || 0) + c;
                    }
                }
            }
            return { label: b.label, count, modelBreakdown };
        });

        return { bucketType, activity };
    }

    window.Utils = {
        // Constants
        UUID_REGEX,
        MODEL_COLORS,
        CHART_COLORS,

        // String utilities
        escapeHtml,
        escapeJsAttr,
        formatCategory,
        getInitials,
        isSyntheticEmail,
        formatEmailForDisplay,
        truncateText,

        // Date/time utilities
        formatTimestamp,
        formatTimestampShort,
        formatDateShort,
        getDaySuffix,

        // UI utilities
        showNotification,
        initDynamicStyles,
        showExtensionWarning,
        dismissExtensionWarning,

        // Navigation utilities
        navigateTo,
        navigateBack,
        navigateWithTransition,
        applyPageEnterAnimation,

        // Formatting utilities
        formatSourceName,

        // User profile utilities
        updateUserProfileDisplay,

        // Chart utilities
        createArcPath,
        generateSubcategoryColors,
        hexToHsl,
        hslToHex,
        bucketActivityData,

        // Custom Calendar
        CustomCalendar
    };

    // Also expose commonly used functions directly on window for backward compatibility
    window.escapeHtml = escapeHtml;
    window.escapeJsAttr = escapeJsAttr;
    window.formatCategory = formatCategory;
    window.getInitials = getInitials;
    window.formatTimestamp = formatTimestamp;
    window.showNotification = showNotification;
    window.formatSourceName = formatSourceName;
    window.getDaySuffix = getDaySuffix;
    window.formatDateShort = formatDateShort;
    window.formatTimestampShort = formatTimestampShort;
    window.truncateText = truncateText;
    window.navigateWithTransition = navigateWithTransition;
    window.applyPageEnterAnimation = applyPageEnterAnimation;
    window.showPageLoadingOverlay = showPageLoadingOverlay;
    window.hidePageLoadingOverlay = hidePageLoadingOverlay;
    window.isSyntheticEmail = isSyntheticEmail;
    window.formatEmailForDisplay = formatEmailForDisplay;

    // Wire main-process show-in-app-notification events to the toast
    if (window.electronAPI?.onShowInAppNotification) {
        window.electronAPI.onShowInAppNotification((data) => {
            showNotification(data.message, data.type || 'info');
        });
    }

})();
