/* ================================================================
   METTLESTATE × EA FC MOBILE — api.js
   Replaces storage.js + github.js
   All data now comes from the backend API. JWT auth via sessionStorage.
================================================================ */

const API = (() => {
  const BASE = ''; // Same origin — Express serves both API and frontend

  // ── Token management ─────────────────────────────────────────
  function getToken()         { return sessionStorage.getItem('eafc_token') || ''; }
  function setToken(t)        { sessionStorage.setItem('eafc_token', t); }
  function clearToken()       { sessionStorage.removeItem('eafc_token'); sessionStorage.removeItem('eafc_user'); }
  function getUser()          { try { return JSON.parse(sessionStorage.getItem('eafc_user') || 'null'); } catch { return null; } }
  function setUser(u)         { sessionStorage.setItem('eafc_user', JSON.stringify(u)); }
  function isAuthenticated()  { return !!getToken(); }

  function authHeaders(extra = {}) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}`, ...extra };
  }

  async function req(method, path, body) {
    try {
      const opts = { method, headers: authHeaders() };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(`${BASE}/api${path}`, opts);

      if (res.status === 401) {
        clearToken();
        if (!window.location.pathname.includes('login')) window.location.href = '/login.html';
        return null;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `API error ${res.status}`;
        if (typeof toast === 'function') toast(msg, 'error');
        else console.error('API error:', msg);
        return null;
      }
      return data;
    } catch (err) {
      console.error(`[API] ${method} ${path}:`, err);
      if (typeof toast === 'function') toast('Network error — is the server running?', 'error');
      return null;
    }
  }

  // ── Multipart request for image uploads ──────────────────────
  async function reqMultipart(method, path, formData) {
    try {
      const res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: { 'Authorization': `Bearer ${getToken()}` }, // no Content-Type (browser sets multipart boundary)
        body: formData,
      });
      if (res.status === 401) { clearToken(); window.location.href = '/login.html'; return null; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `API error ${res.status}`;
        if (typeof toast === 'function') toast(msg, 'error');
        return null;
      }
      return data;
    } catch (err) {
      console.error(`[API] multipart ${path}:`, err);
      if (typeof toast === 'function') toast('Network error', 'error');
      return null;
    }
  }

  return {
    // ── Auth ───────────────────────────────────────────────────
    isAuthenticated,
    getToken,
    getUser,

    async login(username, password) {
      const data = await req('POST', '/auth/login', { username, password });
      if (!data) return false;
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },

    logout() {
      clearToken();
      window.location.href = '/login.html';
    },

    async fetchCurrentUser() {
      const data = await req('GET', '/auth/me');
      if (data) setUser(data);
      return data;
    },

    async changePassword(currentPassword, newPassword) {
      return req('POST', '/auth/change-password', { currentPassword, newPassword });
    },

    // ── State (initial load) ───────────────────────────────────
    async loadAll() {
      const data = await req('GET', '/state');
      if (!data) return false;
      State.players  = data.players  || [];
      State.fixtures = data.fixtures || [];
      State.results  = data.results  || [];
      // Load discord webhook from settings
      if (data.settings?.discord_webhook) {
        window._discordWebhookFromServer = data.settings.discord_webhook;
      }
      if (data.settings?.scheduler_config) {
        try { State.schedulerConfig = JSON.parse(data.settings.scheduler_config); } catch {}
      }
      return true;
    },

    // ── Players ────────────────────────────────────────────────
    async addPlayer(name, username, phone) {
      const data = await req('POST', '/players', { name, username, phone });
      if (data) State.players = data;
      return data;
    },

    async removePlayer(username) {
      const data = await req('DELETE', `/players/${username}`);
      if (data) State.players = data;
      return data;
    },

    async toggleSuspend(username) {
      const data = await req('POST', `/players/${username}/suspend`);
      if (data) State.players = data;
      return data;
    },

    async batchUpdatePlayers(players, action) {
      const data = await req('PUT', '/players/batch', { players, action });
      if (data) State.players = data;
      return data;
    },

    async importPlayers(players) {
      const data = await req('POST', '/players/import', { players });
      if (data) State.players = data.players;
      return data;
    },

    // ── Fixtures ───────────────────────────────────────────────
    async addFixture(home, away, scheduledDate, id) {
      const data = await req('POST', '/fixtures', { id, home, away, scheduledDate });
      if (data) State.fixtures = data;
      return data;
    },

    async batchFixtures(fixtures, action) {
      const data = await req('PUT', '/fixtures/batch', { fixtures, action });
      if (data) State.fixtures = data;
      return data;
    },

    async removeFixture(id) {
      const data = await req('DELETE', `/fixtures/${id}`);
      if (data) State.fixtures = data;
      return data;
    },

    async postponeFixture(id, byUser) {
      const data = await req('POST', `/fixtures/${id}/postpone`, { byUser });
      if (data) {
        State.fixtures = data.fixtures;
        State.players  = data.players;
      }
      return data;
    },

    async resumeFixture(id) {
      const data = await req('POST', `/fixtures/${id}/resume`);
      if (data) State.fixtures = data;
      return data;
    },

    // ── Matches ────────────────────────────────────────────────
    async logMatch(matchData, imageFile) {
      let data;
      if (imageFile) {
        // Use multipart for image upload
        const form = new FormData();
        Object.entries(matchData).forEach(([k, v]) => { if (v !== null && v !== undefined) form.append(k, v); });
        form.append('image', imageFile);
        data = await reqMultipart('POST', '/matches', form);
      } else {
        data = await req('POST', '/matches', matchData);
      }
      if (data) {
        State.results  = data.matches;
        State.players  = data.players;
        State.fixtures = data.fixtures;
      }
      return data;
    },

    async editMatch(id, homeGoals, awayGoals) {
      const data = await req('PUT', `/matches/${id}`, { homeGoals, awayGoals });
      if (data) State.results = data;
      return data;
    },

    async deleteMatch(id) {
      const data = await req('DELETE', `/matches/${id}`);
      if (data) State.results = data;
      return data;
    },

    // ── Settings ───────────────────────────────────────────────
    async loadSettings() {
      return req('GET', '/settings');
    },

    async saveSetting(key, value) {
      return req('POST', '/settings', { key, value });
    },

    // ── Users (owner only) ─────────────────────────────────────
    async getUsers() {
      return req('GET', '/users');
    },

    async addUser(username, displayName, password, role) {
      return req('POST', '/users', { username, displayName, password, role });
    },

    async deactivateUser(id) {
      return req('DELETE', `/users/${id}`);
    },

    async reactivateUser(id) {
      return req('PUT', `/users/${id}/reactivate`);
    },

    async resetUserPassword(id, newPassword) {
      return req('PUT', `/users/${id}/password`, { newPassword });
    },

    // ── Audit log ──────────────────────────────────────────────
    async getAuditLog(limit = 100, offset = 0, userFilter = '', actionFilter = '') {
      const params = new URLSearchParams({ limit, offset });
      if (userFilter)   params.set('user',   userFilter);
      if (actionFilter) params.set('action', actionFilter);
      return req('GET', `/audit?${params}`);
    },

    // ── Backup ─────────────────────────────────────────────────
    async exportBackup() {
      return req('GET', '/backup/export');
    },

    async importBackup(data) {
      return req('POST', '/backup/import', data);
    },

    // ── Public leaderboard ─────────────────────────────────────
    async getLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard');
        return res.json();
      } catch { return null; }
    },
  };
})();

// ── Shim: keep Storage/GH as stubs so unchanged modules don't break ──
// These were previously used for localStorage + GitHub sync.
// In the new version, all data lives in PostgreSQL via the API.

const Storage = {
  KEYS: {},
  save() {}, load() { return null; }, remove() {},
  savePlayers() {}, loadPlayers()   { return State.players; },
  saveFixtures() {}, loadFixtures() { return State.fixtures; },
  saveResults()  {}, loadResults()  { return State.results;  },
  saveAll() {}, loadAll() {},
  saveTheme(id)    { localStorage.setItem('eafc_theme', id); },
  loadTheme()      { return localStorage.getItem('eafc_theme') || 'godmode'; },
  saveScheduler(cfg) { API.saveSetting('scheduler_config', JSON.stringify(cfg)).catch(() => {}); },
  loadScheduler()  { return State.schedulerConfig; },
  saveGeminiKey(k) { API.saveSetting('gemini_key', k).catch(() => {}); },
  loadGeminiKey()  { return null; /* loaded from settings via API */ },
  saveGHConfig()  {}, loadGHConfig() { return null; }, removeGHConfig() {},
  savePubRepo()   {}, loadPubRepo()  { return null; },
  saveImgRepo()   {}, loadImgRepo()  { return null; }, removeImgRepo() {},
  saveDiscordWebhook(url) { API.saveSetting('discord_webhook', url).catch(() => {}); },
  loadDiscordWebhook()    { return window._discordWebhookFromServer || ''; },
  removeDiscordWebhook()  { API.saveSetting('discord_webhook', '').catch(() => {}); },
  saveMEEvents(events, ts) {},
  loadMEEvents() { return { events: [], lastFetch: null }; },
  addPendingRegistration() {},
  loadPendingRegistrations() { return []; },
  clearPendingRegistrations() {},
  exportBackup() {
    API.exportBackup().then(data => {
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mettlestate-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  },
  importBackup(jsonStr) {
    const data = JSON.parse(jsonStr);
    return API.importBackup(data);
  },
};

// GitHub module shim — no longer needed (backend handles persistence)
const GH = {
  isConnected()        { return false; },
  isImgRepoConnected() { return false; },
  load() {},
  save()       {},
  disconnect() {},
  async testConnection()        { return { ok: true, msg: 'Using database — no GitHub needed.' }; },
  async testImgRepoConnection() { return { ok: true, msg: 'Images stored in database.' }; },
  async loadRemoteData()        { return null; },
  async syncData()              { return true; },
  async syncDataNow()           { return true; },
  async uploadMatchImage()      { return null; },
  async pushPublicLeaderboard() { return true; },
  _showStatus() {},
};

// Override getDiscordWebhookUrl to use server-side setting
function getDiscordWebhookUrl() {
  return window._discordWebhookFromServer || '';
}
