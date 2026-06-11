/* ================================================================
   METTLESTATE × EA FC MOBILE — fixtures.js v2
   Fixture generation · postpone · resume · forfeit · render
   Now backed by PostgreSQL via API calls
================================================================ */

function getFixture(id) {
  return State.fixtures.find(f => f.id === id || String(f.id) === String(id)) || null;
}

// ── Generate round-robin fixtures ─────────────────────────────
async function generateFixtures(mode = 'home-away', startDate = null, cfg = {}) {
  const players = State.players.filter(p => !p.suspended);
  if (players.length < 2) { toast('Need at least 2 active players.', 'error'); return; }

  if (State.fixtures.length > 0) {
    if (!confirm(`This will replace all ${State.fixtures.length} existing fixtures. Continue?`)) return;
  }

  const usernames = players.map(p => p.username);
  const generated = [];
  const useHomeAway = mode === 'home-away';

  // Round-robin algorithm
  const list = [...usernames];
  if (list.length % 2 !== 0) list.push('__bye__');
  const n = list.length;
  const rounds = n - 1;
  const half = n / 2;

  for (let r = 0; r < rounds; r++) {
    for (let m = 0; m < half; m++) {
      const h = list[m];
      const a = list[n - 1 - m];
      if (h === '__bye__' || a === '__bye__') continue;
      const date = startDate ? offsetDate(startDate, r * 7) : null;
      generated.push({ id: Date.now() + generated.length, home: h, away: a, scheduledDate: date, postponedBy: null });
      if (useHomeAway) {
        generated.push({ id: Date.now() + generated.length + 10000, home: a, away: h, scheduledDate: date ? offsetDate(date, 1) : null, postponedBy: null });
      }
    }
    // Rotate list (keep first fixed, rotate rest)
    list.splice(1, 0, list.pop());
  }

  const result = await API.batchFixtures(generated, 'fixtures_generated');
  if (!result) return;

  toast(`Generated ${State.fixtures.length} fixtures!`, 'success');
  sendDiscordWebhook({ type: 'fixturesGenerated', count: State.fixtures.length });
  renderAll();
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Add single fixture manually ───────────────────────────────
async function addManualFixture(home, away, scheduledDate = null) {
  if (!home || !away) { toast('Select both home and away players.', 'error'); return; }
  if (home === away)  { toast('Home and away cannot be the same player.', 'error'); return; }

  const existing = State.fixtures.find(f =>
    (f.home === home && f.away === away) ||
    (f.home === away && f.away === home)
  );
  if (existing && !confirm('A fixture between these players already exists. Add anyway?')) return;

  const result = await API.addFixture(home, away, scheduledDate, Date.now());
  if (!result) return;

  toast(`Fixture added: ${home} vs ${away}`, 'success');
  renderAll();
}

// ── Postpone fixture ──────────────────────────────────────────
async function postponeFixture(fixtureId, byUser) {
  const f = getFixture(fixtureId);
  if (!f) return;
  if (f.postponedBy) { toast('Already postponed.', 'info'); return; }

  const player = getPlayer(byUser);
  if (!player) { toast('Player not found.', 'error'); return; }
  if ((player.postponements || 0) <= 0) {
    toast(`${player.name} has no postponement tokens left.`, 'error');
    return;
  }

  const result = await API.postponeFixture(fixtureId, byUser);
  if (!result) return;

  toast(`Fixture postponed by ${player.name} (${(player.postponements || 1) - 1} tokens left)`, 'info');
  sendDiscordWebhook({ type: 'postponed', home: f.home, away: f.away, by: byUser });
  renderAll();
}

// ── Resume fixture ────────────────────────────────────────────
async function resumeFixture(fixtureId) {
  const f = getFixture(fixtureId);
  if (!f) return;

  const result = await API.resumeFixture(fixtureId);
  if (!result) return;

  toast(`Fixture resumed: ${f.home} vs ${f.away}`, 'success');
  renderAll();
}

// ── Forfeit fixture ───────────────────────────────────────────
async function forfeitFixture(fixtureId, forfeiter) {
  const f = getFixture(fixtureId);
  if (!f) return;
  if (f.home !== forfeiter && f.away !== forfeiter) { toast('Invalid forfeit player.', 'error'); return; }

  const winner = forfeiter === f.home ? f.away : f.home;
  const isHomeWin = winner === f.home;
  const homeGoals = isHomeWin ? FORFEIT_SCORE.winner : FORFEIT_SCORE.loser;
  const awayGoals = isHomeWin ? FORFEIT_SCORE.loser  : FORFEIT_SCORE.winner;
  const result    = isHomeWin ? 'home' : 'away';

  const matchData = {
    id: Date.now(),
    uid: shortUID(),
    home: f.home, away: f.away,
    result, homeGoals, awayGoals,
    date: todayYMD(),
  };

  const matchResult = await API.logMatch(matchData);
  if (!matchResult) return;

  // Remove the forfeited fixture
  await API.removeFixture(fixtureId);

  const forfeiterName = getPlayer(forfeiter)?.name || forfeiter;
  const winnerName    = getPlayer(winner)?.name    || winner;
  toast(`Forfeit: ${winnerName} wins ${homeGoals}-${awayGoals}`, 'success');
  sendDiscordWebhook({ type: 'forfeit', forfeiter: forfeiterName, winner: winnerName,
    home: f.home, away: f.away, homeGoals, awayGoals });
  renderAll();
}

// ── Remove fixture ────────────────────────────────────────────
async function removeFixture(fixtureId) {
  const f = getFixture(fixtureId);
  if (!f) return;
  if (!confirm(`Remove fixture: ${f.home} vs ${f.away}?`)) return;

  const result = await API.removeFixture(fixtureId);
  if (!result) return;

  toast('Fixture removed.', 'info');
  renderAll();
}

// ── Reschedule ────────────────────────────────────────────────
async function rescheduleFixture(fixtureId, newDate) {
  const updated = State.fixtures.map(f =>
    String(f.id) === String(fixtureId) ? { ...f, scheduledDate: newDate } : f
  );
  const result = await API.batchFixtures(updated, 'fixture_rescheduled');
  if (!result) return;
  toast('Fixture rescheduled.', 'success');
  renderAll();
}

// ── Render fixtures tab ───────────────────────────────────────
function renderFixtures() {
  const container = document.getElementById('fixturesContainer');
  if (!container) return;

  const search     = (document.getElementById('fixture-filter-input')?.value || '').toLowerCase();
  const showPostponed = document.getElementById('show-postponed')?.checked ?? true;

  let list = State.fixtures;
  if (!showPostponed) list = list.filter(f => !f.postponedBy);
  if (search) list = list.filter(f =>
    f.home.toLowerCase().includes(search) ||
    f.away.toLowerCase().includes(search)
  );

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">No fixtures${search ? ' matching search' : ''}</div>`;
    return;
  }

  // Group by date
  const groups = {};
  list.forEach(f => {
    const key = f.scheduledDate || 'Unscheduled';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Unscheduled') return 1;
    if (b === 'Unscheduled') return -1;
    return a.localeCompare(b);
  });

  container.innerHTML = sortedKeys.map(dateKey => {
    const isHol = dateKey !== 'Unscheduled' && isHoliday(dateKey);
    const dateLabel = dateKey === 'Unscheduled'
      ? 'Unscheduled'
      : `${dateKey}${isHol ? ` — 🎉 ${holidayName(dateKey)}` : ''}`;

    const fixtureCards = groups[dateKey].map(f => renderFixtureCard(f)).join('');
    return `
      <div class="fixture-date-group">
        <div class="fixture-date-header">${dateLabel}</div>
        ${fixtureCards}
      </div>`;
  }).join('');
}

