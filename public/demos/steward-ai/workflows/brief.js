// AI Intelligence Brief — Workflow Insights Dashboard

// ============================================
// Constants
// ============================================

const CATEGORY_COLORS = {
    'Software Development':   '#4d6159',
    'Data & Analytics':       '#5e503f',
    'Marketing & Content':    '#c2a894',
    'Sales':                  '#7d8c82',
    'Customer Success':       '#8b7355',
    'People & Talent':        '#b0c4bd',
    'Finance':                '#6b705c',
    'Legal & Compliance':     '#a7877f',
    'Operations':             '#9ea39a',
    'Strategy & Leadership':  '#3b4d44',
    'Communication':          '#d9d2c5',
    'General Information':    '#8c7a6b',
    'Other':                  '#a8a29e',
};

const BLOOM_COLORS_BRIEF = {
    delegation:    '#c2a894',
    collaboration: '#4d6159',
    consultation:  '#7d8c82',
    exploration:   '#5e503f',
};

const BLOOM_LABELS_BRIEF = {
    delegation: 'Delegation',
    collaboration: 'Collaboration',
    consultation: 'Consultation',
    exploration: 'Exploration',
};

function getCategoryColor(name) {
    return CATEGORY_COLORS[name] || CATEGORY_COLORS['Other'];
}

// ============================================
// Data Loading
// ============================================

async function loadBriefData() {
    if (!window.electronAPI) return;

    let startDate = null;
    let endDate = null;
    const df = window.workflowDateFilter;
    if (df) {
        const state = df.getState();
        startDate = state.startDate;
        endDate = state.endDate;
    }

    let departmentId = null;
    try {
        const ctx = sessionStorage.getItem('viewingDepartmentContext');
        if (ctx) departmentId = JSON.parse(ctx).departmentId || null;
    } catch (e) { /* ignore */ }

    try {
        const result = await window.electronAPI.getWorkflowInsights({
            departmentId, startDate, endDate
        });
        renderBrief(result);
    } catch (e) {
        console.error('Failed to load workflow insights:', e);
        document.getElementById('insightFeed').innerHTML =
            '<p class="text-sm text-slate-400 italic py-8 w-full text-center">Failed to load insights</p>';
    }
}

window.loadBriefData = loadBriefData;

// ============================================
// Main Render
// ============================================

