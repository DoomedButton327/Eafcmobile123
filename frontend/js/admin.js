/* ================================================================
   METTLESTATE × EA FC MOBILE — admin.js v2
   Admin panel: settings · users · audit log · danger zone
================================================================ */

// ── Init admin tab ────────────────────────────────────────────
async function initAdmin() {
  await loadSettingsIntoUI();
  if (API.getUser()?.role === 'owner') {
    loadUserManagement();
  }
  loadAuditLog();
}

// ── Settings ──────────────────────────────────────────────────
async function loadSettingsIntoUI() {
  const settings = await API.loadSettings();
  if (!settings) return;

  // Webhook
  if (settings.discord_webhook) {
    window._discordWebhookFromServer = settings.discord_webhook;
    const input = document.getElementById('discord-webhook-input');
    if (input) input.value = settings.discord_webhook;
  }

  // Gemini key (show masked)
  if (settings.gemini_key) {
    const input = document.getElementById('gemini-key-input');
    if (input) input.placeholder = '●●●● Saved ●●●●';
  }

  // Season label
  if (settings.season_label) {
    const input = document.getElementById('season-label-input');
    if (input) input.value = settings.season_label;
  }
}

async function saveDiscordWebhook() {
  const input = document.getElementById('discord-webhook-input');
  const url   = input?.value?.trim() || '';
  if (url && !url.startsWith('https://discord.com/api/webhooks/')) {
    toast('Invalid Discord webhook URL.', 'error'); return;
  }
  const result = await API.saveSetting('discord_webhook', url);
  if (!result) return;
  window._discordWebhookFromServer = url;
  toast(url ? 'Webhook saved!' : 'Webhook cleared.', 'success');
}

async function saveAndTestWebhook() {
  await saveDiscordWebhook();
  const url = document.getElementById('discord-webhook-input')?.value?.trim();
  if (url) await testDiscordWebhook(url);
}

async function saveGeminiKey() {
  const input = document.getElementById('gemini-key-input');
  const key   = input?.value?.trim() || '';
  if (!key) { toast('Enter a Gemini API key.', 'error'); return; }
  const result = await API.saveSetting('gemini_key', key);
  if (!result) return;
  if (input) { input.value = ''; input.placeholder = '●●●● Saved ●●●●'; }
  toast('Gemini key saved!', 'success');
}

async function saveSeasonLabel() {
  const input = document.getElementById('season-label-input');
  const label = input?.value?.trim() || '';
  const result = await API.saveSetting('season_label', label);
  if (!result) return;
  toast('Season label updated!', 'success');
}

