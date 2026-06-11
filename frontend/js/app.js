/* ================================================================
   METTLESTATE × EA FC MOBILE — app.js v2
   Application bootstrap · auth guard · render orchestration
================================================================ */

// ── Auth guard — runs before anything else ────────────────────
(async function authGuard() {
  if (window.location.pathname.includes('login')) return;
  if (!API.isAuthenticated()) {
    window.location.replace('/login.html');
    return;
  }
  const user = await API.fetchCurrentUser();
  if (!user) {
    window.location.replace('/login.html');
    return;
  }
  window._currentUser = user;
  applyUserUI(user);
})();

function applyUserUI(user) {
  const nameEl = document.getElementById('current-user-name');
  const roleEl = document.getElementById('current-user-role');
  if (nameEl) nameEl.textContent = user.display_name || user.username;
  if (roleEl) {
    roleEl.textContent = user.role.toUpperCase();
    roleEl.className = `user-role-badge role-${user.role}`;
  }
  // Hide owner-only sections for non-owners
  if (user.role !== 'owner') {
    document.querySelectorAll('.owner-only').forEach(el => el.style.display = 'none');
  }
}

// ── Theme ─────────────────────────────────────────────────────
function initTheme() {
  const saved = Storage.loadTheme ? Storage.loadTheme() : localStorage.getItem('eafc_theme');
  if (saved && typeof applyTheme === 'function') applyTheme(saved);
}

// ── Navigation ────────────────────────────────────────────────
let _activeTab = 'standings';

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById(`${tabId}-tab`);
  const nav = document.querySelector(`[data-tab="${tabId}"]`);
  if (tab) tab.classList.add('active');
  if (nav) nav.classList.add('active');
  _activeTab = tabId;

  if (tabId === 'admin') initAdmin();
  if (tabId === 'fixtures') renderFixtures();
  if (tabId === 'results')  renderResults();
  if (tabId === 'players')  renderPlayerManagement();
  if (tabId === 'standings') renderStandings();
}

// ── Render all views ──────────────────────────────────────────
function renderAll() {
  renderLeaderboard?.();
  renderFixtures?.();
  renderResults?.();
  renderPlayerManagement?.();
  updatePlayerDatalist?.();
  updateScoreSelect?.();
  renderCalendar?.();
}

// ── App boot ──────────────────────────────────────────────────
async function initApp() {
  // Guard: don't init if not authenticated yet
  if (!API.isAuthenticated()) return;

  // Show loading state
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';

  const ok = await API.loadAll();

  if (loadingOverlay) loadingOverlay.style.display = 'none';

  if (!ok) {
    toast('Failed to load league data. Please refresh.', 'error', 6000);
    return;
  }

  renderAll();
  initTheme();
  showTab('standings');

  // Show connected indicator
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = '● Connected';
    statusEl.style.color = 'var(--success)';
  }
}

// ── Logout ────────────────────────────────────────────────────
function logout() {
  if (!confirm('Log out of the league admin panel?')) return;
  API.logout();
}

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  }
});

// ── Init on DOMContentLoaded ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('login')) return;
  initApp();
});
