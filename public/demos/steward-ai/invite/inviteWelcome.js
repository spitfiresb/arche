// Invite onboarding wizard (invited user flow).

const api = window.electronAPI;

const state = {
  inviteToken: null,
  inviteInfo: null,
  userProfile: null,
  joinedTeam: null,
  path: 'signup', // 'signup' | 'oauthOnly' | 'signedIn'
  currentStep: null,
  needsName: false,
  lastInteractiveStep: 'welcome',
  extensionPoller: null,
  accessibilityPoller: null,
  accessibilityGranted: false,
  accessibilityFirstCheckDone: false,
  accessibilityStepEnteredAt: null,
  accessibilityGrantClickedAt: null,
  isTransitioning: false,
  pendingStep: null,
  devMock: { enabled: false },
  /** 'oauth' | 'teamJoin' — why we're on the processing step (controls Re-launch hint visibility) */
  processingContext: null,
};

// Canonical order for direction detection (forward = higher index)
const STEP_ORDER = ['welcome', 'accessibility', 'oauth', 'name', 'confirm', 'processing', 'extension', 'done'];

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const welcomeState = document.getElementById('welcomeState');
const errorTitle = document.getElementById('errorTitle');
const errorMessage = document.getElementById('errorMessage');
const errorActionBtn = document.getElementById('errorActionBtn');
const toastError = document.getElementById('toastError');
const toastErrorMessage = document.getElementById('toastErrorMessage');
const toastErrorDismiss = document.getElementById('toastErrorDismiss');

// Persistent left column & progress bar
const persistentProgressBar = document.getElementById('persistentProgressBar');
const persistentStepLabel = document.getElementById('persistentStepLabel');

// Invite header fields
const inviterNameEl = document.getElementById('inviterName');
const inviterAvatarEl = document.getElementById('inviterAvatar');
const teamNameEl = document.getElementById('teamName');
const teamNameInlineEl = document.getElementById('teamNameInline');
const expiresAtEl = document.getElementById('expiresAt');
const signedInAsLeftEl = document.getElementById('signedInAsLeft');

// Steps
const stepEls = Array.from(document.querySelectorAll('[data-step]'));

// Buttons
const welcomeContinueBtn = document.getElementById('welcomeContinueBtn');

const nameBackBtn = document.getElementById('nameBackBtn');
const nameContinueBtn = document.getElementById('nameContinueBtn');

const oauthBackBtn = document.getElementById('oauthBackBtn');
const oauthGoogleBtn = document.getElementById('oauthGoogleBtn');
const oauthMicrosoftBtn = document.getElementById('oauthMicrosoftBtn');

const confirmBackBtn = document.getElementById('confirmBackBtn');
const joinTeamBtn = document.getElementById('joinTeamBtn');

const accessibilityBackBtn = document.getElementById('accessibilityBackBtn');
const accessibilityContinueBtn = document.getElementById('accessibilityContinueBtn');
const accessibilityGrantBtn = document.getElementById('accessibilityGrantBtn');
const accessibilityStatusBadge = document.getElementById('accessibilityStatusBadge');
const accessibilityEscapeHatch = document.getElementById('accessibilityEscapeHatch');
const accessibilitySkipBtn = document.getElementById('accessibilitySkipBtn');

const extensionBackBtn = document.getElementById('extensionBackBtn');
const extensionContinueBtn = document.getElementById('extensionContinueBtn');
const browserCardsContainer = document.getElementById('browserCardsContainer');

const openAppBtn = document.getElementById('openAppBtn');

const oauthCancelHint = document.getElementById('oauthCancelHint');
const oauthCancelBtn = document.getElementById('oauthCancelBtn');

// Inputs
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');

// Field-level error elements & helpers
const fieldErrorEls = {
  firstName: document.getElementById('firstNameError'),
  lastName: document.getElementById('lastNameError'),
};

const NORMAL_BORDER_CLASSES = ['border-gray-200', 'focus:border-primary', 'focus:ring-primary/20'];
const ERROR_BORDER_CLASSES = ['border-red-400', 'ring-2', 'ring-red-100', 'focus:border-red-400', 'focus:ring-red-100'];

function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errEl = fieldErrorEls[fieldId];
  if (input) {
    NORMAL_BORDER_CLASSES.forEach(c => input.classList.remove(c));
    ERROR_BORDER_CLASSES.forEach(c => input.classList.add(c));
  }
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('shown');
  }
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errEl = fieldErrorEls[fieldId];
  if (input) {
    ERROR_BORDER_CLASSES.forEach(c => input.classList.remove(c));
    NORMAL_BORDER_CLASSES.forEach(c => input.classList.add(c));
  }
  if (errEl) {
    errEl.classList.remove('shown');
  }
}

function clearAllFieldErrors() {
  Object.keys(fieldErrorEls).forEach(clearFieldError);
}

