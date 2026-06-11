/* ================================================================
   METTLESTATE × EA FC MOBILE — results.js v2
   Log · edit · delete match results
   Images uploaded to backend (stored in PostgreSQL)
================================================================ */

let _pendingImageFile = null; // File object for upload

// ── Log a new result ──────────────────────────────────────────
async function logScore() {
  const fixtureId = document.getElementById('scoreFixtureSelect')?.value;
  const homeGoals = parseInt(document.getElementById('homeGoals')?.value);
  const awayGoals = parseInt(document.getElementById('awayGoals')?.value);

  if (!fixtureId)           { toast('Select a fixture.', 'error'); return; }
  if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    toast('Enter valid goal counts.', 'error'); return;
  }

  const f = getFixture(parseInt(fixtureId));
  if (!f) { toast('Fixture not found.', 'error'); return; }

  const result = homeGoals > awayGoals ? 'home' : awayGoals > homeGoals ? 'away' : 'draw';
  const matchData = {
    id: Date.now(),
    uid: shortUID(),
    home: f.home, away: f.away,
    result, homeGoals, awayGoals,
    date: todayYMD(),
  };

  // Show loading
  const btn = document.getElementById('log-score-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  let apiResult;
  if (_pendingImageFile) {
    apiResult = await API.logMatch(matchData, _pendingImageFile);
  } else {
    const imgUrl = document.getElementById('scoreImageUrl')?.value?.trim() || null;
    apiResult = await API.logMatch({ ...matchData, imageUrl: imgUrl });
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Log Result'; }
  if (!apiResult) return;

  _pendingImageFile = null;
  clearImagePreview();

  // Update local stats
  updatePlayerStats(f.home, f.away, homeGoals, awayGoals, result);

  // Push batch stats update to backend
  API.batchUpdatePlayers(State.players, 'stats_after_match');

  // Remove fixture from list
  API.removeFixture(f.id);

  const hp = getPlayer(f.home);
  const ap = getPlayer(f.away);
  const hName = hp?.name || f.home;
  const aName = ap?.name || f.away;
  const winnerName = result === 'home' ? hName : result === 'away' ? aName : null;

  toast(`Result logged: ${hName} ${homeGoals}–${awayGoals} ${aName}`, 'success');
  sendDiscordWebhook({ type: 'result', home: f.home, away: f.away,
    homeGoals, awayGoals, result, winnerName,
    imageUrl: apiResult.results?.find(r => r.home === f.home && r.away === f.away)?.imageUrl || null });

  // Reset form
  document.getElementById('scoreFixtureSelect').value = '';
  document.getElementById('homeGoals').value = '';
  document.getElementById('awayGoals').value = '';
  if (document.getElementById('scoreImageUrl')) document.getElementById('scoreImageUrl').value = '';

  renderAll();
}

// ── Image handling ────────────────────────────────────────────
function handleImageFileSelect(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Select an image file.', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB.', 'error'); return; }
  _pendingImageFile = file;
  showImagePreview(file);
}