function renderBrief(data) {
    const container = document.getElementById('briefContent');
    if (!container) return;

    if (!data || data.totalConversations === 0) {
        container.innerHTML = '<p class="text-sm text-slate-300 italic py-16 w-full text-center">No classified conversations yet</p>';
        return;
    }

    const insights = data.insights || [];
    const wins = insights.filter(i => i.type === 'positive');
    const risks = insights.filter(i => i.type === 'attention');
    const infos = insights.filter(i => i.type === 'info');
    const categories = data.categories || [];
    const cognitive = data.cognitive || {};
    const total = data.totalConversations;

    let html = '';

    // ─── At a Glance ─────────────────────────────────
    if (wins.length || risks.length) {
        const cols = (wins.length && risks.length) ? 'md:grid-cols-2' : '';
        html += `
        <div class="rounded-xl border border-parchment-300 overflow-hidden" style="animation: briefFadeIn 0.4s ease-out">
            <div class="bg-gradient-to-br from-parchment-200 via-parchment-100 to-white p-8">
                <div class="flex items-center gap-3 mb-6">
                    <span class="material-symbols-outlined text-accent-tan text-2xl">auto_awesome</span>
                    <h2 class="font-display italic text-2xl text-ink">At a Glance</h2>
                </div>
                <div class="grid grid-cols-1 ${cols} gap-8">`;

        if (wins.length) {
            html += `
                    <div>
                        <div class="flex items-center gap-2 mb-4">
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <h3 class="text-xs font-semibold text-emerald-700 uppercase tracking-widest">What's Going Well</h3>
                        </div>
                        <div class="space-y-3">`;
            for (const w of wins) {
                html += `
                            <div class="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/40 transition-all hover:border-emerald-300/60 hover:shadow-sm">
                                <div class="flex items-start gap-3">
                                    <span class="material-symbols-outlined text-emerald-600 text-lg mt-0.5 flex-shrink-0">${Utils.escapeHtml(w.icon)}</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between gap-2">
                                            <h4 class="text-sm font-semibold text-ink leading-snug">${Utils.escapeHtml(w.headline)}</h4>
                                            ${w.metric ? `<span class="text-lg font-light text-emerald-700 tabular-nums flex-shrink-0">${Utils.escapeHtml(w.metric)}</span>` : ''}
                                        </div>
                                        <p class="text-xs text-slate-500 leading-relaxed mt-1">${Utils.escapeHtml(w.detail)}</p>
                                    </div>
                                </div>
                            </div>`;
            }
            html += `
                        </div>
                    </div>`;
        }

        if (risks.length) {
            html += `
                    <div>
                        <div class="flex items-center gap-2 mb-4">
                            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                            <h3 class="text-xs font-semibold text-amber-700 uppercase tracking-widest">Needs Attention</h3>
                        </div>
                        <div class="space-y-3">`;
            for (const r of risks) {
                html += `
                            <div class="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-amber-200/40 transition-all hover:border-amber-300/60 hover:shadow-sm">
                                <div class="flex items-start gap-3">
                                    <span class="material-symbols-outlined text-amber-600 text-lg mt-0.5 flex-shrink-0">${Utils.escapeHtml(r.icon)}</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between gap-2">
                                            <h4 class="text-sm font-semibold text-ink leading-snug">${Utils.escapeHtml(r.headline)}</h4>
                                            ${r.metric ? `<span class="text-lg font-light text-amber-700 tabular-nums flex-shrink-0">${Utils.escapeHtml(r.metric)}</span>` : ''}
                                        </div>
                                        <p class="text-xs text-slate-500 leading-relaxed mt-1">${Utils.escapeHtml(r.detail)}</p>
                                    </div>
                                </div>
                            </div>`;
            }
            html += `
                        </div>
                    </div>`;
        }

        html += `
                </div>
            </div>
        </div>`;
    }

    // ─── Info Insight Cards (horizontal scroll) ──────
    if (infos.length) {
        html += `
        <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">`;
        infos.forEach((info, i) => {
            html += `
            <div class="flex-shrink-0 w-72 bg-white rounded-xl p-5 border border-slate-100 shadow-clay-sm transition-all hover:shadow-clay"
                 style="animation: insightSlideIn 0.3s ease-out ${i * 0.08}s both">
                <div class="flex items-start justify-between mb-3">
                    <span class="material-symbols-outlined text-slate-400 text-xl">${Utils.escapeHtml(info.icon)}</span>
                    ${info.metric ? `<span class="text-2xl font-light tracking-tight text-ink">${Utils.escapeHtml(info.metric)}</span>` : ''}
                </div>
                <h3 class="text-sm font-semibold text-ink mb-1 leading-snug">${Utils.escapeHtml(info.headline)}</h3>
                <p class="text-xs text-slate-500 leading-relaxed">${Utils.escapeHtml(info.detail)}</p>
            </div>`;
        });
        html += `
        </div>`;
    }

    // ─── Use Case Landscape (Treemap) ────────────────
    if (categories.length) {
        html += `
        <div class="bg-white p-8 rounded-xl shadow-clay-sm border border-slate-100">
            <div class="flex items-start justify-between mb-5">
                <div>
                    <h2 class="font-display italic text-xl text-slate-700">Use Case Landscape</h2>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest mt-1">What your team uses AI for</p>
                </div>
                <div id="treemapLegend" class="flex items-center gap-3 text-[10px] text-slate-400"></div>
            </div>
            <div id="treemapArea" class="w-full" style="min-height: 320px;"></div>
        </div>`;
    }

    // ─── Category Evolution + Engagement Style ───────
    html += `
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div class="lg:col-span-3 bg-white p-8 rounded-xl shadow-clay-sm border border-slate-100">
            <div class="mb-5">
                <h2 class="font-display italic text-xl text-slate-700">Category Evolution</h2>
                <p id="streamSubtitle" class="text-[10px] text-slate-400 uppercase tracking-widest mt-1">How usage patterns shift over time</p>
            </div>
            <div id="streamChartArea" class="w-full flex items-center justify-center" style="height: 260px;"></div>
        </div>
        <div class="lg:col-span-2">
            <div id="engagementBar" class="bg-white p-6 rounded-xl shadow-clay-sm border border-slate-100 h-full"></div>
        </div>
    </div>`;

    // Apply layout to DOM
    container.innerHTML = html;

    // Inject animation keyframes
    injectBriefAnimations();

    // Render complex chart sub-components
    if (categories.length) renderTreemap(categories);
    renderStreamgraph(data.streamPeriods || [], categories);
    renderEngagementBar(cognitive, total);
}

