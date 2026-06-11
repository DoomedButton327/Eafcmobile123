/* ================================================================
   routes/fixtures.js — Fixture CRUD + batch replace
================================================================ */
const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

function rowToFixture(r) {
  return {
    id: Number(r.id),
    home: r.home,
    away: r.away,
    scheduledDate: r.scheduled_date ? r.scheduled_date.toISOString().slice(0, 10) : null,
    postponedBy: r.postponed_by || null,
  };
}

// GET /api/fixtures — public
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    res.json(rows.map(rowToFixture));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fixtures — add single fixture
router.post('/', requireAuth, async (req, res) => {
  const { id, home, away, scheduledDate } = req.body;
  if (!home || !away) return res.status(400).json({ error: 'Home and away required' });
  const fixtureId = id || Date.now();
  try {
    await query(
      'INSERT INTO fixtures (id, home, away, scheduled_date) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [fixtureId, home, away, scheduledDate || null]
    );
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'fixture_added', { home, away, date: scheduledDate }, req.ip]
    );
    const { rows } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    res.status(201).json(rows.map(rowToFixture));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fixtures/batch — replace entire fixtures list (after generate/draw)
router.put('/batch', requireAuth, async (req, res) => {
  const { fixtures, action } = req.body;
  if (!Array.isArray(fixtures)) return res.status(400).json({ error: 'Fixtures array required' });
  try {
    await query('DELETE FROM fixtures');
    for (const f of fixtures) {
      await query(
        'INSERT INTO fixtures (id, home, away, scheduled_date, postponed_by) VALUES ($1, $2, $3, $4, $5)',
        [f.id, f.home, f.away, f.scheduledDate || null, f.postponedBy || null]
      );
    }
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, action || 'fixtures_batch_updated', { count: fixtures.length }, req.ip]
    );
    const { rows } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    res.json(rows.map(rowToFixture));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/fixtures/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const id = BigInt(req.params.id);
  try {
    const { rows } = await query('SELECT * FROM fixtures WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Fixture not found' });
    await query('DELETE FROM fixtures WHERE id = $1', [id]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'fixture_removed',
       { home: rows[0].home, away: rows[0].away }, req.ip]
    );
    const { rows: updated } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    res.json(updated.map(rowToFixture));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fixtures/:id/postpone
router.post('/:id/postpone', requireAuth, async (req, res) => {
  const id = BigInt(req.params.id);
  const { byUser } = req.body;
  try {
    const { rows } = await query('SELECT * FROM fixtures WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Fixture not found' });
    await query('UPDATE fixtures SET postponed_by = $1, updated_at = NOW() WHERE id = $2', [byUser, id]);

    // Decrement postponements for the player who postponed
    if (byUser) {
      await query(
        'UPDATE players SET postponements = GREATEST(0, postponements - 1), updated_at = NOW() WHERE username = $1',
        [byUser]
      );
    }
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'fixture_postponed',
       { home: rows[0].home, away: rows[0].away, by: byUser }, req.ip]
    );
    const { rows: fixtures } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    const { rows: players } = await query('SELECT * FROM players ORDER BY points DESC, (gf - ga) DESC, gf DESC');
    res.json({
      fixtures: fixtures.map(rowToFixture),
      players: players.map(r => ({
        name: r.name, username: r.username, phone: r.phone || '',
        played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
        points: r.points, gf: r.gf, ga: r.ga, form: r.form || [],
        postponements: r.postponements, suspended: r.suspended,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fixtures/:id/resume
router.post('/:id/resume', requireAuth, async (req, res) => {
  const id = BigInt(req.params.id);
  try {
    const { rows } = await query('SELECT * FROM fixtures WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Fixture not found' });
    await query('UPDATE fixtures SET postponed_by = NULL, updated_at = NOW() WHERE id = $1', [id]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, req.user.username, 'fixture_resumed',
       { home: rows[0].home, away: rows[0].away }, req.ip]
    );
    const { rows: updated } = await query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC');
    res.json(updated.map(rowToFixture));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