function showImagePreview(file) {
  const preview = document.getElementById('image-preview');
  if (!preview) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.innerHTML = `
      <div class="img-preview-wrap">
        <img src="${e.target.result}" alt="Screenshot preview" class="score-img-preview"/>
        <button class="btn-sm btn-danger img-preview-clear" onclick="clearImagePreview()">✕ Clear</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  _pendingImageFile = null;
  const preview = document.getElementById('image-preview');
  if (preview) preview.innerHTML = '';
  const input = document.getElementById('scoreImageInput');
  if (input) input.value = '';
}

// ── Edit result ───────────────────────────────────────────────
let _editingMatchId = null;

function openEditModal(matchId) {
  const m = State.results.find(r => r.id === matchId || String(r.id) === String(matchId));
  if (!m) return;
  const modal = document.getElementById('edit-result-modal');
  if (!modal) return;

  const hp = getPlayer(m.home);
  const ap = getPlayer(m.away);

  document.getElementById('edit-result-home-label').textContent = hp?.name || m.home;
  document.getElementById('edit-result-away-label').textContent = ap?.name || m.away;
  document.getElementById('edit-home-goals').value = m.homeGoals;
  document.getElementById('edit-away-goals').value = m.awayGoals;

  _editingMatchId = matchId;
  modal.classList.add('active');
}

async function saveEditedResult() {
  if (!_editingMatchId) return;
  const homeGoals = parseInt(document.getElementById('edit-home-goals')?.value);
  const awayGoals = parseInt(document.getElementById('edit-away-goals')?.value);
  if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    toast('Enter valid goal counts.', 'error'); return;
  }

  const btn = document.getElementById('save-edit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  const result = await API.editMatch(_editingMatchId, homeGoals, awayGoals);

  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  if (!result) return;

  document.getElementById('edit-result-modal')?.classList.remove('active');
  _editingMatchId = null;

  // Recalculate all stats from scratch
  recalculateAllStats();
  toast('Result updated and stats recalculated.', 'success');
}

// ── Delete result ─────────────────────────────────────────────
async function deleteResult(matchId) {
  const m = State.results.find(r => r.id === matchId || String(r.id) === String(matchId));
  if (!m) return;

  const hp = getPlayer(m.home);
  const ap = getPlayer(m.away);
  const hName = hp?.name || m.home;
  const aName = ap?.name || m.away;

  if (!confirm(`Delete result: ${hName} ${m.homeGoals}–${m.awayGoals} ${aName}? Stats will be recalculated.`)) return;

  const btn = document.querySelector(`[data-delete-match="${matchId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  const result = await API.deleteMatch(matchId);
  if (!result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
    return;
  }

  // Recalculate stats
  recalculateAllStats();
  toast('Result deleted. Stats recalculated.', 'info');
  renderAll();
}

// ── Render results list ───────────────────────────────────────
function renderResults() {
  const container = document.getElementById('resultsContainer');
  if (!container) return;

  const search = (document.getElementById('results-search-input')?.value || '').toLowerCase();
  const limit  = parseInt(document.getElementById('results-limit')?.value || '50');

  let list = [...State.results];
  if (search) list = list.filter(r =>
    r.home.toLowerCase().includes(search) ||
    r.away.toLowerCase().includes(search)
  );

  // Sort most recent first
  list.sort((a, b) => {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return new Date(b.loggedAt || 0) - new Date(a.loggedAt || 0);
  });

  const limited = list.slice(0, limit);

  if (!limited.length) {
    container.innerHTML = `<div class="empty-state">No results${search ? ' matching search' : ''}</div>`;
    return;
  }

  container.innerHTML = limited.map(r => renderResultCard(r)).join('');

  if (list.length > limit) {
    container.innerHTML += `<div class="results-show-more">
      <button class="btn-sm btn-outline" onclick="showMoreResults()">
        Show more (${list.length - limit} remaining)
      </button>
    </div>`;
  }
}

function showMoreResults() {
  const input = document.getElementById('results-limit');
  if (input) {
    input.value = parseInt(input.value || 50) + 50;
    renderResults();
  }
}

function renderResultCard(r) {
  const hp = getPlayer(r.home);
  const ap = getPlayer(r.away);
  const hName = hp?.name || r.home;
  const aName = ap?.name || r.away;
  const resultCls = r.result === 'home' ? 'res-home' : r.result === 'away' ? 'res-away' : 'res-draw';
  const loggedInfo = r.loggedBy ? `<span class="result-logged-by">by ${esc(r.loggedBy)}</span>` : '';
  const editedInfo = r.editedBy ? `<span class="result-edited-by">edited by ${esc(r.editedBy)}</span>` : '';

  const imgSection = (r.imageData || r.imageUrl)
    ? `<div class="result-img-wrap">
         <img src="${r.imageData || r.imageUrl}" class="result-screenshot" alt="Match screenshot"
              loading="lazy" onclick="openLightbox('${r.imageData ? 'data' : r.imageUrl}',${r.id})"/>
       </div>`
    : '';

  return `
    <div class="result-card ${resultCls}">
      <div class="result-header">
        <div class="result-date">${r.date || ''}${loggedInfo}${editedInfo}</div>
        <div class="result-actions">
          <button class="btn-icon btn-warn" onclick="openEditModal(${r.id})" title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-danger" data-delete-match="${r.id}" onclick="deleteResult(${r.id})" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="result-teams">
        <span class="result-team ${r.result === 'home' ? 'team-winner' : ''}">${esc(hName)}</span>
        <div class="result-score">
          <span class="score-num ${r.result === 'home' ? 'score-win' : ''}">${r.homeGoals}</span>
          <span class="score-sep">–</span>
          <span class="score-num ${r.result === 'away' ? 'score-win' : ''}">${r.awayGoals}</span>
        </div>
        <span class="result-team away-team ${r.result === 'away' ? 'team-winner' : ''}">${esc(aName)}</span>
      </div>
      ${imgSection}
    </div>`;
}

// ── Image full-screen modal ───────────────────────────────────
function openLightbox(src, matchId) {
  const modal = document.getElementById('image-modal');
  const img   = document.getElementById('image-modal-img');
  if (!modal || !img) return;

  // If src is 'data', find the match's imageData
  if (src === 'data') {
    const m = State.results.find(r => r.id === matchId || String(r.id) === String(matchId));
    img.src = m?.imageData || m?.imageUrl || '';
  } else {
    img.src = src;
  }
  modal.classList.add('active');
}

function closeLightbox() {
  document.getElementById('image-modal')?.classList.remove('active');
  document.getElementById('image-modal-img').src = '';
}