function renderFixtureCard(f) {
  const hp = getPlayer(f.home);
  const ap = getPlayer(f.away);
  const hName = hp?.name || f.home;
  const aName = ap?.name || f.away;
  const isPostponed = !!f.postponedBy;
  const postponedByName = isPostponed ? (getPlayer(f.postponedBy)?.name || f.postponedBy) : '';

  return `
    <div class="fixture-card ${isPostponed ? 'fixture-postponed' : ''}">
      <div class="fixture-teams">
        <span class="fixture-team home">${esc(hName)}</span>
        <span class="fixture-vs">VS</span>
        <span class="fixture-team away">${esc(aName)}</span>
      </div>
      ${isPostponed ? `<div class="fixture-postponed-badge">⏸ Postponed by ${esc(postponedByName)}</div>` : ''}
      <div class="fixture-actions">
        ${isPostponed
          ? `<button class="btn-sm btn-success" onclick="resumeFixture(${f.id})">Resume</button>`
          : `<button class="btn-sm btn-warn" onclick="openPostponeModal(${f.id})">Postpone</button>`}
        <button class="btn-sm btn-accent" onclick="openForfeitModal(${f.id})">Forfeit</button>
        <button class="btn-sm btn-outline" onclick="openRescheduleModal(${f.id})">Reschedule</button>
        <button class="btn-sm btn-danger" onclick="removeFixture(${f.id})">Remove</button>
      </div>
    </div>`;
}

