/* ================================================================
   routes/settings.js — App settings (discord webhook, season label, etc.)
================================================================ */
const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/settings — get all settings (auth required — contains webhook URL)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings — upsert a setting
router.post('/', requireAuth, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  try {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value ?? null]
    );
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'setting_updated',
       { key, value: key.toLowerCase().includes('webhook') || key.toLowerCase().includes('token')
           ? '[redacted]' : value }, req.ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;


/* ================================================================
   Export a second router for audit log — loaded separately in server.js
================================================================ */
const auditRouter = require('express').Router();

// GET /api/audit — get audit log (admin+)
auditRouter.get('/', requireAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const user   = req.query.user || null;
  const action = req.query.action || null;

  try {
    let sql = `
      SELECT a.id, a.username, a.action, a.details, a.ip_address, a.created_at,
             u.display_name
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE 1=1
    `;
    const params = [];
    if (user) { params.push(user); sql += ` AND a.username = $${params.length}`; }
    if (action) { params.push(`%${action}%`); sql += ` AND a.action ILIKE $${params.length}`; }
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    const total = await query(
      `SELECT COUNT(*) FROM audit_log${user ? ' WHERE username=$1' : ''}`,
      user ? [user] : []
    );
    res.json({ logs: rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports.settingsRouter = router;
module.exports.auditRouter    = auditRouter;


/* ================================================================
   Also export backup router
================================================================ */
const backupRouter = require('express').Router();
const { requireOwner } = require('../middleware/auth');

// GET /api/backup/export
backupRouter.get('/export', requireAuth, async (req, res) => {
  try {
    const [p, f, m] = await Promise.all([
      query('SELECT * FROM players ORDER BY points DESC'),
      query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC'),
      query('SELECT * FROM matches ORDER BY match_date DESC, logged_at DESC'),
    ]);

    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.username,
      players:  p.rows,
      fixtures: f.rows.map(r => ({ id: Number(r.id), home: r.home, away: r.away,
        scheduledDate: r.scheduled_date?.toISOString().slice(0, 10) || null,
        postponedBy: r.postponed_by || null })),
      results:  m.rows.map(r => ({ id: Number(r.id), uid: r.uid, home: r.home, away: r.away,
        result: r.result, homeGoals: r.home_goals, awayGoals: r.away_goals,
        date: r.match_date?.toISOString().slice(0, 10) || null,
        imageUrl: r.image_url, loggedAt: r.logged_at })),
    };

    await query(
      'INSERT INTO audit_log (user_id, username, action, ip_address) VALUES ($1,$2,$3,$4)',
      [req.user.id, req.user.username, 'backup_exported', req.ip]
    );
    res.json(backup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/backup/import — restore (owner only)
backupRouter.post('/import', requireAuth, requireOwner, async (req, res) => {
  const { players, fixtures, results } = req.body;
  if (!players) return res.status(400).json({ error: 'Invalid backup: missing players' });
  try {
    if (players?.length) {
      await query('DELETE FROM players');
      for (const p of players) {
        await query(
          `INSERT INTO players (name, username, phone, played, wins, draws, losses, points,
            gf, ga, form, postponements, suspended)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (username) DO NOTHING`,
          [p.name, p.username, p.phone || '', p.played || 0, p.wins || 0, p.draws || 0,
           p.losses || 0, p.points || 0, p.gf || 0, p.ga || 0,
           JSON.stringify(p.form || []), p.postponements ?? 20, p.suspended || false]
        );
      }
    }
    if (fixtures?.length) {
      await query('DELETE FROM fixtures');
      for (const f of fixtures) {
        await query(
          'INSERT INTO fixtures (id, home, away, scheduled_date, postponed_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
          [f.id, f.home, f.away, f.scheduledDate || null, f.postponedBy || null]
        );
      }
    }
    if (results?.length) {
      await query('DELETE FROM matches');
      for (const r of results) {
        await query(
          `INSERT INTO matches (id, uid, home, away, result, home_goals, away_goals, match_date, image_url, logged_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [r.id, r.uid || null, r.home, r.away, r.result, r.homeGoals || r.home_goals || 0,
           r.awayGoals || r.away_goals || 0, r.date, r.imageUrl || r.image_url || null,
           r.loggedAt || new Date().toISOString()]
        );
      }
    }
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'backup_imported',
       { players: players?.length, fixtures: fixtures?.length, results: results?.length }, req.ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports.backupRouter = backupRouter;
