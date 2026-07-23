// Admin Dashboard - Renderer JavaScript

document.addEventListener('DOMContentLoaded', () => {
    window.pageLoadTime = window.performance.now();

    if (window.applyPageEnterAnimation) {
        window.applyPageEnterAnimation('forward');
    }

    if (window.showPageLoadingOverlay) window.showPageLoadingOverlay();
    loadAdminData().then(async () => {
        if (window.hidePageLoadingOverlay) await window.hidePageLoadingOverlay();
        playEntryAnimations();
    });

    document.fonts.ready.then(() => requestAnimationFrame(() => { alignKPIsWithHeading(); fitTeamName(); }));
    let _resizeRaf = null;
    window.addEventListener('resize', () => {
        if (_resizeRaf) return;
        _resizeRaf = requestAnimationFrame(() => { alignKPIsWithHeading(); fitTeamName(); _resizeRaf = null; });
    });
});

// ============================================
// Entry Animation State
// ============================================

let _animationState = null;

function playEntryAnimations() {
    if (!_animationState) return;
    const { members, managers, prompts, risk, teamName } = _animationState;
    if (members != null) countUp(document.getElementById('statTotalMembers'), members);
    if (managers != null) countUp(document.getElementById('statTotalManagers'), managers);
    if (prompts != null) countUp(document.getElementById('statTotalPrompts'), prompts, 2000, n => n.toLocaleString());
    if (risk != null) countUp(document.getElementById('statRiskEvents'), risk);
    if (teamName) {
        const el = document.getElementById('contentTeamName');
        // Pre-compute font size for full text so it doesn't overflow during animation
        el.textContent = teamName;
        fitTeamName();
        el.textContent = '';
        typewriterEffect(el, teamName, 120, () => {
            alignKPIsWithHeading();
        });
    }
}

// ============================================
// Fit Team Name
// ============================================

function fitTeamName() {
    const h1 = document.querySelector('#contentTeamName')?.closest('h1');
    if (!h1) return;
    const container = h1.parentElement;
    // Reset to original size
    h1.style.fontSize = '';
    h1.style.whiteSpace = 'nowrap';
    const singleLineHeight = h1.scrollHeight;
    h1.style.whiteSpace = '';
    const maxWidth = container.clientWidth;
    let fontSize = parseFloat(getComputedStyle(h1).fontSize);
    const minFontSize = 32;
    while ((h1.scrollWidth > maxWidth || h1.scrollHeight > singleLineHeight) && fontSize > minFontSize) {
        fontSize -= 2;
        h1.style.fontSize = fontSize + 'px';
    }
}

// ============================================
// KPI Alignment
// ============================================

function alignKPIsWithHeading() {
    const heading = document.getElementById('quickActionsHeading');
    const kpiContainer = document.getElementById('kpiContainer');
    if (!heading || !kpiContainer) return;

    kpiContainer.style.marginRight = '';

    const range = document.createRange();
    range.selectNodeContents(heading);
    const textRight = range.getBoundingClientRect().right;

    const kpiRight = kpiContainer.getBoundingClientRect().right;
    const delta = kpiRight - textRight;
    if (delta > 0) {
        kpiContainer.style.marginRight = delta + 'px';
    }
}

// ============================================
// Data Loading
// ============================================

let _isLoadingAdminData = false;

async function loadAdminData() {
    if (!window.electronAPI) return;
    if (_isLoadingAdminData) return;
    _isLoadingAdminData = true;

    try {
        const [profile, dashboardStats, employees] = await Promise.all([
            window.electronAPI.getUserProfile(),
            window.electronAPI.getDashboardStats(null, '2000-01-01'),
            window.electronAPI.getEmployees()
        ]);

        if (profile) updateUserProfile(profile);

        const empList = employees || [];
        renderOverviewStats(empList, dashboardStats);

        // Group employees by department, excluding team-wide admins (no dept)
        const deptMap = new Map();
        for (const emp of empList) {
            if (!emp.department) continue;
            const dept = emp.department;
            if (!deptMap.has(dept)) deptMap.set(dept, []);
            deptMap.get(dept).push(emp);
        }

        // Fetch top 3 categories and dept stats for each department in parallel
        const [categoryResults, statsResults] = await Promise.all([
            Promise.all(
                Array.from(deptMap.entries()).map(async ([dept, members]) => {
                    const deptId = members[0]?.department_id;
                    if (!deptId) return [dept, []];
                    try {
                        const result = await window.electronAPI.getCategories(deptId);
                        return [dept, (result?.categories || []).slice(0, 3)];
                    } catch {
                        return [dept, []];
                    }
                })
            ),
            Promise.all(
                Array.from(deptMap.entries()).map(async ([dept, members]) => {
                    const deptId = members[0]?.department_id;
                    if (!deptId) return [dept, null];
                    try {
                        const result = await window.electronAPI.getDashboardStats(deptId, '2000-01-01');
                        return [dept, result];
                    } catch {
                        return [dept, null];
                    }
                })
            )
        ]);
        allDeptCategories = new Map(categoryResults);
        allDeptStats = new Map(statsResults);

        renderDepartmentCards(deptMap);
    } catch (error) {
        console.error('Failed to load admin data:', error);
    } finally {
        _isLoadingAdminData = false;
    }
}