// ── Modal helpers ─────────────────────────────────────────────
function openPostponeModal(fixtureId) {
  const f = getFixture(fixtureId);
  if (!f) return;
  const modal   = document.getElementById('postpone-modal');
  const sel     = document.getElementById('postpone-player-sel');
  const label   = document.getElementById('postpone-fixture-label');
  if (!modal || !sel) return;

  const hp = getPlayer(f.home);
  const ap = getPlayer(f.away);
  label.textContent = `${hp?.name || f.home} vs ${ap?.name || f.away}`;

  sel.innerHTML = [f.home, f.away].map(u => {
    const p = getPlayer(u);
    if (!p) return '';
    return `<option value="${esc(u)}">${esc(p.name)} (${p.postponements ?? POSTPONEMENTS_PER_SEASON} tokens)</option>`;
  }).join('');

  modal._fixtureId = fixtureId;
  modal.classList.add('active');
}

function confirmPostpone() {
  const modal = document.getElementById('postpone-modal');
  const sel   = document.getElementById('postpone-player-sel');
  if (!modal || !sel) return;
  postponeFixture(modal._fixtureId, sel.value);
  modal.classList.remove('active');
}

function openForfeitModal(fixtureId) {
  const f = getFixture(fixtureId);
  if (!f) return;
  const modal = document.getElementById('forfeit-modal');
  const sel   = document.getElementById('forfeit-player-sel');
  const label = document.getElementById('forfeit-fixture-label');
  if (!modal || !sel) return;

  const hp = getPlayer(f.home);
  const ap = getPlayer(f.away);
  label.textContent = `${hp?.name || f.home} vs ${ap?.name || f.away}`;

  sel.innerHTML = [f.home, f.away].map(u => {
    const p = getPlayer(u);
    return `<option value="${esc(u)}">${esc(p?.name || u)} forfeits</option>`;
  }).join('');

  modal._fixtureId = fixtureId;
  modal.classList.add('active');
}

function confirmForfeit() {
  const modal = document.getElementById('forfeit-modal');
  const sel   = document.getElementById('forfeit-player-sel');
  if (!modal || !sel) return;
  forfeitFixture(modal._fixtureId, sel.value);
  modal.classList.remove('active');
}

function openRescheduleModal(fixtureId) {
  const f = getFixture(fixtureId);
  if (!f) return;
  const modal = document.getElementById('reschedule-modal');
  const input = document.getElementById('reschedule-date-input');
  const label = document.getElementById('reschedule-fixture-label');
  if (!modal || !input) return;

  const hp = getPlayer(f.home);
  const ap = getPlayer(f.away);
  label.textContent = `${hp?.name || f.home} vs ${ap?.name || f.away}`;
  input.value = f.scheduledDate || '';
  modal._fixtureId = fixtureId;
  modal.classList.add('active');
}

function confirmReschedule() {
  const modal = document.getElementById('reschedule-modal');
  const input = document.getElementById('reschedule-date-input');
  if (!modal || !input) return;
  rescheduleFixture(modal._fixtureId, input.value || null);
  modal.classList.remove('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}