// Step-specific dynamic fields
const signedInAsEl = document.getElementById('signedInAs');
const switchWarningEl = document.getElementById('switchWarning');
const switchTeamNameEl = document.getElementById('switchTeamName');

const processingStatusEl = document.getElementById('processingStatus');

const doneTeamNameEl = document.getElementById('doneTeamName');

document.addEventListener('DOMContentLoaded', async () => {
  bindHandlers();
  await initialize();
});

function getSearchParams() {
  try {
    return new URLSearchParams(window.location.search || '');
  } catch {
    return new URLSearchParams();
  }
}

function isValidStepId(stepId) {
  return STEP_ORDER.includes(stepId);
}

function isDevMockEnabled() {
  const params = getSearchParams();
  const wantsDev = params.get('dev') === '1';
  const wantsMock = params.get('mock') === '1';
  const isDev = !!api?.isDev;
  return isDev && wantsDev && wantsMock;
}

function buildMockInviteInfo({ teamId, teamName, inviterName, expiresAt } = {}) {
  return {
    success: true,
    teamId: teamId || 'dev-team-123',
    teamName: teamName || 'Unpak Dev Team',
    inviterName: inviterName || 'Dev Tester',
    inviterDepartment: 'Engineering',
    expiresAt: expiresAt || new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  };
}

function buildMockUserProfile({ email, fullName, role, teamId } = {}) {
  return {
    id: 'dev-user',
    email: email || 'dev.user@unpak.local',
    full_name: fullName || 'Dev User',
    role: role || 'employee',
    team_id: teamId || null,
  };
}

function bindHandlers() {
  // Clear field errors on typing
  const fieldInputMap = {
    firstName: firstNameInput,
    lastName: lastNameInput,
  };
  Object.entries(fieldInputMap).forEach(([fieldId, input]) => {
    input?.addEventListener('input', () => clearFieldError(fieldId));
  });

  toastErrorDismiss?.addEventListener('click', () => clearWizardError());

  welcomeContinueBtn?.addEventListener('click', () => {
    clearWizardError();

    if (state.userProfile?.id) {
      state.path = 'signedIn';
      // On macOS, show the accessibility step first (even for signed-in users)
      if (api.platform === 'darwin') {
        goToStep('accessibility');
      } else {
        goToStep('confirm');
      }
      return;
    }

    // Default path: signup wizard
    state.path = 'signup';
    if (api.platform === 'darwin') {
      goToStep('accessibility');
    } else {
      goToStep('oauth');
    }
  });

  accessibilityBackBtn?.addEventListener('click', () => goToStep('welcome'));
  accessibilityContinueBtn?.addEventListener('click', () => {
    clearWizardError();
    stopAccessibilityPollingIfAny();
    if (state.userProfile?.id) {
      goToStep('confirm');
    } else {
      goToStep('oauth');
    }
  });
  accessibilityGrantBtn?.addEventListener('click', async () => {
    clearWizardError();
    state.accessibilityGrantClickedAt = Date.now();
    try {
      await api.promptAccessibility?.();
    } catch (e) {
      // Ignore — the native dialog may have been dismissed
    }
    updateAccessibilityStatus();
  });
  accessibilitySkipBtn?.addEventListener('click', () => {
    stopAccessibilityPollingIfAny();
    if (state.userProfile?.id) {
      goToStep('confirm');
    } else {
      goToStep('oauth');
    }
  });

  nameBackBtn?.addEventListener('click', () => goToStep('oauth'));
  nameContinueBtn?.addEventListener('click', async () => {
    clearWizardError();
    const first = (firstNameInput?.value || '').trim();
    const last = (lastNameInput?.value || '').trim();
    let hasError = false;
    if (!first) { setFieldError('firstName', 'First name is required.'); hasError = true; }
    if (!last) { setFieldError('lastName', 'Last name is required.'); hasError = true; }
    if (hasError) return;

    // OAuth already completed; update the profile with the collected name.
    const fullName = `${first} ${last}`.trim();
    try {
      const result = await api.updateProfileName?.(fullName);
      if (result?.success && result?.profile) {
        state.userProfile = result.profile;
      } else {
        if (state.userProfile) state.userProfile.full_name = fullName;
      }
    } catch (e) {
      console.error('Failed to update profile name:', e);
      if (state.userProfile) state.userProfile.full_name = fullName;
    }

    goToStep('confirm');
  });

  oauthBackBtn?.addEventListener('click', () => goToStep(api.platform === 'darwin' ? 'accessibility' : 'welcome'));
  oauthCancelBtn?.addEventListener('click', async () => {
    await api.oauthCancel?.();
    clearWizardError();
    goToStep('oauth');
  });
  oauthGoogleBtn?.addEventListener('click', async () => {
    clearWizardError();
    await handleOAuth({ provider: 'google', providerLabel: 'Google', returnStep: 'oauth' });
  });
  oauthMicrosoftBtn?.addEventListener('click', async () => {
    clearWizardError();
    await handleOAuth({ provider: 'azure', providerLabel: 'Microsoft', returnStep: 'oauth' });
  });

  confirmBackBtn?.addEventListener('click', () => {
    clearWizardError();
    if (state.path === 'signedIn') return goToStep('welcome');
    if (state.needsName) return goToStep('name');
    return goToStep('oauth');
  });

  joinTeamBtn?.addEventListener('click', async () => {
    clearWizardError();

    // If we already joined this session, skip redeem.
    if (state.joinedTeam) {
      await safeClearPendingInvite();
      goToStep('extension');
      return;
    }

    await handleRedeemInviteOnly();
  });

  extensionBackBtn?.addEventListener('click', () => goToStep('confirm'));
  extensionContinueBtn?.addEventListener('click', () => goToStep('done'));

  // Listen for real-time browser connection events
  api.onBrowserConnected?.((data) => {
    if (state.currentStep === 'extension' && data?.browser) {
      updateBrowserCardStatus(data.browser, true);
      // Enable continue if any browser is connected
      if (extensionContinueBtn) {
        extensionContinueBtn.disabled = false;
        extensionContinueBtn.style.opacity = '1';
        extensionContinueBtn.style.pointerEvents = 'auto';
      }
    }
  });

  api.onBrowserDisconnected?.((data) => {
    if (state.currentStep === 'extension' && data?.browser) {
      updateBrowserCardStatus(data.browser, false);
      // Re-check if any browser is still connected
      updateExtensionConnectionStatus();
    }
  });

  openAppBtn?.addEventListener('click', async () => {
    await safeClearPendingInvite();
    openMainApp();
  });
}

