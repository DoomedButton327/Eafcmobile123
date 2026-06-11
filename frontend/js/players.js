/* ================================================================
   METTLESTATE × EA FC MOBILE — players.js v2
   Player CRUD · stats · management table render
   Now backed by PostgreSQL via API calls
================================================================ */

function saveData() {
  // In v2 each mutation goes through a specific API call.
  // saveData() is called after local state is already updated —
  // just re-render here.
  renderAll();
}

function sortedPlayers() {
  return [...State.players].sort((a, b) => {
    const dp = (b.points || 0) - (a.points || 0);
    if (dp !== 0) return dp;
    const dg = ((b.gf || 0) - (b.ga || 0)) - ((a.gf || 0) - (a.ga || 0));
    if (dg !== 0) return dg;
    return (b.gf || 0) - (a.gf || 0);
  });
}

function getPlayer(username) {
  return State.players.find(p => p.username === username) || null;
}

async function addPlayer(name, username, phone) {
  if (!name || !username) { toast('Name and username required.', 'error'); return false; }
  if (getPlayer(username)) { toast(`Username "${username}" already exists.`, 'error'); return false; }

  const result = await API.addPlayer(name.trim(), username.trim(), (phone || '').trim());
  if (!result) return false;

  sendDiscordWebhook({ type: 'playerAdded', name, username });
  toast(`${name} added!`, 'success');
  renderAll();
  return true;
}

async function removePlayer(username) {
  const p = getPlayer(username);
  if (!p) return;
  if (!confirm(`Remove ${p.name} (@${p.username}) from the league? This cannot be undone.`)) return;

  const result = await API.removePlayer(username);
  if (!result) return;

  sendDiscordWebhook({ type: 'playerRemoved', name: p.name, username });
  toast(`${p.name} removed.`, 'info');
  renderAll();
}

async function toggleSuspend(username) {
  const p = getPlayer(username);
  if (!p) return;

  const result = await API.toggleSuspend(username);
  if (!result) return;

  const newState = !p.suspended;
  sendDiscordWebhook({ type: 'suspension', player: p.name, suspended: newState });
  toast(`${p.name} ${newState ? 'suspended' : 'reactivated'}.`, newState ? 'error' : 'success');
  renderAll();
}

// ── Stats recalculation (called after edit/delete result) ─────
function recalculateAllStats() {
  // Reset all players
  State.players.forEach(p => {
    p.played = 0; p.wins = 0; p.draws = 0; p.losses = 0;
    p.points = 0; p.gf = 0; p.ga = 0; p.form = [];
  });
  // Replay all results
  State.results.forEach(r => {
    updatePlayerStats(r.home, r.away, r.homeGoals, r.awayGoals,
      r.homeGoals > r.awayGoals ? 'home' : r.awayGoals > r.homeGoals ? 'away' : 'draw');
  });
  // Push to backend
  API.batchUpdatePlayers(State.players, 'stats_recalculated').then(updated => {
    if (updated) renderAll();
  });
}

function updatePlayerStats(homeUser, awayUser, homeGoals, awayGoals, result) {
  const home = getPlayer(homeUser);
  const away = getPlayer(awayUser);
  if (!home || !away) return;

  home.played = (home.played || 0) + 1;
  away.played = (away.played || 0) + 1;
  home.gf = (home.gf || 0) + homeGoals;
  home.ga = (home.ga || 0) + awayGoals;
  away.gf = (away.gf || 0) + awayGoals;
  away.ga = (away.ga || 0) + homeGoals;

  if (result === 'home') {
    home.wins = (home.wins || 0) + 1;
    home.points = (home.points || 0) + 3;
    away.losses = (away.losses || 0) + 1;
    home.form = [...(home.form || []), 'W'].slice(-10);
    away.form = [...(away.form || []), 'L'].slice(-10);
  } else if (result === 'away') {
    away.wins = (away.wins || 0) + 1;
    away.points = (away.points || 0) + 3;
    home.losses = (home.losses || 0) + 1;
    away.form = [...(away.form || []), 'W'].slice(-10);
    home.form = [...(home.form || []), 'L'].slice(-10);
  } else {
    home.draws = (home.draws || 0) + 1;
    away.draws = (away.draws || 0) + 1;
    home.points = (home.points || 0) + 1;
    away.points = (away.points || 0) + 1;
    home.form = [...(home.form || []), 'D'].slice(-10);
    away.form = [...(away.form || []), 'D'].slice(-10);
  }
}