function injectBriefAnimations() {
    if (document.getElementById('briefAnimStyles')) return;
    const style = document.createElement('style');
    style.id = 'briefAnimStyles';
    style.textContent = `
        @keyframes insightSlideIn {
            from { opacity: 0; transform: translateX(16px); }
            to { opacity: 1; transform: translateX(0); }
        }
        @keyframes briefFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes treemapFadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes popoverIn {
            from { opacity: 0; transform: translateY(-50%) scale(0.96); }
            to { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
    `;
    document.head.appendChild(style);
}

// ============================================
// Treemap
// ============================================

function renderTreemap(categories) {
    const container = document.getElementById('treemapArea');
    if (!container || !categories.length) {
        if (container) container.innerHTML = '<p class="text-sm text-slate-300 italic py-16 text-center">No category data</p>';
        return;
    }

    const total = categories.reduce((s, c) => s + c.count, 0);

    // Build treemap using squarified layout
    const W = 800;
    const H = 320;
    const rects = squarify(categories.map(c => ({ ...c, value: c.count })), W, H);

    const gap = 3;
    const radius = 8;

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">`;

    // Clip paths for rounded rects
    rects.forEach((r, i) => {
        svg += `<defs><clipPath id="treeclip${i}"><rect x="${r.x + gap/2}" y="${r.y + gap/2}" width="${Math.max(0, r.w - gap)}" height="${Math.max(0, r.h - gap)}" rx="${radius}"/></clipPath></defs>`;
    });

    rects.forEach((r, i) => {
        const cat = r.data;
        const color = getCategoryColor(cat.main_category);
        const rx = r.x + gap/2;
        const ry = r.y + gap/2;
        const rw = Math.max(0, r.w - gap);
        const rh = Math.max(0, r.h - gap);
        const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;

        // Determine what fits
        const showLabel = rw > 80 && rh > 50;
        const showDetail = rw > 120 && rh > 80;
        const showArchetypes = rw > 140 && rh > 110;

        // Cognitive level mini-bar data
        const cogTotal = (cat.cognitive.delegation + cat.cognitive.collaboration + cat.cognitive.consultation + cat.cognitive.exploration) || 1;

        svg += `<g style="animation: treemapFadeIn 0.3s ease-out ${i * 0.04}s both; cursor: pointer;" class="treemap-cell" data-index="${i}">`;
        svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${radius}" fill="${color}" opacity="0.88"/>`;
        svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${radius}" fill="transparent" stroke="white" stroke-width="1" stroke-opacity="0.15"/>`;

        if (showLabel) {
            // Category name
            const fontSize = rw > 160 ? 13 : 11;
            const availW = rw - 24;
            const displayName = truncateToFit(cat.main_category, availW, `600 ${fontSize}px Inter, sans-serif`);
            svg += `<text x="${rx + 12}" y="${ry + 22}" fill="white" font-size="${fontSize}" font-weight="600" font-family="Inter, sans-serif" opacity="0.95">${escSvg(displayName)}</text>`;

            // Count + percentage
            const statsText = `${cat.count.toLocaleString()} conversations \u00B7 ${pct}%`;
            const displayStats = truncateToFit(statsText, availW, `10px Inter, sans-serif`);
            svg += `<text x="${rx + 12}" y="${ry + 38}" fill="white" font-size="10" font-family="Inter, sans-serif" opacity="0.7">${escSvg(displayStats)}</text>`;
        }

        if (showDetail) {
            // Cognitive mini bar
            const barY = ry + 48;
            const barW = Math.min(rw - 24, 120);
            const barH = 4;
            let barX = rx + 12;
            const levels = ['delegation', 'collaboration', 'consultation', 'exploration'];
            for (const level of levels) {
                const lw = (cat.cognitive[level] / cogTotal) * barW;
                if (lw > 0.5) {
                    svg += `<rect x="${barX}" y="${barY}" width="${lw}" height="${barH}" rx="2" fill="${BLOOM_COLORS_BRIEF[level]}" opacity="0.6"/>`;
                    // Bright overlay for contrast on dark bg
                    svg += `<rect x="${barX}" y="${barY}" width="${lw}" height="${barH}" rx="2" fill="white" opacity="0.3"/>`;
                }
                barX += lw;
            }
        }

        if (showArchetypes && cat.archetypes.length > 0) {
            // Top archetypes as tags
            let tagY = ry + 66;
            const maxTags = Math.min(3, cat.archetypes.length);
            const tagAvailW = rw - 24;
            for (let t = 0; t < maxTags && tagY + 14 < ry + rh - 8; t++) {
                const tagText = truncateToFit(cat.archetypes[t].name, tagAvailW, `9px Inter, sans-serif`);
                svg += `<text x="${rx + 12}" y="${tagY}" fill="white" font-size="9" font-family="Inter, sans-serif" opacity="0.55">${escSvg(tagText)}</text>`;
                tagY += 14;
            }
        }

        svg += `</g>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;

    // Hover popover for details
    container.querySelectorAll('.treemap-cell').forEach(cell => {
        cell.addEventListener('mouseenter', () => {
            clearTimeout(_popoverTimeout);
            const idx = parseInt(cell.dataset.index);
            if (idx >= 0 && idx < categories.length) {
                showCategoryPopover(categories[idx], cell);
            }
        });
        cell.addEventListener('mouseleave', () => {
            _popoverTimeout = setTimeout(dismissCategoryPopover, 200);
        });
    });
}

// Squarified treemap layout algorithm
function squarify(data, W, H) {
    if (!data.length) return [];
    const totalValue = data.reduce((s, d) => s + d.value, 0);
    if (totalValue === 0) return [];

    const sorted = [...data].sort((a, b) => b.value - a.value);
    const rects = [];

    function layoutRow(items, x, y, w, h, horizontal) {
        const rowTotal = items.reduce((s, d) => s + d.value, 0);
        let offset = 0;
        for (const item of items) {
            const fraction = item.value / rowTotal;
            if (horizontal) {
                const iw = fraction * w;
                rects.push({ x: x + offset, y, w: iw, h, data: item });
                offset += iw;
            } else {
                const ih = fraction * h;
                rects.push({ x, y: y + offset, w, h: ih, data: item });
                offset += ih;
            }
        }
    }

    function worst(row, sideLength) {
        const rowTotal = row.reduce((s, d) => s + d.scaledValue, 0);
        const rowTotal2 = rowTotal * rowTotal;
        const side2 = sideLength * sideLength;
        let maxRatio = 0;
        for (const item of row) {
            const r = Math.max(
                (side2 * item.scaledValue) / rowTotal2,
                rowTotal2 / (side2 * item.scaledValue)
            );
            if (r > maxRatio) maxRatio = r;
        }
        return maxRatio;
    }

    // Scale values to total area
    const totalArea = W * H;
    const scaled = sorted.map(d => ({ ...d, scaledValue: (d.value / totalValue) * totalArea }));

    let x = 0, y = 0, w = W, h = H;
    let remaining = [...scaled];

    while (remaining.length > 0) {
        const horizontal = w >= h;
        const sideLength = horizontal ? h : w;
        const row = [remaining[0]];
        remaining = remaining.slice(1);

        let currentWorst = worst(row, sideLength);

        while (remaining.length > 0) {
            const candidate = [...row, remaining[0]];
            const candidateWorst = worst(candidate, sideLength);
            if (candidateWorst <= currentWorst) {
                row.push(remaining[0]);
                remaining = remaining.slice(1);
                currentWorst = candidateWorst;
            } else {
                break;
            }
        }

        const rowTotal = row.reduce((s, d) => s + d.scaledValue, 0);
        if (horizontal) {
            const rowWidth = rowTotal / h;
            layoutRow(row, x, y, rowWidth, h, false);
            x += rowWidth;
            w -= rowWidth;
        } else {
            const rowHeight = rowTotal / w;
            layoutRow(row, x, y, w, rowHeight, true);
            y += rowHeight;
            h -= rowHeight;
        }
    }

    return rects;
}

// ============================================
// Category Popover (hover detail)
// ============================================

let _popoverTimeout = null;

function showCategoryPopover(cat, cellEl) {
    clearTimeout(_popoverTimeout);
    dismissCategoryPopover();

    const cellRect = cellEl.getBoundingClientRect();
    const popoverWidth = 280;

    // Horizontal: prefer right of cell, fall back to left
    let left;
    if (cellRect.right + popoverWidth + 12 <= window.innerWidth) {
        left = cellRect.right + 8;
    } else if (cellRect.left - popoverWidth - 8 >= 0) {
        left = cellRect.left - popoverWidth - 8;
    } else {
        left = Math.max(8, (window.innerWidth - popoverWidth) / 2);
    }
    let top = cellRect.top + cellRect.height / 2;

    const color = getCategoryColor(cat.main_category);
    const cogTotal = (cat.cognitive.delegation + cat.cognitive.collaboration + cat.cognitive.consultation + cat.cognitive.exploration) || 1;
    const levels = ['delegation', 'collaboration', 'consultation', 'exploration'];

    const subcatHtml = cat.subcategories.slice(0, 5).map(s =>
        `<div class="flex items-center justify-between py-0.5">
            <span class="text-[11px] text-slate-600 truncate mr-2">${Utils.escapeHtml(s.name)}</span>
            <span class="text-[10px] text-slate-400 font-medium flex-shrink-0">${s.count}</span>
        </div>`
    ).join('');
    const moreSubcats = cat.subcategories.length > 5
        ? `<span class="text-[10px] text-slate-400 italic">+${cat.subcategories.length - 5} more</span>` : '';

    const archetypeHtml = cat.archetypes.slice(0, 4).map(a =>
        `<span class="inline-block px-2 py-0.5 text-[10px] rounded-full bg-parchment-100 text-ink-light border border-parchment-300">${Utils.escapeHtml(a.name)}</span>`
    ).join(' ');

    const cogBarHtml = levels.map(level => {
        const pct = Math.round((cat.cognitive[level] / cogTotal) * 100);
        return pct > 0 ? `<div class="h-full rounded-full" style="width:${pct}%;background-color:${BLOOM_COLORS_BRIEF[level]}"></div>` : '';
    }).filter(Boolean).join('');

    const cogLegendHtml = levels.map(level => {
        const pct = Math.round((cat.cognitive[level] / cogTotal) * 100);
        return pct > 0 ? `<div class="flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full" style="background-color:${BLOOM_COLORS_BRIEF[level]}"></span>
            <span class="text-[10px] text-slate-500">${BLOOM_LABELS_BRIEF[level]}</span>
            <span class="text-[10px] text-slate-400">${pct}%</span>
        </div>` : '';
    }).filter(Boolean).join('');

    const popover = document.createElement('div');
    popover.id = 'categoryPopover';
    popover.className = 'bg-white rounded-xl shadow-clay border border-slate-100 p-5';
    popover.style.cssText = `position:fixed;left:${left}px;top:${top}px;transform:translateY(-50%);width:${popoverWidth}px;z-index:50;animation:popoverIn 0.15s ease-out;pointer-events:auto;max-height:${window.innerHeight - 32}px;overflow-y:auto;`;
    popover.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:${color}"></span>
            <h3 class="font-display italic text-base text-ink leading-snug">${Utils.escapeHtml(cat.main_category)}</h3>
        </div>
        <p class="text-[10px] text-slate-400 uppercase tracking-widest mb-3">${cat.count.toLocaleString()} conversations \u00B7 ${cat.pct}% of total \u00B7 avg ${cat.avgDepth} turns</p>
        ${cat.subcategories.length > 0 ? `<div class="mb-3">
            <h4 class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Subcategories</h4>
            ${subcatHtml}${moreSubcats}
        </div>` : ''}
        ${cat.archetypes.length > 0 ? `<div class="mb-3">
            <h4 class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Patterns</h4>
            <div class="flex flex-wrap gap-1">${archetypeHtml}</div>
        </div>` : ''}
        <div>
            <h4 class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Engagement</h4>
            <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mb-1.5">${cogBarHtml}</div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5">${cogLegendHtml}</div>
        </div>`;

    popover.addEventListener('mouseenter', () => clearTimeout(_popoverTimeout));
    popover.addEventListener('mouseleave', () => {
        _popoverTimeout = setTimeout(dismissCategoryPopover, 150);
    });

    document.body.appendChild(popover);

    // Clamp vertical so it stays on screen
    const pr = popover.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) {
        top -= pr.bottom - (window.innerHeight - 8);
        popover.style.top = top + 'px';
    }
    if (pr.top < 8) {
        popover.style.top = '8px';
        popover.style.transform = 'none';
    }
}

function dismissCategoryPopover() {
    const el = document.getElementById('categoryPopover');
    if (el) el.remove();
}

// ============================================
// Streamgraph (Stacked Area by Category)
// ============================================

function renderStreamgraph(periods, categories) {
    const container = document.getElementById('streamChartArea');
    const subtitleEl = document.getElementById('streamSubtitle');
    if (!container) return;

    if (!periods || periods.length < 2) {
        if (periods && periods.length === 1) {
            container.innerHTML = renderSinglePeriodBar(periods[0], categories);
        } else {
            container.innerHTML = '<p class="text-sm text-slate-300 italic">Not enough time periods for trend</p>';
        }
        if (subtitleEl) subtitleEl.textContent = 'How usage patterns shift over time';
        return;
    }

    // Get top categories by total volume (limit to top 6 + "Other")
    const catTotals = {};
    for (const p of periods) {
        for (const [cat, count] of Object.entries(p.counts)) {
            catTotals[cat] = (catTotals[cat] || 0) + count;
        }
    }
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const topCats = sortedCats.slice(0, 6).map(e => e[0]);
    const hasOther = sortedCats.length > 6;

    const n = periods.length;
    const W = 800;
    const H = 240;
    const padLeft = 36;
    const padRight = 4;
    const padTop = 12;
    const padBottom = 28;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    // Find max per-period total for y scaling
    let maxTotal = 0;
    for (const p of periods) {
        maxTotal = Math.max(maxTotal, p.total || 0);
    }
    if (maxTotal === 0) maxTotal = 1;

    // Add headroom
    const yMax = maxTotal * 1.15;

    const xStep = chartW / (n - 1);
    function getX(i) { return padLeft + i * xStep; }
    function getY(val) { return padTop + chartH * (1 - val / yMax); }

    const uid = 'stream_' + Date.now();

    // Build stacked data
    const allCats = hasOther ? [...topCats, '__other__'] : topCats;
    const stackedData = periods.map(p => {
        const row = {};
        let otherSum = 0;
        for (const [cat, count] of Object.entries(p.counts)) {
            if (topCats.includes(cat)) {
                row[cat] = count;
            } else {
                otherSum += count;
            }
        }
        if (hasOther) row['__other__'] = otherSum;
        return row;
    });

    // Gradients
    let defs = '';
    for (const cat of allCats) {
        const color = cat === '__other__' ? '#a8a29e' : getCategoryColor(cat);
        defs += `
            <linearGradient id="${uid}_${cat.replace(/[^a-zA-Z0-9]/g, '_')}" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0.3"/>
            </linearGradient>`;
    }

    // Grid
    let gridLines = '';
    const tickCount = 4;
    for (let t = 0; t <= tickCount; t++) {
        const val = (t / tickCount) * yMax;
        const y = getY(val);
        gridLines += `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
        const label = Math.round(val);
        gridLines += `<text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" fill="#94a3b8" font-size="9" font-family="Inter, sans-serif">${label}</text>`;
    }

    // Stacked areas (bottom-up)
    let areas = '';
    let lines = '';
    const bottomY = getY(0);

    // Compute cumulative stacks per period
    const cumulative = periods.map(() => 0);

    for (const cat of allCats.slice().reverse()) {
        const color = cat === '__other__' ? '#a8a29e' : getCategoryColor(cat);
        const gradId = `${uid}_${cat.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const prevBottom = [...cumulative];
        for (let i = 0; i < n; i++) {
            cumulative[i] += (stackedData[i][cat] || 0);
        }

        // Area path: top line forward, bottom line backward
        let topPath = `M${getX(0).toFixed(1)},${getY(cumulative[0]).toFixed(1)}`;
        for (let i = 1; i < n; i++) {
            topPath += ` L${getX(i).toFixed(1)},${getY(cumulative[i]).toFixed(1)}`;
        }
        let bottomPath = `L${getX(n - 1).toFixed(1)},${getY(prevBottom[n - 1]).toFixed(1)}`;
        for (let i = n - 2; i >= 0; i--) {
            bottomPath += ` L${getX(i).toFixed(1)},${getY(prevBottom[i]).toFixed(1)}`;
        }

        areas += `<path d="${topPath} ${bottomPath} Z" fill="url(#${gradId})" stroke="${color}" stroke-width="0.5" stroke-opacity="0.3"/>`;
    }

    // X-axis labels
    const maxLabels = Math.min(7, n);
    const labelStep = Math.max(1, Math.floor((n - 1) / (maxLabels - 1)));
    let xLabels = '';
    for (let i = 0; i < n; i += labelStep) {
        const x = getX(i);
        const anchor = i === 0 ? 'start' : (i + labelStep >= n ? 'end' : 'middle');
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="${anchor}" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${escSvg(periods[i].label)}</text>`;
    }
    if ((n - 1) % labelStep !== 0) {
        const x = getX(n - 1);
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="end" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif">${escSvg(periods[n - 1].label)}</text>`;
    }

    container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
            <defs>${defs}</defs>
            ${gridLines}
            ${areas}
            ${xLabels}
        </svg>`;

    // Legend
    const legendEl = document.getElementById('treemapLegend');
    // Use the streamgraph container's parent for the legend instead
    const chartCard = container.closest('.bg-white');
    if (chartCard) {
        let legendContainer = chartCard.querySelector('.stream-legend');
        if (!legendContainer) {
            legendContainer = document.createElement('div');
            legendContainer.className = 'stream-legend flex flex-wrap gap-x-4 gap-y-1 mt-3';
            container.parentNode.appendChild(legendContainer);
        }
        legendContainer.innerHTML = allCats.map(cat => {
            const color = cat === '__other__' ? '#a8a29e' : getCategoryColor(cat);
            const label = cat === '__other__' ? 'Other' : cat;
            return `<span class="flex items-center gap-1.5 text-[10px] text-slate-500"><span class="w-2 h-2 rounded-full inline-block" style="background:${color}"></span>${escSvg(label)}</span>`;
        }).join('');
    }
}

function renderSinglePeriodBar(period, categories) {
    if (!period || !period.counts) return '<p class="text-sm text-slate-300 italic">No data</p>';

    const entries = Object.entries(period.counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0) || 1;

    let html = '<div class="w-full max-w-lg mx-auto space-y-2">';
    for (const [cat, count] of entries) {
        const pct = Math.round((count / total) * 100);
        const color = getCategoryColor(cat);
        html += `
            <div class="flex items-center gap-3">
                <span class="text-xs text-slate-500 w-36 text-right font-medium truncate">${Utils.escapeHtml(cat)}</span>
                <div class="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${color}"></div>
                </div>
                <span class="text-xs text-slate-500 w-10 font-medium">${pct}%</span>
            </div>`;
    }
    html += '</div>';
    return html;
}

// ============================================
// Engagement Style Bar (compact Bloom)
// ============================================

function renderEngagementBar(cognitive, total) {
    const container = document.getElementById('engagementBar');
    if (!container || !total) { if (container) container.innerHTML = ''; return; }

    const levels = ['delegation', 'collaboration', 'consultation', 'exploration'];
    // Use cognitive total (not totalConversations) since some conversations may lack cognitive_level
    const cogTotal = levels.reduce((s, l) => s + (cognitive[l] || 0), 0) || 1;
    const segments = levels.map(level => ({
        level,
        count: cognitive[level] || 0,
        pct: Math.round(((cognitive[level] || 0) / cogTotal) * 100),
    })).filter(s => s.pct > 0);

    const barHtml = segments.map(s =>
        `<div class="h-full rounded-full transition-all duration-500" style="width: ${s.pct}%; background-color: ${BLOOM_COLORS_BRIEF[s.level]}"></div>`
    ).join('');

    const legendHtml = segments.map(s =>
        `<div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" style="background-color: ${BLOOM_COLORS_BRIEF[s.level]}"></span>
            <span class="text-xs text-slate-600 font-medium">${BLOOM_LABELS_BRIEF[s.level]}</span>
            <span class="text-xs text-slate-400">${s.pct}%</span>
        </div>`
    ).join('');

    container.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div>
                <h2 class="font-display italic text-lg text-slate-700">Engagement Style</h2>
                <p class="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">How your team interacts with AI</p>
            </div>
        </div>
        <div class="w-full h-5 bg-slate-100 rounded-full overflow-hidden flex mb-3">
            ${barHtml}
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-1">
            ${legendHtml}
        </div>`;
}

// ============================================
// SVG Helpers
// ============================================

function escSvg(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Offscreen canvas for accurate text measurement
const _measureCanvas = document.createElement('canvas').getContext('2d');
function truncateToFit(text, maxWidth, font) {
    _measureCanvas.font = font;
    if (_measureCanvas.measureText(text).width <= maxWidth) return text;
    const ellipsis = '\u2026';
    const ellipsisW = _measureCanvas.measureText(ellipsis).width;
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (_measureCanvas.measureText(text.substring(0, mid)).width <= maxWidth - ellipsisW) lo = mid;
        else hi = mid - 1;
    }
    return lo === text.length ? text : text.substring(0, lo) + ellipsis;
}