async function initialize() {
  try {
    // Dev helper: open any onboarding screen without needing a real invite.
    if (isDevMockEnabled()) {
      state.devMock.enabled = true;
      const params = getSearchParams();

      const pathMode = (params.get('path') || 'signup').toLowerCase();
      const warnSwitch = params.get('warnSwitch') === '1';
      const autofill = params.get('autofill') !== '0';

      state.inviteToken = 'dev-mock';
      state.inviteInfo = buildMockInviteInfo();

      if (pathMode === 'signedin') {
        const userTeam = warnSwitch ? 'some-other-team' : state.inviteInfo.teamId;
        state.userProfile = buildMockUserProfile({ teamId: userTeam });
        state.path = 'signedIn';
      } else if (pathMode === 'signin' || pathMode === 'oauth') {
        state.userProfile = null;
        state.path = 'oauthOnly';
      } else {
        state.userProfile = null;
        state.path = 'signup';
      }

      hydrateInviteInfo();
      hydrateExtensionStep();
      showWizard();

      if (autofill) {
        if (firstNameInput && !firstNameInput.value) firstNameInput.value = 'Dev';
        if (lastNameInput && !lastNameInput.value) lastNameInput.value = 'Tester';
      }

      const desired = (params.get('step') || 'welcome').toLowerCase();
      const normalized = desired === 'signin' ? 'oauth' : desired;
      goToStep(isValidStepId(normalized) ? normalized : 'welcome');
      return;
    }

    // Get the pending invite token
    state.inviteToken = await api.getPendingInvite?.();

    if (!state.inviteToken) {
      showError('No Invite Found', 'Please use a valid invite link to access this page.');
      return;
    }

    // Re-store the token immediately so it remains available if invite lookup fails (retry/reload).
    await api.setPendingInvite?.(state.inviteToken);

    // Fetch invite information
    const infoResult = await api.getInviteInfo?.(state.inviteToken);

    if (!infoResult?.success) {
      if (infoResult?.expired) {
        showError('Invite Expired', 'This invite link has expired. Please ask your team admin for a new link.');
      } else {
        const status = infoResult?.status;
        const looksLikeInfraIssue = !status || status === 401 || status === 403 || status === 429 || status >= 500;
        if (looksLikeInfraIssue) {
          if (!status) {
            // No HTTP response at all — pure connectivity failure.
            // If the user is already signed in, offer a way back to the app.
            const profile = await api.getUserProfile?.();
            if (profile?.id) {
              showError('No Connection', "We couldn't reach the server. Check your connection and try the link again.", profile);
              return;
            }
          }
          showError('Something Went Wrong', infoResult?.error || 'We couldn\'t load the invite. Please try again.');
        } else {
          showError('Invalid Link', infoResult?.error || 'This invite link is no longer valid.');
        }
      }
      return;
    }

    state.inviteInfo = infoResult;

    // If already signed in, we allow joining/switching teams.
    state.userProfile = await api.getUserProfile?.();
    state.path = state.userProfile?.id ? 'signedIn' : 'signup';

    hydrateInviteInfo();
    hydrateExtensionStep();
    showWizard();
    goToStep('welcome');
  } catch (error) {
    console.error('Error loading invite:', error);
    const profile = await api.getUserProfile?.().catch(() => null);
    if (profile?.id) {
      showError('No Connection', "We couldn't reach the server. Check your connection and try the link again.", profile);
    } else {
      showError('Something Went Wrong', 'We couldn\'t load the invite. Please try again.');
    }
  }
}