function reversePlayerStats(homeUser, awayUser, homeGoals, awayGoals, result) {
  const home = getPlayer(homeUser);
  const away = getPlayer(awayUser);
  if (!home || !away) return;

  home.played = Math.max(0, (home.played || 0) - 1);
  away.played = Math.max(0, (away.played || 0) - 1);
  home.gf = Math.max(0, (home.gf || 0) - homeGoals);
  home.ga = Math.max(0, (home.ga || 0) - awayGoals);
  away.gf = Math.max(0, (away.gf || 0) - awayGoals);
  away.ga = Math.max(0, (away.ga || 0) - homeGoals);

  if (result === 'home') {
    home.wins = Math.max(0, (home.wins || 0) - 1);
    home.points = Math.max(0, (home.points || 0) - 3);
    away.losses = Math.max(0, (away.losses || 0) - 1);
  } else if (result === 'away') {
    away.wins = Math.max(0, (away.wins || 0) - 1);
    away.points = Math.max(0, (away.points || 0) - 3);
    home.losses = Math.max(0, (home.losses || 0) - 1);
  } else {
    home.draws = Math.max(0, (home.draws || 0) - 1);
    away.draws = Math.max(0, (away.draws || 0) - 1);
    home.points = Math.max(0, (home.points || 0) - 1);
    away.points = Math.max(0, (away.points || 0) - 1);
  }
}

async function importPlayersFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const toImport = [];
  const skipped = [];

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) { skipped.push(line); continue; }
    const [name, username, phone = ''] = parts;
    if (!name || !username) { skipped.push(line); continue; }
    if (getPlayer(username)) { skipped.push(`${username} (exists)`); continue; }
    toImport.push({ name, username, phone });
  }

  if (!toImport.length) {
    toast('No new players to import.', 'info');
    return;
  }

  const result = await API.importPlayers(toImport);
  if (!result) return;

  if (skipped.length) toast(`Imported ${result.imported}. Skipped: ${skipped.join(', ')}`, 'info', 5000);
  else toast(`Imported ${result.imported} players!`, 'success');

  sendDiscordWebhook({ type: 'playersImported', count: result.imported, total: State.players.length });
  renderAll();
}

// ── Datalist for autocomplete ─────────────────────────────────
function updatePlayerDatalist() {
  const dl = document.getElementById('player-datalist');
  if (!dl) return;
  dl.innerHTML = State.players.map(p => `<option value="${esc(p.username)}">${esc(p.name)}</option>`).join('');
}

// ── Fixture select for score logging ─────────────────────────
function updateScoreSelect() {
  const sel = document.getElementById('scoreFixtureSelect');
  if (!sel) return;
  const active = State.fixtures.filter(f => !f.postponedBy);
  if (!active.length) {
    sel.innerHTML = '<option value="">— No active fixtures —</option>';
    return;
  }
  sel.innerHTML = `<option value="">— Select fixture —</option>` +
    active.map(f => {
      const hp = getPlayer(f.home);
      const ap = getPlayer(f.away);
      const hLabel = hp?.name || f.home;
      const aLabel = ap?.name || f.away;
      return `<option value="${f.id}">${esc(hLabel)} vs ${esc(aLabel)}${f.scheduledDate ? ` (${f.scheduledDate})` : ''}</option>`;
    }).join('');
}

