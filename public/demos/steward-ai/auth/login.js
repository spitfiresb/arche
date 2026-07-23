const api = window.electronAPI;

const googleBtn = document.getElementById('googleSignInBtn');
const microsoftBtn = document.getElementById('microsoftSignInBtn');
const errorMsg = document.getElementById('errorMsg');
const oauthRetryHint = document.getElementById('oauthRetryHint');
const oauthCancelBtn = document.getElementById('oauthCancelBtn');

let isLoading = false;

async function cancelAndReset() {
    try { await api.oauthCancel?.(); } catch { /* already cleared */ }
    setLoading(false);
    clearError();
}

function showError(msg, errorCode) {
    // Special-case: surface a "Restart sign-in" action when a stale OAuth flow is still pending.
    if (errorCode === 'OAUTH_IN_PROGRESS') {
        errorMsg.textContent = msg + ' ';
        const restartBtn = document.createElement('button');
        restartBtn.id = 'restart-signin-btn';
        restartBtn.type = 'button';
        restartBtn.style.marginLeft = '0.5rem';
        restartBtn.style.textDecoration = 'underline';
        restartBtn.textContent = 'Restart sign-in';
        restartBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cancelAndReset();
        });
        errorMsg.appendChild(restartBtn);
    } else {
        errorMsg.textContent = msg;
    }
    errorMsg.classList.remove('hidden');
}

function showConsentError(msg, url) {
    errorMsg.innerHTML = `${msg} <a href="#" id="consent-link" style="color:inherit;text-decoration:underline;white-space:nowrap;">Send this link to your IT admin →</a>`;
    document.getElementById('consent-link').addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternal(url);
    });
    errorMsg.classList.remove('hidden');
}

function clearError() {
    errorMsg.classList.add('hidden');
}

function setLoading(loading, activeBtn) {
    isLoading = loading;
    googleBtn.disabled = loading;
    microsoftBtn.disabled = loading;
    googleBtn.style.opacity = loading ? '0.6' : '1';
    microsoftBtn.style.opacity = loading ? '0.6' : '1';
    googleBtn.style.pointerEvents = loading ? 'none' : 'auto';
    microsoftBtn.style.pointerEvents = loading ? 'none' : 'auto';

    // Show spinner text on the active button
    if (loading && activeBtn) {
        const label = activeBtn.querySelector('span:last-child');
        if (label) label.textContent = 'Signing in...';
    } else {
        const googleLabel = googleBtn.querySelector('span:last-child');
        const microsoftLabel = microsoftBtn.querySelector('span:last-child');
        if (googleLabel) googleLabel.textContent = 'Sign in with Google';
        if (microsoftLabel) microsoftLabel.textContent = 'Sign in with Microsoft';
    }

    oauthRetryHint.classList.toggle('hidden', !loading);
}

async function handleOAuth(provider, providerLabel, btn) {
    if (isLoading) return;
    clearError();
    setLoading(true, btn);

    try {
        const result = await api.oauthSignIn({ provider, skipNavigation: false });
        if (result?.cancelled) {
            setLoading(false);
            clearError();
            return;
        }
        if (!result?.success) {
            if (result?.consentUrl) {
                showConsentError(result.error || `${providerLabel} sign-in failed.`, result.consentUrl);
            } else {
                showError(result?.error || `${providerLabel} sign-in failed. Please try again.`, result?.errorCode);
            }
            setLoading(false);
        }
        // On success, the main process handles navigation — no action needed here.
    } catch (err) {
        showError(`${providerLabel} sign-in failed. Please try again.`);
        setLoading(false);
    }
}

oauthCancelBtn.addEventListener('click', () => cancelAndReset());

googleBtn.addEventListener('click', () => {
    handleOAuth('google', 'Google', googleBtn);
});

microsoftBtn.addEventListener('click', () => {
    handleOAuth('azure', 'Microsoft', microsoftBtn);
});

// --- Invite Link Paste Fallback ---

const toggleInviteInput = document.getElementById('toggleInviteInput');
const inviteInputContainer = document.getElementById('inviteInputContainer');
const inviteLinkInput = document.getElementById('inviteLinkInput');
const inviteContinueBtn = document.getElementById('inviteContinueBtn');
const inviteError = document.getElementById('inviteError');

function extractTokenFromInput(text) {
    if (!text) return null;
    const trimmed = text.trim();
    try {
        const url = new URL(trimmed);
        const tokenParam = url.searchParams.get('token');
        if (tokenParam && /^[a-f0-9]{64}$/i.test(tokenParam)) return tokenParam;
    } catch {}
    const match = trimmed.match(/[a-f0-9]{64}/i);
    return match ? match[0] : null;
}

function showInviteError(msg) {
    inviteError.textContent = msg;
    inviteError.classList.remove('hidden');
}

function clearInviteError() {
    inviteError.classList.add('hidden');
}

let inviteSubmitting = false;

async function handlePasteInvite() {
    if (inviteSubmitting) return;
    clearInviteError();
    const token = extractTokenFromInput(inviteLinkInput.value);
    if (!token) {
        showInviteError('Please paste a valid invite link');
        return;
    }
    inviteSubmitting = true;
    inviteContinueBtn.disabled = true;
    inviteContinueBtn.textContent = 'Continuing...';
    try {
        await api.setPendingInvite(token);
        api.navigateTo('inviteWelcome');
    } catch (err) {
        showInviteError('Something went wrong. Please try again.');
    } finally {
        inviteSubmitting = false;
        inviteContinueBtn.disabled = false;
        inviteContinueBtn.textContent = 'Continue';
    }
}

toggleInviteInput.addEventListener('click', () => {
    const isOpen = inviteInputContainer.classList.toggle('open');
    if (isOpen) inviteLinkInput.focus();
});

inviteContinueBtn.addEventListener('click', handlePasteInvite);

inviteLinkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePasteInvite();
});