function showWizard() {
  loadingState?.classList.add('hidden');
  errorState?.classList.add('hidden');
  welcomeState?.classList.remove('hidden');
}

function showError(title, message, returnProfile = null) {
  loadingState?.classList.add('hidden');
  welcomeState?.classList.add('hidden');
  errorState?.classList.remove('hidden');
  if (errorTitle) errorTitle.textContent = title;
  if (errorMessage) errorMessage.textContent = message;
  if (errorActionBtn) {
    const btnLabel = errorActionBtn.querySelector('span:first-child');
    if (returnProfile?.id) {
      if (btnLabel) btnLabel.textContent = 'Return to App';
      errorActionBtn.onclick = () => {
        const role = (returnProfile.role || '').toLowerCase();
        if (role === 'admin') api.navigateTo?.('adminDashboard');
        else if (role === 'manager') api.navigateTo?.('dashboard');
        else api.navigateTo?.('myUsage');
      };
    } else {
      if (btnLabel) btnLabel.textContent = 'Go to Sign In';
      errorActionBtn.onclick = goToLogin;
    }
  }
}

function hydrateInviteInfo() {
  if (!state.inviteInfo) return;

  const teamName = state.inviteInfo.teamName || 'their team';
  const inviterName = state.inviteInfo.inviterName || 'A team member';

  if (inviterNameEl) inviterNameEl.textContent = inviterName;
  if (teamNameEl) teamNameEl.textContent = teamName;
  if (teamNameInlineEl) teamNameInlineEl.textContent = teamName;
  if (doneTeamNameEl) doneTeamNameEl.textContent = teamName;

  // Populate all team pill instances across left panels
  document.querySelectorAll('.teamPillName').forEach(el => {
    el.textContent = teamName;
  });

  // Inviter avatar initials
  if (inviterAvatarEl) {
    const parts = inviterName.split(' ');
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : inviterName.substring(0, 2).toUpperCase();
    inviterAvatarEl.textContent = initials;
  }

  // Format expiration time
  if (expiresAtEl && state.inviteInfo.expiresAt) {
    const expiresDate = new Date(state.inviteInfo.expiresAt);
    const now = new Date();
    const hoursLeft = Math.round((expiresDate - now) / (1000 * 60 * 60));

    if (hoursLeft <= 1) {
      expiresAtEl.textContent = 'in less than an hour';
    } else if (hoursLeft < 24) {
      expiresAtEl.textContent = `in ${hoursLeft} hours`;
    } else {
      const daysLeft = Math.round(hoursLeft / 24);
      expiresAtEl.textContent = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
    }
  }
}