// ── Render player management table ───────────────────────────
function renderPlayerManagement() {
  const container = document.getElementById('player-management-list');
  if (!container) return;
  const search = (document.getElementById('player-search-input')?.value || '').toLowerCase();
  const filtered = State.players.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search) ||
    p.username.toLowerCase().includes(search)
  );
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">No players found</div>`;
    return;
  }
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  container.innerHTML = sorted.map(p => {
    const gd = (p.gf || 0) - (p.ga || 0);
    return `
      <div class="player-row ${p.suspended ? 'player-suspended' : ''}" onclick="openPlayerProfile('${esc(p.username)}')">
        <div class="player-row-main">
          <div class="player-row-name">${esc(p.name)} ${p.suspended ? '<span class="susp-badge">SUSP</span>' : ''}</div>
          <div class="player-row-meta">@${esc(p.username)} · ${p.phone || 'No phone'}</div>
        </div>
        <div class="player-row-stats">
          <span class="stat-chip">${p.played || 0}P</span>
          <span class="stat-chip">${p.wins || 0}W</span>
          <span class="stat-chip">${p.points || 0}pts</span>
          <span class="stat-chip" style="color:var(--cyan)">${p.postponements ?? POSTPONEMENTS_PER_SEASON} tkns</span>
        </div>
        <div class="player-row-actions" onclick="event.stopPropagation()">
          <button class="btn-icon ${p.suspended ? 'btn-success' : 'btn-warn'}" 
            onclick="toggleSuspend('${esc(p.username)}')" 
            title="${p.suspended ? 'Reactivate' : 'Suspend'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/>${p.suspended ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="4" y1="4" x2="20" y2="20"/>'}</svg>
          </button>
          <button class="btn-icon btn-danger" onclick="removePlayer('${esc(p.username)}')" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── Player profile modal ──────────────────────────────────────
function openPlayerProfile(username) {
  const p = getPlayer(username);
  if (!p) return;
  const modal   = document.getElementById('player-modal');
  const content = document.getElementById('player-modal-content');
  if (!modal || !content) return;

  const h2h = State.results.filter(r =>
    (r.home === username || r.away === username)
  ).slice(-10).reverse();

  const gd = (p.gf || 0) - (p.ga || 0);
  const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
  const winRate = p.played ? Math.round((p.wins / p.played) * 100) : 0;

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${esc(p.name.charAt(0).toUpperCase())}</div>
      <div class="profile-info">
        <div class="profile-name">${esc(p.name)} ${p.suspended ? '<span class="susp-badge">SUSP</span>' : ''}</div>
        <div class="profile-username">@${esc(p.username)}</div>
        <div class="profile-phone">${esc(p.phone) || '<span style="opacity:.5">No phone</span>'}</div>
      </div>
    </div>
    <div class="profile-stats-grid">
      <div class="profile-stat"><div class="profile-stat-val">${p.points || 0}</div><div class="profile-stat-lbl">Points</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.played || 0}</div><div class="profile-stat-lbl">Played</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.wins || 0}</div><div class="profile-stat-lbl">Wins</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.draws || 0}</div><div class="profile-stat-lbl">Draws</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.losses || 0}</div><div class="profile-stat-lbl">Losses</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${gdStr}</div><div class="profile-stat-lbl">GD</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.gf || 0}</div><div class="profile-stat-lbl">GF</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.ga || 0}</div><div class="profile-stat-lbl">GA</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${winRate}%</div><div class="profile-stat-lbl">Win Rate</div></div>
      <div class="profile-stat"><div class="profile-stat-val">${p.postponements ?? POSTPONEMENTS_PER_SEASON}</div><div class="profile-stat-lbl">Tokens</div></div>
    </div>
    <div class="profile-form-row">
      <span class="profile-form-lbl">Form:</span>
      ${buildFormBadges(p.form || [])}
    </div>
    ${h2h.length ? `
    <div class="profile-h2h">
      <div class="profile-section-title">Recent Matches</div>
      ${h2h.map(r => {
        const isHome = r.home === username;
        const opp = isHome ? r.away : r.home;
        const myGoals = isHome ? r.homeGoals : r.awayGoals;
        const theirGoals = isHome ? r.awayGoals : r.homeGoals;
        const res = r.result === 'draw' ? 'D' : (r.result === (isHome ? 'home' : 'away') ? 'W' : 'L');
        const cls = res === 'W' ? 'form-w' : res === 'D' ? 'form-d' : 'form-l';
        return `<div class="h2h-row"><span class="form-badge ${cls}">${res}</span>
          <span class="h2h-vs">vs ${esc(opp)}</span>
          <span class="h2h-score">${myGoals}–${theirGoals}</span>
          <span class="h2h-date">${r.date || ''}</span></div>`;
      }).join('')}
    </div>` : ''}
  `;
  modal.classList.add('active');
}

function closePlayerModal() {
  document.getElementById('player-modal')?.classList.remove('active');
}