// ============================================
// Overview Stats
// ============================================

function renderOverviewStats(employees, stats) {
    const totalMembersEl = document.getElementById('statTotalMembers');
    const totalManagersEl = document.getElementById('statTotalManagers');
    const totalPromptsEl = document.getElementById('statTotalPrompts');
    const riskEventsEl = document.getElementById('statRiskEvents');
    const riskBadgeEl = document.getElementById('statRiskBadge');

    const managersCount = employees.filter(e => (e.role || '').toLowerCase() === 'manager').length;

    const targets = {
        members: employees.length,
        managers: managersCount,
        prompts: stats?.totalPrompts || 0,
        risk: stats?.riskEvents || 0,
    };

    _animationState = { ..._animationState, ...targets };

    if (stats) {
        if (riskBadgeEl) {
            if (stats.riskEvents > 0) {
                riskBadgeEl.innerHTML = '';
                riskBadgeEl.classList.remove('text-emerald-500');
                riskBadgeEl.classList.add('text-amber-500');
            } else {
                riskBadgeEl.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Safe Operation</span>
                `;
            }
        }
    }
}

// ============================================
// Department Cards
// ============================================

let currentDeptPage = 0;
let allDepartmentsData = []; // stores [dept, members] pairs
let allDeptCategories = new Map(); // dept name -> top 3 categories array
let allDeptStats = new Map(); // dept name -> dashboard stats
const DEPTS_PER_PAGE = 6;

function renderDepartmentCards(deptMap) {
    const grid = document.getElementById('managerCardsGrid');
    const noManagersMsg = document.getElementById('noManagersMessage');

    if (!grid) return;

    if (deptMap.size === 0) {
        grid.classList.add('hidden');
        if (noManagersMsg) noManagersMsg.classList.remove('hidden');
        return;
    }

    allDepartmentsData = Array.from(deptMap.entries());
    currentDeptPage = 0;

    const pagination = document.getElementById('deptPagination');
    if (pagination) {
        if (allDepartmentsData.length > DEPTS_PER_PAGE) {
            pagination.classList.remove('hidden');
            pagination.classList.add('flex');
        } else {
            pagination.classList.add('hidden');
            pagination.classList.remove('flex');
        }
    }

    renderCurrentDeptPage();
}

function deptCardHtml([dept, members]) {
    const managers = members.filter(m => (m.role || '').toLowerCase() === 'manager');
    const empLabel = `${members.length} employee${members.length !== 1 ? 's' : ''}`;
    const managerLine = managers.length > 0
        ? `<p class="text-xs text-slate-500">Manager${managers.length > 1 ? 's' : ''}: ${managers.map(m => escapeHtml(m.full_name || m.email || 'Unknown')).join(', ')}</p>`
        : `<p class="text-xs text-slate-400 italic">No manager assigned</p>`;
    const deptId = members[0]?.department_id || '';

    const deptStats = allDeptStats.get(dept);
    const totalPrompts = deptStats?.totalPrompts ?? null;
    const promptsLine = totalPrompts !== null
        ? `<p class="text-xs text-slate-400">${totalPrompts.toLocaleString()} prompts</p>`
        : '';

    const cats = allDeptCategories.get(dept) || [];
    const categoriesHtml = cats.length > 0
        ? cats.map(cat => `
            <div class="flex items-center justify-between gap-2">
                <p class="text-xs text-slate-600 truncate">${escapeHtml(cat.name)}</p>
                <span class="text-xs font-medium text-slate-500 shrink-0">${cat.percentage}%</span>
            </div>`).join('')
        : `<p class="text-xs text-slate-400 italic">No data</p>`;

    return `
        <div class="bg-white p-6 rounded-xl shadow-clay-sm border border-slate-100 cursor-pointer hover:shadow-clay hover:border-primary/20 transition-all group"
             data-dept-id="${escapeHtml(deptId)}"
             data-dept-name="${escapeHtml(dept)}"
             onclick="navigateToManagerDashboard(this.dataset.deptId, this.dataset.deptName)">
            <div class="flex items-start gap-4">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 group/name">
                        <p class="text-base font-display font-bold text-black group-hover:text-primary transition-colors">${escapeHtml(dept)}</p>
                        <button onclick="startEditDept(event)"
                            class="opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100"
                            title="Rename department">
                            <span class="material-symbols-outlined text-slate-400" style="font-size:14px">edit</span>
                        </button>
                    </div>
                    ${managerLine}
                    <p class="text-xs text-slate-400">${empLabel}</p>
                    ${promptsLine}
                </div>
                <div class="w-px self-stretch bg-slate-100"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-display font-bold text-black mb-1.5">Top Categories</p>
                    ${categoriesHtml}
                </div>
            </div>
        </div>
    `;
}

function renderCurrentDeptPage() {
    const grid = document.getElementById('managerCardsGrid');
    if (!grid) return;

    const start = currentDeptPage * DEPTS_PER_PAGE;
    const slice = allDepartmentsData.slice(start, start + DEPTS_PER_PAGE);
    grid.innerHTML = slice.map(deptCardHtml).join('');
    updateDeptPagination();
}

function updateDeptPagination() {
    const totalPages = Math.ceil(allDepartmentsData.length / DEPTS_PER_PAGE);
    const dotsEl = document.getElementById('deptPageDots');
    const prevBtn = document.getElementById('deptPrevBtn');
    const nextBtn = document.getElementById('deptNextBtn');

    if (dotsEl) {
        dotsEl.innerHTML = Array.from({ length: totalPages }, (_, i) =>
            `<span class="w-1.5 h-1.5 rounded-full transition-colors ${i === currentDeptPage ? 'bg-primary' : 'bg-slate-300'}"></span>`
        ).join('');
    }

    if (prevBtn) prevBtn.disabled = currentDeptPage === 0;
    if (nextBtn) nextBtn.disabled = currentDeptPage >= totalPages - 1;
}

function changeDeptPage(dir) {
    const totalPages = Math.ceil(allDepartmentsData.length / DEPTS_PER_PAGE);
    currentDeptPage = Math.max(0, Math.min(totalPages - 1, currentDeptPage + dir));
    renderCurrentDeptPage();
}

// ============================================
// Helpers
// ============================================

function typewriterEffect(element, text, speed = 120, onComplete) {
    if (!element) return;
    element.textContent = '';
    let i = 0;
    function type() {
        if (i < text.length) {
            element.textContent += text[i++];
            setTimeout(type, speed);
        } else if (onComplete) {
            onComplete();
        }
    }
    type();
}

function countUp(element, target, duration = 2000, formatter) {
    if (!element) return;
    const start = performance.now();
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = Math.round(eased * target);
        element.textContent = formatter ? formatter(current) : current;
        if (progress < 1) requestAnimationFrame(step);
        else element.textContent = formatter ? formatter(target) : target;
    }
    requestAnimationFrame(step);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, '&#39;');
}

function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============================================
// User Profile
// ============================================

function updateUserProfile(profile) {
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const teamNameEl = document.getElementById('headerTeamName');
    const contentTeamNameEl = document.getElementById('contentTeamName');

    if (nameEl) nameEl.textContent = profile.full_name || 'User';
    if (roleEl) roleEl.textContent = (profile.role || 'Admin').toUpperCase();
    if (teamNameEl && profile.team_name) teamNameEl.textContent = profile.team_name;
    if (contentTeamNameEl && profile.team_name) {
        if (!_animationState) _animationState = {};
        _animationState.teamName = profile.team_name + ' ';
    }
}

// ============================================
// Navigation
// ============================================

function navigateToManagerDashboard(deptId, deptName) {
    if (deptId) {
        sessionStorage.setItem('viewingDepartmentContext', JSON.stringify({
            departmentId: deptId,
            departmentName: deptName
        }));
    }
    if (window.navigateWithTransition) {
        window.navigateWithTransition('dashboard', '../dashboard/index.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('dashboard');
    } else {
        window.location.href = '../dashboard/index.html';
    }
}

function navigateToTeamOverview() {
    sessionStorage.setItem('navigationReferrer', 'adminDashboard');
    if (window.navigateWithTransition) {
        window.navigateWithTransition('teamOverview', '../team/teamOverview.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('teamOverview');
    } else {
        window.location.href = '../team/teamOverview.html';
    }
}

function navigateToSecurityCenter() {
    sessionStorage.removeItem('securityDepartmentContext'); // combined view
    sessionStorage.setItem('navigationReferrer', 'adminDashboard');
    if (window.navigateWithTransition) {
        window.navigateWithTransition('securityCenter', '../securityDashboard/securityCenter.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('securityCenter');
    } else {
        window.location.href = '../securityDashboard/securityCenter.html';
    }
}

function navigateToMyUsage() {
    sessionStorage.setItem('navigationReferrer', 'adminDashboard');
    if (window.navigateWithTransition) {
        window.navigateWithTransition('myUsage', '../employees/myUsage.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('myUsage');
    } else {
        window.location.href = '../employees/myUsage.html';
    }
}

function navigateToTeamManagement() {
    if (window.navigateWithTransition) {
        window.navigateWithTransition('adminTeamManagement', '../admin/adminTeamManagement.html', 'forward');
    } else if (window.electronAPI) {
        window.electronAPI.navigateTo('adminTeamManagement');
    } else {
        window.location.href = '../admin/adminTeamManagement.html';
    }
}

function startEditDept(event) {
    event.stopPropagation();
    const card = event.target.closest('[data-dept-id]');
    if (!card) return;
    const deptId = card.dataset.deptId;
    const currentName = card.dataset.deptName;
    const nameContainer = card.querySelector('.group\\/name');
    if (!nameContainer) return;

    nameContainer.dataset.editDeptName = currentName;
    nameContainer.innerHTML = `
        <input class="text-base font-display font-bold border border-primary rounded px-1 py-0 w-36 focus:outline-none focus:ring-1 focus:ring-primary"
            value="${escapeHtml(currentName)}" />
        <button class="p-0.5 rounded hover:bg-green-100 text-green-600" title="Save">
            <span class="material-symbols-outlined" style="font-size:14px">check</span>
        </button>
        <button class="p-0.5 rounded hover:bg-slate-100 text-slate-400" title="Cancel">
            <span class="material-symbols-outlined" style="font-size:14px">close</span>
        </button>
    `;

    const input = nameContainer.querySelector('input');
    const [saveBtn, cancelBtn] = nameContainer.querySelectorAll('button');

    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); saveDeptEdit(deptId, input, currentName); }
        if (e.key === 'Escape') { e.stopPropagation(); restoreNameContainer(nameContainer); }
    });
    saveBtn.addEventListener('click', e => { e.stopPropagation(); saveDeptEdit(deptId, input, currentName); });
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); restoreNameContainer(nameContainer); });

    input.focus();
    input.select();
}

function restoreNameContainer(nameContainer) {
    if (!nameContainer) { renderCurrentDeptPage(); return; }
    const name = nameContainer.dataset.editDeptName;
    if (!name) { renderCurrentDeptPage(); return; }
    nameContainer.innerHTML = `
        <p class="text-base font-display font-bold text-black group-hover:text-primary transition-colors">${escapeHtml(name)}</p>
        <button onclick="startEditDept(event)"
            class="opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100"
            title="Rename department">
            <span class="material-symbols-outlined text-slate-400" style="font-size:14px">edit</span>
        </button>`;
    delete nameContainer.dataset.editDeptName;
}

async function saveDeptEdit(deptId, input, oldName) {
    const newName = input?.value?.trim();
    if (!newName || newName === oldName) {
        restoreNameContainer(input?.closest('.group\\/name'));
        return;
    }

    // Inject shimmer keyframe animation once
    if (!document.getElementById('dept-shimmer-style')) {
        const style = document.createElement('style');
        style.id = 'dept-shimmer-style';
        style.textContent = `@keyframes dept-shimmer-slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }`;
        document.head.appendChild(style);
    }

    // Replace edit UI with shimmer text while saving
    const nameContainer = input.closest('.group\\/name');
    if (nameContainer) {
        nameContainer.innerHTML = `
            <p class="text-base font-display font-bold text-black"
               style="position:relative;overflow:hidden">
                ${escapeHtml(newName)}
                <span style="position:absolute;top:0;left:0;width:100%;height:100%;
                    background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
                    animation:dept-shimmer-slide 1.2s ease-in-out infinite;"></span>
            </p>`;
    }

    const result = await window.electronAPI.updateDepartment(deptId, newName);
    if (!result?.success) {
        window.showNotification(result?.error || 'Failed to rename department', 'error');
        renderCurrentDeptPage();
        return;
    }

    // Update allDepartmentsData: find by department_id
    for (let i = 0; i < allDepartmentsData.length; i++) {
        const [, members] = allDepartmentsData[i];
        if (members[0]?.department_id === deptId) {
            allDepartmentsData[i][0] = newName;
            break;
        }
    }
    // Remap allDeptCategories and allDeptStats keys
    if (allDeptCategories.has(oldName)) {
        allDeptCategories.set(newName, allDeptCategories.get(oldName));
        allDeptCategories.delete(oldName);
    }
    if (allDeptStats.has(oldName)) {
        allDeptStats.set(newName, allDeptStats.get(oldName));
        allDeptStats.delete(oldName);
    }

    window.showNotification('Department renamed successfully', 'success');
    renderCurrentDeptPage();
}

// Global exports
window.navigateToManagerDashboard = navigateToManagerDashboard;
window.navigateToTeamOverview = navigateToTeamOverview;
window.navigateToSecurityCenter = navigateToSecurityCenter;
window.navigateToMyUsage = navigateToMyUsage;
window.navigateToTeamManagement = navigateToTeamManagement;
window.startEditDept = startEditDept;
window.changeDeptPage = changeDeptPage;