function hydrateExtensionStep() {
  if (!browserCardsContainer) return;
  const browsers = window.UnpakConstants?.SUPPORTED_BROWSERS || [];
  browserCardsContainer.innerHTML = '';

  browsers.forEach((browser) => {
    const card = document.createElement('div');
    card.id = `browser-card-${browser.id}`;
    card.className = 'p-4 rounded-xl border border-gray-200 bg-background';

    const hasStore = !!browser.storeUrl;

    card.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 flex items-center justify-center shrink-0">${browser.icon || ''}</div>
          <div>
            <div class="text-sm font-medium text-text-primary">${browser.name}</div>
            <button class="browser-install-btn text-xs text-primary hover:text-primary-hover font-medium mt-0.5 ${hasStore ? '' : 'opacity-50 cursor-default'}"
                    data-browser-id="${browser.id}" data-store-url="${browser.storeUrl || ''}"
                    ${hasStore ? '' : 'disabled'}>
              ${hasStore ? `Install from ${browser.storeName}` : `Coming soon to ${browser.storeName}`}
              ${hasStore ? '<span class="material-icons-outlined text-xs align-middle ml-0.5">open_in_new</span>' : ''}
            </button>
          </div>
        </div>
        <span id="browser-status-${browser.id}"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold shrink-0">
          <span class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
          Searching...
        </span>
      </div>
    `;

    browserCardsContainer.appendChild(card);
  });

  // Wire up install button click handlers
  browserCardsContainer.querySelectorAll('.browser-install-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const browserId = btn.dataset.browserId;
      const storeUrl = btn.dataset.storeUrl;
      if (!storeUrl) return;
      clearWizardError();

      try {
        const result = await api.openUrlInBrowser?.(browserId, storeUrl);
        if (result?.fallback) {
          const browserName = browsers.find(b => b.id === browserId)?.name || browserId;
          setWizardError(`Could not open ${browserName}. Please make sure it is installed and try again.`);
        }
      } catch (error) {
        console.error('Failed to open store link:', error);
        setWizardError('Could not open the browser. Please make sure it is installed and try again.');
      }
    });
  });
}

function getFlowSteps() {
  // Interactive steps (exclude "processing")
  const isMac = api.platform === 'darwin';
  if (state.needsName) {
    return isMac
      ? ['welcome', 'accessibility', 'oauth', 'name', 'confirm', 'extension', 'done']
      : ['welcome', 'oauth', 'name', 'confirm', 'extension', 'done'];
  }
  if (state.path === 'signedIn') {
    return isMac
      ? ['welcome', 'accessibility', 'confirm', 'extension', 'done']
      : ['welcome', 'confirm', 'extension', 'done'];
  }
  return isMac
    ? ['welcome', 'accessibility', 'oauth', 'confirm', 'extension', 'done']
    : ['welcome', 'oauth', 'confirm', 'extension', 'done'];
}

const TRANSITION_CLASSES = ['step-visible', 'step-fade-out', 'step-fade-out-back', 'step-fade-in-ready', 'step-fade-in-ready-back'];

function clearTransitionClasses(el) {
  el.classList.remove(...TRANSITION_CLASSES);
}

function getStepDirection(fromStep, toStep) {
  const fromIdx = STEP_ORDER.indexOf(fromStep);
  const toIdx = STEP_ORDER.indexOf(toStep);
  if (fromIdx === -1 || toIdx === -1) return 'forward';
  return toIdx >= fromIdx ? 'forward' : 'back';
}

function getPanelsForStep(stepId) {
  return stepEls.filter(el => el.getAttribute('data-step') === stepId);
}

function runStepHydration(stepId) {
  if (stepId === 'accessibility') {
    state.accessibilityStepEnteredAt = Date.now();
    state.accessibilityGrantClickedAt = null;
    if (accessibilityEscapeHatch) accessibilityEscapeHatch.classList.add('hidden');
    updateAccessibilityStatus();
    startAccessibilityPolling();
    // Also trigger the native macOS permission prompt automatically
    api.promptAccessibility?.().catch(() => { });
  }
  if (stepId === 'confirm') {
    hydrateConfirmStep();
  }
  if (stepId === 'extension') {
    if (extensionBackBtn) {
      extensionBackBtn.classList.toggle('hidden', state.path === 'signup');
    }
    updateExtensionConnectionStatus();
    startExtensionPolling();
  }
  if (stepId === 'processing') {
    if (state.processingContext === 'oauth') {
      oauthCancelHint?.classList.remove('hidden');
    } else {
      oauthCancelHint?.classList.add('hidden');
    }
  }
}

function showStepImmediate(stepId) {
  // Used for first load — no animation.
  stepEls.forEach(el => {
    clearTransitionClasses(el);
    const elStep = el.getAttribute('data-step');
    if (elStep === stepId) {
      el.classList.remove('hidden');
      el.classList.add('step-visible');
    } else {
      el.classList.add('hidden');
    }
  });

  if (stepId !== 'processing') {
    state.lastInteractiveStep = stepId;
  }
  state.currentStep = stepId;

  runStepHydration(stepId);
  updateProgress();
}

function goToStep(stepId) {
  stopExtensionPollingIfAny();
  stopAccessibilityPollingIfAny();
  clearWizardError();
  clearAllFieldErrors();

  // First load: no outgoing step, show immediately.
  if (!state.currentStep) {
    showStepImmediate(stepId);
    return;
  }

  // Debounce: if already transitioning, queue latest step (last one wins).
  if (state.isTransitioning) {
    state.pendingStep = stepId;
    return;
  }

  const fromStep = state.currentStep;
  if (fromStep === stepId) return;

  // Reset processing context when leaving the processing step.
  if (fromStep === 'processing') {
    state.processingContext = null;
  }

  state.isTransitioning = true;
  state.pendingStep = null;

  const direction = getStepDirection(fromStep, stepId);
  const fadeOutClass = direction === 'forward' ? 'step-fade-out' : 'step-fade-out-back';
  const fadeInReadyClass = direction === 'forward' ? 'step-fade-in-ready' : 'step-fade-in-ready-back';

  // Update state
  if (stepId !== 'processing') {
    state.lastInteractiveStep = stepId;
  }
  state.currentStep = stepId;

  // Update progress bar immediately (CSS transition handles smooth animation).
  updateProgress();

  // Lock the current height so it doesn't jump when panels swap
  if (welcomeState) {
    welcomeState.style.height = welcomeState.offsetHeight + 'px';
  }

  // Phase 1: Fade out old panels (250ms)
  const oldPanels = getPanelsForStep(fromStep);
  oldPanels.forEach(el => {
    clearTransitionClasses(el);
    el.classList.add(fadeOutClass);
  });

  setTimeout(() => {
    // Phase 2: Hide old panels, prepare new panels
    oldPanels.forEach(el => {
      el.classList.add('hidden');
      clearTransitionClasses(el);
    });

    // Hydrate content before it becomes visible
    runStepHydration(stepId);

    const newPanels = getPanelsForStep(stepId);
    newPanels.forEach(el => {
      el.classList.remove('hidden');
      clearTransitionClasses(el);
      el.classList.add(fadeInReadyClass);
    });

    // Measure the natural height of the new step, then animate to it
    if (welcomeState) {
      const fromHeight = welcomeState.style.height;
      welcomeState.style.height = 'auto';
      const targetHeight = welcomeState.offsetHeight;
      welcomeState.style.height = fromHeight;
      void welcomeState.offsetHeight; // force reflow so transition triggers
      welcomeState.style.height = targetHeight + 'px';
    }

    // Force reflow so browser registers the starting position
    void document.body.offsetHeight;

    // Phase 3: Fade in new panels (250ms)
    newPanels.forEach(el => {
      el.classList.remove(fadeInReadyClass);
      el.classList.add('step-visible');
    });

    setTimeout(() => {
      // Cleanup
      newPanels.forEach(el => clearTransitionClasses(el));
      if (welcomeState) welcomeState.style.height = '';
      state.isTransitioning = false;

      // Process queued step if any
      if (state.pendingStep) {
        const next = state.pendingStep;
        state.pendingStep = null;
        goToStep(next);
      }
    }, 250);
  }, 250);
}

function updateProgress() {
  const steps = getFlowSteps();
  let stepForProgress = state.currentStep === 'processing'
    ? state.lastInteractiveStep
    : state.currentStep;

  const rawIdx = steps.indexOf(stepForProgress);
  const current = rawIdx === -1 ? 1 : rawIdx + 1;
  const total = steps.length;
  const pct = Math.round((current / total) * 100);

  if (persistentStepLabel) {
    persistentStepLabel.textContent = `Step ${current} of ${total}`;
  }
  if (persistentProgressBar) {
    persistentProgressBar.style.width = `${pct}%`;
  }
}

function hydrateConfirmStep() {
  // Signed-in account display
  const name = state.userProfile?.full_name || state.userProfile?.fullName;
  const email = (typeof window.formatEmailForDisplay === 'function')
    ? window.formatEmailForDisplay(state.userProfile?.email, '')
    : state.userProfile?.email;
  const displayText = name && email ? `${name} (${email})` : (email || name || 'your account');
  if (signedInAsEl) signedInAsEl.textContent = displayText;
  if (signedInAsLeftEl) signedInAsLeftEl.textContent = displayText;

  // Team switch warning (only if user has a team already and it's different)
  const shouldWarn =
    !!state.userProfile?.team_id &&
    !!state.inviteInfo?.teamId &&
    state.userProfile.team_id !== state.inviteInfo.teamId;

  if (switchWarningEl) switchWarningEl.classList.toggle('hidden', !shouldWarn);
  if (switchTeamNameEl) switchTeamNameEl.textContent = state.inviteInfo?.teamName || 'this team';

  // Primary CTA copy changes if we're already on the target team or already joined
  if (joinTeamBtn) {
    const labelSpan = joinTeamBtn.querySelector('span');
    if (labelSpan) {
      if (state.joinedTeam || isAlreadyOnTargetTeam()) {
        labelSpan.textContent = 'Continue';
      } else {
        labelSpan.textContent = 'Join team';
      }
    }
  }

}

function isAlreadyOnTargetTeam() {
  if (!state.userProfile?.team_id) return false;
  if (!state.inviteInfo?.teamId) return false;
  return state.userProfile.team_id === state.inviteInfo.teamId;
}

let _toastAutoDismiss = null;

function setWizardError(message) {
  if (!toastError || !toastErrorMessage) return;
  toastErrorMessage.textContent = message;
  // Clear any pending auto-dismiss
  if (_toastAutoDismiss) { clearTimeout(_toastAutoDismiss); _toastAutoDismiss = null; }
  // Force reflow so re-triggering works if already visible
  toastError.classList.remove('toast-visible');
  void toastError.offsetHeight;
  toastError.classList.add('toast-visible');
  // Auto-dismiss after 6 seconds
  _toastAutoDismiss = setTimeout(clearWizardError, 6000);
}

function clearWizardError() {
  if (_toastAutoDismiss) { clearTimeout(_toastAutoDismiss); _toastAutoDismiss = null; }
  toastError?.classList.remove('toast-visible');
}

function setProcessingStatus(message) {
  if (processingStatusEl) processingStatusEl.textContent = message;
}

function getDesiredFullName() {
  const first = (firstNameInput?.value || '').trim();
  const last = (lastNameInput?.value || '').trim();
  const fullName = `${first} ${last}`.trim();
  return fullName || null;
}

async function handleOAuth({ provider, providerLabel, returnStep = 'oauth' } = {}) {
  if (state.devMock?.enabled) {
    goToStep('processing');
    setProcessingStatus(`Signing in with ${providerLabel} (mock)...`);
    await sleep(250);
    const mockName = getDesiredFullName() || 'Dev User';
    state.userProfile = buildMockUserProfile({
      fullName: mockName,
      email: 'dev.user@unpak.local',
      role: 'employee',
      teamId: null,
    });

    const hasName = !!(state.userProfile?.full_name);
    if (!hasName) {
      state.needsName = true;
      goToStep('name');
    } else {
      state.needsName = false;
      goToStep('confirm');
    }
    return;
  }

  // Name is no longer collected before OAuth; the provider's metadata is used instead.
  // If the provider doesn't supply a name, the user is prompted afterward.
  const fullName = getDesiredFullName();

  // Optimistically show a processing state while the browser flow completes.
  state.processingContext = 'oauth';
  goToStep('processing');
  setProcessingStatus(`Continue in your browser to sign in with ${providerLabel}...`);

  try {
    const oauthResult = await api.oauthSignIn?.({
      provider,
      fullName,
      department: state.inviteInfo?.inviterDepartment || undefined,
      skipNavigation: true,
      inviteToken: state.inviteToken || undefined,
    });

    if (oauthResult?.cancelled) {
      goToStep(returnStep);
      return;
    }

    if (!oauthResult?.success) {
      goToStep(returnStep);
      setWizardError(oauthResult?.error || `${providerLabel} sign-in failed. Please try again.`);
      return;
    }

    state.userProfile = oauthResult.profile || await api.getUserProfile?.();

    // If the OAuth provider didn't supply a name, ask the user before confirming.
    const hasName = !!(state.userProfile?.full_name || state.userProfile?.fullName);
    if (!hasName) {
      state.needsName = true;
      goToStep('name');
    } else {
      state.needsName = false;
      goToStep('confirm');
    }
  } catch (error) {
    console.error(`Error during ${providerLabel} OAuth:`, error);
    goToStep(returnStep);
    setWizardError(`${providerLabel} sign-in failed. Please try again.`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleRedeemInviteOnly() {
  if (state.devMock?.enabled) {
    state.processingContext = 'teamJoin';
    goToStep('processing');
    setProcessingStatus('Joining your team (mock)...');
    await sleep(250);
    state.joinedTeam = { id: state.inviteInfo?.teamId, name: state.inviteInfo?.teamName };
    if (state.userProfile) {
      state.userProfile.team_id = state.inviteInfo?.teamId || state.userProfile.team_id;
    }
    await safeClearPendingInvite();
    goToStep('extension');
    return;
  }

  state.processingContext = 'teamJoin';
  goToStep('processing');
  setProcessingStatus('Joining your team...');
  const joined = await redeemInviteWithHandling();
  if (joined) {
    goToStep('extension');
  }
}

async function redeemInviteWithHandling() {
  if (state.devMock?.enabled) {
    state.joinedTeam = { id: state.inviteInfo?.teamId, name: state.inviteInfo?.teamName };
    if (state.userProfile) {
      state.userProfile.team_id = state.inviteInfo?.teamId || state.userProfile.team_id;
    }
    await safeClearPendingInvite();
    return true;
  }

  try {
    const result = await api.redeemInvite?.(state.inviteToken);

    if (result?.success) {
      state.joinedTeam = result.team || result.data?.team;
      await safeClearPendingInvite();
      // Keep userProfile up-to-date (main process mutates team_id on redeem).
      state.userProfile = await api.getUserProfile?.() || state.userProfile;
      return true;
    }

    // Already on team: treat as non-fatal and move forward.
    if (result?.status === 409) {
      // Force a profile refresh to catch any background role upgrades
      // (e.g. employee -> manager upgrade happened but 409 was returned because they were already in the team)
      try {
        const refreshedProfile = await api.refreshUserProfile?.();
        if (refreshedProfile) {
          state.userProfile = refreshedProfile;
          console.log('Refreshed profile after 409:', state.userProfile.role);
        }
      } catch (e) {
        console.error('Failed to refresh profile after 409:', e);
      }

      await safeClearPendingInvite();
      // Only fetch if refresh failed or didn't happen
      if (!state.userProfile?.role) {
        state.userProfile = await api.getUserProfile?.() || state.userProfile;
      }
      state.joinedTeam = { id: state.inviteInfo?.teamId, name: state.inviteInfo?.teamName };
      goToStep('extension');
      return true;
    }

    // Auth required: send them to sign in.
    if (result?.requiresAuth) {
      // User needs to authenticate.
      state.path = 'oauthOnly';
      goToStep('oauth');
      setWizardError('Please sign in with Google or Microsoft to join this team.');
      return false;
    }

    if (result?.status === 410) {
      showError('Invite Expired', 'This invite link has expired. Please ask your team admin for a new link.');
      return false;
    }

    goToStep('confirm');
    setWizardError(result?.error || 'Failed to join team. Please try again.');
    return false;
  } catch (error) {
    console.error('Error redeeming invite:', error);
    goToStep('confirm');
    setWizardError('Something went wrong while joining the team. Please try again.');
    return false;
  }
}

async function updateExtensionConnectionStatus() {
  let browserStatuses = {};
  try {
    browserStatuses = await api.getConnectedBrowsers?.() || {};
  } catch (e) {
    browserStatuses = {};
  }

  let anyConnected = false;

  const browsers = window.UnpakConstants?.SUPPORTED_BROWSERS || [];
  browsers.forEach((browser) => {
    const connected = !!browserStatuses[browser.id];
    if (connected) anyConnected = true;
    updateBrowserCardStatus(browser.id, connected);
  });

  if (extensionContinueBtn) {
    extensionContinueBtn.disabled = !anyConnected;
    extensionContinueBtn.style.opacity = anyConnected ? '1' : '0.5';
    extensionContinueBtn.style.pointerEvents = anyConnected ? 'auto' : 'none';
  }
}

function updateBrowserCardStatus(browserId, connected) {
  const badge = document.getElementById(`browser-status-${browserId}`);
  if (!badge) return;

  if (connected) {
    badge.className =
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold shrink-0';
    badge.innerHTML = `
      <span class="relative flex h-2.5 w-2.5 mr-1.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      Connected
    `;
  } else {
    badge.className =
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold shrink-0';
    badge.innerHTML = '<span class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>Searching...';
  }
}

function startExtensionPolling() {
  stopExtensionPollingIfAny();
  // Use a slower poll as fallback; events handle real-time updates
  state.extensionPoller = setInterval(() => {
    updateExtensionConnectionStatus();
  }, 3000);
}

function stopExtensionPollingIfAny() {
  if (state.extensionPoller) {
    clearInterval(state.extensionPoller);
    state.extensionPoller = null;
  }
}

async function updateAccessibilityStatus() {
  if (!accessibilityStatusBadge) return;

  let granted = false;
  try {
    granted = await api.checkAccessibility?.();
  } catch (e) {
    granted = false;
  }

  state.accessibilityGranted = granted;
  state.accessibilityFirstCheckDone = true;

  if (granted) {
    accessibilityStatusBadge.className =
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold';
    accessibilityStatusBadge.innerHTML = `
      <span class="relative flex h-2.5 w-2.5 mr-1.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      Permission Granted
    `;
    if (accessibilityGrantBtn) accessibilityGrantBtn.classList.add('hidden');
    if (accessibilityEscapeHatch) accessibilityEscapeHatch.classList.add('hidden');
    if (accessibilityContinueBtn) {
      accessibilityContinueBtn.disabled = false;
      accessibilityContinueBtn.style.opacity = '1';
      accessibilityContinueBtn.style.pointerEvents = 'auto';
    }
  } else {
    // Show "Not granted" after first check completes instead of perpetual "Checking..."
    if (state.accessibilityFirstCheckDone) {
      accessibilityStatusBadge.className =
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold';
      accessibilityStatusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-red-500"></span>Not granted';
    } else {
      accessibilityStatusBadge.className =
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold';
      accessibilityStatusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>Checking...';
    }
    if (accessibilityGrantBtn) accessibilityGrantBtn.classList.remove('hidden');
    if (accessibilityContinueBtn) {
      accessibilityContinueBtn.disabled = true;
      accessibilityContinueBtn.style.opacity = '0.5';
      accessibilityContinueBtn.style.pointerEvents = 'none';
    }
    showEscapeHatchIfNeeded();
  }
}

function startAccessibilityPolling() {
  stopAccessibilityPollingIfAny();
  state.accessibilityPoller = setInterval(() => {
    updateAccessibilityStatus();
  }, 1000);
}

function stopAccessibilityPollingIfAny() {
  if (state.accessibilityPoller) {
    clearInterval(state.accessibilityPoller);
    state.accessibilityPoller = null;
  }
}

function showEscapeHatchIfNeeded() {
  if (!accessibilityEscapeHatch) return;
  if (state.accessibilityGranted) return;

  const now = Date.now();
  const stepAge = state.accessibilityStepEnteredAt ? now - state.accessibilityStepEnteredAt : 0;
  const grantAge = state.accessibilityGrantClickedAt ? now - state.accessibilityGrantClickedAt : 0;

  if (stepAge >= 10000 || grantAge >= 5000) {
    accessibilityEscapeHatch.classList.remove('hidden');
  }
}

async function safeClearPendingInvite() {
  try {
    await api.clearPendingInvite?.();
  } catch (e) {
    // Ignore
  }
}

function openMainApp() {
  const role = (state.userProfile?.role || '').toLowerCase();
  if (role === 'admin') {
    api.navigateTo?.('adminDashboard');
  } else if (role === 'manager') {
    api.navigateTo?.('dashboard');
  } else {
    api.navigateTo?.('myUsage');
  }
}

// Error state CTA
function goToLogin() {
  api.navigateTo?.('login');
}

// Expose for inline onclick in error state HTML.
window.goToLogin = goToLogin;