// ── Change own password ───────────────────────────────────────
async function changeOwnPassword() {
  const cur = document.getElementById('change-pwd-current')?.value;
  const n1  = document.getElementById('change-pwd-new')?.value;
  const n2  = document.getElementById('change-pwd-confirm')?.value;
  if (!cur || !n1) { toast('Fill in current and new password.', 'error'); return; }
  if (n1 !== n2)   { toast('New passwords do not match.', 'error'); return; }
  if (n1.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
  const result = await API.changePassword(cur, n1);
  if (!result) return;
  toast('Password changed! You will need to log in again.', 'success');
  document.getElementById('change-pwd-current').value = '';
  document.getElementById('change-pwd-new').value = '';
  document.getElementById('change-pwd-confirm').value = '';
  setTimeout(() => API.logout(), 2000);
}

// ── User Management (owner only) ──────────────────────────────
async function loadUserManagement() {
  const section = document.getElementById('user-management-section');
  if (!section) return;
  section.style.display = 'block';

  const users = await API.getUsers();
  if (!users) return;

  renderUserList(users);
}

function renderUserList(users) {
  const container = document.getElementById('user-list');
  if (!container) return;

  if (!users.length) {
    container.innerHTML = `<div class="empty-state">No staff accounts.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const lastLogin = u.last_login
      ? new Date(u.last_login).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
      : 'Never';
    const isOwner = u.role === 'owner';
    const isSelf  = u.id === API.getUser()?.id;

    return `
      <div class="user-row ${!u.is_active ? 'user-inactive' : ''}">
        <div class="user-row-avatar">${(u.display_name || u.username).charAt(0).toUpperCase()}</div>
        <div class="user-row-info">
          <div class="user-row-name">${esc(u.display_name || u.username)} ${isSelf ? '<span class="you-badge">YOU</span>' : ''}</div>
          <div class="user-row-meta">
            @${esc(u.username)} · 
            <span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span>
            ${!u.is_active ? ' · <span style="color:var(--muted)">Inactive</span>' : ''}
          </div>
          <div class="user-row-login">Last login: ${lastLogin}</div>
          ${u.created_by_name ? `<div class="user-row-login" style="opacity:.5">Added by: ${esc(u.created_by_name)}</div>` : ''}
        </div>
        <div class="user-row-actions">
          ${!isSelf ? `
            <button class="btn-sm btn-outline" onclick="promptResetPassword(${u.id}, '${esc(u.username)}')">
              Reset PW
            </button>
            ${u.is_active
              ? `<button class="btn-sm btn-danger" onclick="deactivateUser(${u.id}, '${esc(u.display_name || u.username)}')">Remove</button>`
              : `<button class="btn-sm btn-success" onclick="reactivateUser(${u.id})">Restore</button>`
            }
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

async function addStaffMember() {
  const username     = document.getElementById('new-user-username')?.value?.trim();
  const displayName  = document.getElementById('new-user-display')?.value?.trim();
  const password     = document.getElementById('new-user-password')?.value;
  const role         = document.getElementById('new-user-role')?.value || 'admin';

  if (!username || !password) { toast('Username and password are required.', 'error'); return; }
  if (password.length < 6)    { toast('Password must be at least 6 characters.', 'error'); return; }

  const users = await API.addUser(username, displayName || username, password, role);
  if (!users) return;

  renderUserList(users);
  document.getElementById('new-user-username').value = '';
  document.getElementById('new-user-display').value  = '';
  document.getElementById('new-user-password').value = '';
  toast(`@${username} added as ${role}!`, 'success');
}

async function deactivateUser(userId, displayName) {
  if (!confirm(`Remove ${displayName} from the staff team? They will no longer be able to log in.`)) return;
  const users = await API.deactivateUser(userId);
  if (!users) return;
  renderUserList(users);
  toast(`${displayName} removed.`, 'info');
}

async function reactivateUser(userId) {
  const users = await API.reactivateUser(userId);
  if (!users) return;
  renderUserList(users);
  toast('Account restored.', 'success');
}

async function promptResetPassword(userId, username) {
  const newPw = prompt(`Set a new password for @${username} (min 6 characters):`);
  if (!newPw) return;
  if (newPw.length < 6) { toast('Password too short.', 'error'); return; }
  const result = await API.resetUserPassword(userId, newPw);
  if (!result) return;
  toast(`Password reset for @${username}.`, 'success');
}

// ── Audit Log ─────────────────────────────────────────────────
let _auditOffset = 0;
const AUDIT_PAGE_SIZE = 50;

async function loadAuditLog(reset = true) {
  if (reset) _auditOffset = 0;

  const userFilter   = document.getElementById('audit-user-filter')?.value?.trim()   || '';
  const actionFilter = document.getElementById('audit-action-filter')?.value?.trim() || '';

  const container = document.getElementById('audit-log-container');
  if (!container) return;
  if (reset) container.innerHTML = '<div class="loading-state">Loading audit log…</div>';

  const result = await API.getAuditLog(AUDIT_PAGE_SIZE, _auditOffset, userFilter, actionFilter);
  if (!result) { container.innerHTML = '<div class="empty-state">Could not load audit log.</div>'; return; }

  const { logs, total } = result;

  if (reset) container.innerHTML = '';

  if (!logs.length && reset) {
    container.innerHTML = '<div class="empty-state">No log entries found.</div>';
    return;
  }

  // Append rows
  logs.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'audit-row';
    const ts = new Date(entry.created_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
    const actionClass = getAuditActionClass(entry.action);
    const details = entry.details ? formatAuditDetails(entry.action, entry.details) : '';
    row.innerHTML = `
      <div class="audit-ts">${ts}</div>
      <div class="audit-user">${esc(entry.display_name || entry.username || '—')}</div>
      <div class="audit-action ${actionClass}">${formatAuditAction(entry.action)}</div>
      ${details ? `<div class="audit-details">${details}</div>` : '<div class="audit-details">—</div>'}
    `;
    container.appendChild(row);
  });

  _auditOffset += logs.length;

  // Load more button
  const existingMore = document.getElementById('audit-load-more');
  if (existingMore) existingMore.remove();

  if (_auditOffset < total) {
    const loadMore = document.createElement('button');
    loadMore.id = 'audit-load-more';
    loadMore.className = 'btn-sm btn-outline audit-load-more';
    loadMore.textContent = `Load more (${total - _auditOffset} remaining)`;
    loadMore.onclick = () => loadAuditLog(false);
    container.after(loadMore);
  }

  // Update count
  const countEl = document.getElementById('audit-total-count');
  if (countEl) countEl.textContent = `${total} total entries`;
}

function getAuditActionClass(action) {
  if (action.includes('deleted') || action.includes('removed') || action.includes('deactivated')) return 'action-danger';
  if (action.includes('edited') || action.includes('updated') || action.includes('reset') || action.includes('changed')) return 'action-warn';
  if (action.includes('login') || action.includes('added') || action.includes('created') || action.includes('logged') || action.includes('imported')) return 'action-success';
  if (action.includes('exported') || action.includes('backup')) return 'action-info';
  return '';
}

function formatAuditAction(action) {
  const map = {
    login:                  '🔑 Login',
    logout:                 '👋 Logout',
    password_changed:       '🔐 Password Changed',
    password_reset:         '🔄 Password Reset',
    player_added:           '✅ Player Added',
    player_removed:         '❌ Player Removed',
    player_suspended:       '🔴 Player Suspended',
    player_reactivated:     '🟢 Player Reactivated',
    players_imported:       '📥 Players Imported',
    players_batch_updated:  '📊 Stats Updated',
    stats_recalculated:     '🔁 Stats Recalculated',
    stats_after_match:      '📊 Stats Updated',
    fixture_added:          '📅 Fixture Added',
    fixture_removed:        '🗑 Fixture Removed',
    fixture_postponed:      '⏸ Fixture Postponed',
    fixture_resumed:        '▶️ Fixture Resumed',
    fixtures_generated:     '📋 Fixtures Generated',
    fixtures_batch_updated: '📋 Fixtures Updated',
    fixture_rescheduled:    '📅 Fixture Rescheduled',
    match_logged:           '⚽ Result Logged',
    match_edited:           '✏️ Result Edited',
    match_deleted:          '🗑 Result Deleted',
    user_created:           '👤 Staff Added',
    user_deactivated:       '⛔ Staff Removed',
    user_reactivated:       '✅ Staff Restored',
    setting_updated:        '⚙️ Setting Updated',
    backup_exported:        '💾 Backup Exported',
    backup_imported:        '📤 Backup Imported',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatAuditDetails(action, details) {
  if (!details) return '';
  try {
    if (action === 'match_logged')
      return `${esc(details.home)} ${details.homeGoals}–${details.awayGoals} ${esc(details.away)} (${details.result})`;
    if (action === 'match_edited')
      return `${esc(details.home)} vs ${esc(details.away)}: ${details.old} → ${details.new}`;
    if (action === 'match_deleted')
      return `${esc(details.home)} vs ${esc(details.away)} ${details.score}`;
    if (action === 'player_added' || action === 'player_removed')
      return `${esc(details.name)} @${esc(details.username)}`;
    if (action === 'user_created')
      return `@${esc(details.newUser)} as ${details.role}`;
    if (action === 'fixture_postponed')
      return `${esc(details.home)} vs ${esc(details.away)} by ${esc(details.by)}`;
    if (action === 'players_imported' || action === 'players_batch_updated')
      return `${details.count} players`;
    if (action === 'setting_updated')
      return `${details.key}: ${details.value != null ? esc(String(details.value)) : 'cleared'}`;
    return Object.entries(details).map(([k, v]) => `${k}: ${esc(String(v))}`).join(' · ');
  } catch {
    return '';
  }
}

// ── Danger Zone ───────────────────────────────────────────────
async function resetAllStats() {
  if (!confirm('⚠ Recalculate ALL player stats from recorded results?\nThis overwrites current stats.')) return;
  recalculateAllStats();
  toast('Stats recalculated from all results.', 'success');
}

async function clearAllFixtures() {
  if (!confirm('⚠ Delete ALL fixtures? This cannot be undone.')) return;
  if (!confirm('Are you sure? This will remove all scheduled fixtures.')) return;
  const result = await API.batchFixtures([], 'fixtures_cleared');
  if (!result) return;
  toast('All fixtures cleared.', 'info');
  renderAll();
}

async function clearAllResults() {
  if (!confirm('⚠ Delete ALL match results AND reset all stats? This cannot be undone.')) return;
  if (!confirm('This will wipe the entire season history. Are you absolutely sure?')) return;

  // Delete all results one by one is slow — use backup import with empty results
  const result = await API.importBackup({
    players:  State.players.map(p => ({
      ...p, played: 0, wins: 0, draws: 0, losses: 0, points: 0, gf: 0, ga: 0, form: []
    })),
    fixtures: State.fixtures,
    results:  [],
  });
  if (!result) return;

  // Reload
  await API.loadAll();
  toast('All results cleared and stats reset.', 'info');
  renderAll();
}

async function downloadBackup() {
  toast('Preparing backup...', 'info');
  Storage.exportBackup();
}

async function importBackupFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.players && !data.fixtures && !data.results) {
        toast('Invalid backup file.', 'error'); return;
      }
      if (!confirm(`Import backup from ${data.exportedAt || 'unknown date'}?\nThis will replace ALL current data.`)) return;
      const ok = await API.importBackup(data);
      if (!ok) return;
      await API.loadAll();
      toast('Backup imported successfully!', 'success');
      renderAll();
    } catch {
      toast('Could not read backup file.', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── Accordion toggle ──────────────────────────────────────────
function toggleAccordion(id) {
  const content = document.getElementById(id);
  const btn     = content?.previousElementSibling;
  if (!content) return;
  const isOpen = content.classList.toggle('acc-open');
  if (btn) btn.classList.toggle('acc-active', isOpen);
}
