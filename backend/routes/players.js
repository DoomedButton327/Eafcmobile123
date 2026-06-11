/* ================================================================
   routes/players.js — Player CRUD + batch update
================================================================ */
const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const POSTPONEMENTS_PER_SEASON = 20;

function rowToPlayer(r) {
  return {
    name: r.name,
    username: r.username,
    phone: r.phone || '',
    played: r.played,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    points: r.points,
    gf: r.gf,
    ga: r.ga,
    form: r.form || [],
    postponements: r.postponements,
    suspended: r.suspended,
  };
}

// GET /api/players — public
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json(rows.map(rowToPlayer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/players — add player
router.post('/', requireAuth, async (req, res) => {
  const { name, username, phone } = req.body;
  if (!name || !username)
    return res.status(400).json({ error: 'Name and username required' });
  try {
    const existing = await query('SELECT id FROM players WHERE username = $1', [username.trim()]);
    if (existing.rows.length)
      return res.status(409).json({ error: `Username "${username}" already exists` });

    await query(
      `INSERT INTO players (name, username, phone, postponements) VALUES ($1, $2, $3, $4)`,
      [name.trim(), username.trim(), (phone || '').trim(), POSTPONEMENTS_PER_SEASON]
    );

    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'player_added', { name, username }, req.ip]
    );

    const { rows } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.status(201).json(rows.map(rowToPlayer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/players/import — bulk import
router.post('/import', requireAuth, async (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players) || !players.length)
    return res.status(400).json({ error: 'Players array required' });
  try {
    let imported = 0;
    for (const p of players) {
      if (!p.name || !p.username) continue;
      const existing = await query('SELECT id FROM players WHERE username = $1', [p.username.trim()]);
      if (existing.rows.length) continue;
      await query(
        `INSERT INTO players (name, username, phone, postponements) VALUES ($1, $2, $3, $4)`,
        [p.name.trim(), p.username.trim(), (p.phone || '').trim(), POSTPONEMENTS_PER_SEASON]
      );
      imported++;
    }
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'players_imported', { count: imported }, req.ip]
    );
    const { rows } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json({ imported, players: rows.map(rowToPlayer) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/players/:username
router.delete('/:username', requireAuth, async (req, res) => {
  const { username } = req.params;
  try {
    const { rows } = await query('SELECT * FROM players WHERE username = $1', [username]);
    if (!rows[0]) return res.status(404).json({ error: 'Player not found' });
    await query('DELETE FROM players WHERE username = $1', [username]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'player_removed', { name: rows[0].name, username }, req.ip]
    );
    const { rows: updated } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json(updated.map(rowToPlayer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/players/:username/suspend — toggle suspend
router.post('/:username/suspend', requireAuth, async (req, res) => {
  const { username } = req.params;
  try {
    const { rows } = await query('SELECT * FROM players WHERE username = $1', [username]);
    if (!rows[0]) return res.status(404).json({ error: 'Player not found' });
    const newState = !rows[0].suspended;
    await query('UPDATE players SET suspended = $1, updated_at = NOW() WHERE username = $2', [newState, username]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, newState ? 'player_suspended' : 'player_reactivated',
       { player: rows[0].name, username }, req.ip]
    );
    const { rows: updated } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json(updated.map(rowToPlayer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/players/batch — save full player array (stats recalculation, etc.)
router.put('/batch', requireAuth, async (req, res) => {
  const { players, action } = req.body;
  if (!Array.isArray(players))
    return res.status(400).json({ error: 'Players array required' });
  try {
    for (const p of players) {
      await query(
        `UPDATE players SET
          name=$1, phone=$2, played=$3, wins=$4, draws=$5, losses=$6, points=$7,
          gf=$8, ga=$9, form=$10, postponements=$11, suspended=$12, updated_at=NOW()
         WHERE username=$13`,
        [p.name, p.phone || '', p.played || 0, p.wins || 0, p.draws || 0, p.losses || 0,
         p.points || 0, p.gf || 0, p.ga || 0, JSON.stringify(p.form || []),
         p.postponements ?? POSTPONEMENTS_PER_SEASON, p.suspended || false, p.username]
      );
    }
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, action || 'players_batch_updated', { count: players.length }, req.ip]
    );
    const { rows } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json(rows.map(rowToPlayer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
