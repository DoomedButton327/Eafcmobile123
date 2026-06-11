/* ================================================================
   routes/matches.js — Log / edit / delete match results
================================================================ */
const router  = require('express').Router();
const multer  = require('multer');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Store images in memory as base64
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

function rowToMatch(r) {
  return {
    id: Number(r.id),
    uid: r.uid,
    home: r.home,
    away: r.away,
    result: r.result,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    date: r.match_date ? r.match_date.toISOString().slice(0, 10) : null,
    imageUrl: r.image_url || null,
    imageData: r.image_data || null,
    loggedAt: r.logged_at,
    editedAt: r.edited_at || null,
    loggedBy: r.logged_by_name || null,
    editedBy: r.edited_by_name || null,
  };
}

// GET /api/matches — public
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT m.*,
        lu.username AS logged_by_name,
        eu.username AS edited_by_name
      FROM matches m
      LEFT JOIN users lu ON lu.id = m.logged_by
      LEFT JOIN users eu ON eu.id = m.edited_by
      ORDER BY m.match_date DESC, m.logged_at DESC
    `);
    res.json(rows.map(rowToMatch));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/matches — log a result (supports multipart for image upload)
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const body = req.body;
    const { id, uid, home, away, result, homeGoals, awayGoals, date, imageUrl } = body;
    if (!home || !away || !result || !date)
      return res.status(400).json({ error: 'home, away, result, date required' });
    if (!['home', 'away', 'draw'].includes(result))
      return res.status(400).json({ error: 'result must be home|away|draw' });

    const matchId = id || Date.now();
    let imgData = null;
    let imgUrl  = imageUrl || null;

    if (req.file) {
      // Store image as base64 text in DB
      imgData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (body.imageData) {
      imgData = body.imageData; // Already base64 from frontend
    }

    await query(
      `INSERT INTO matches (id, uid, home, away, result, home_goals, away_goals, match_date,
        image_url, image_data, logged_by, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [matchId, uid || null, home, away, result,
       parseInt(homeGoals) || 0, parseInt(awayGoals) || 0,
       date, imgUrl, imgData, req.user.id]
    );

    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'match_logged',
       { home, away, homeGoals, awayGoals, result, date }, req.ip]
    );

    // Return full updated state so frontend can sync
    const [matchRows, playerRows, fixtureRows] = await Promise.all([
      query(`SELECT m.*, lu.username AS logged_by_name, eu.username AS edited_by_name
             FROM matches m LEFT JOIN users lu ON lu.id=m.logged_by
             LEFT JOIN users eu ON eu.id=m.edited_by
             ORDER BY m.match_date DESC, m.logged_at DESC`),
      query('SELECT * FROM players ORDER BY points DESC, (gf-ga) DESC, gf DESC'),
      query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC'),
    ]);

    res.status(201).json({
      matches:  matchRows.rows.map(rowToMatch),
      players:  playerRows.rows.map(r => ({ name: r.name, username: r.username, phone: r.phone || '',
        played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, points: r.points,
        gf: r.gf, ga: r.ga, form: r.form || [], postponements: r.postponements, suspended: r.suspended })),
      fixtures: fixtureRows.rows.map(r => ({ id: Number(r.id), home: r.home, away: r.away,
        scheduledDate: r.scheduled_date?.toISOString().slice(0, 10) || null,
        postponedBy: r.postponed_by || null })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/matches/:id — edit a result
router.put('/:id', requireAuth, async (req, res) => {
  const id = BigInt(req.params.id);
  const { homeGoals, awayGoals } = req.body;
  if (homeGoals === undefined || awayGoals === undefined)
    return res.status(400).json({ error: 'homeGoals and awayGoals required' });
  try {
    const { rows } = await query('SELECT * FROM matches WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Match not found' });
    const hg = parseInt(homeGoals);
    const ag = parseInt(awayGoals);
    const newResult = hg > ag ? 'home' : ag > hg ? 'away' : 'draw';
    await query(
      `UPDATE matches SET home_goals=$1, away_goals=$2, result=$3,
       edited_at=NOW(), edited_by=$4 WHERE id=$5`,
      [hg, ag, newResult, req.user.id, id]
    );
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'match_edited',
       { home: rows[0].home, away: rows[0].away,
         old: `${rows[0].home_goals}-${rows[0].away_goals}`,
         new: `${hg}-${ag}` }, req.ip]
    );
    const { rows: updated } = await query(`
      SELECT m.*, lu.username AS logged_by_name, eu.username AS edited_by_name
      FROM matches m LEFT JOIN users lu ON lu.id=m.logged_by
      LEFT JOIN users eu ON eu.id=m.edited_by
      ORDER BY m.match_date DESC, m.logged_at DESC`);
    res.json(updated.map(rowToMatch));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/matches/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const id = BigInt(req.params.id);
  try {
    const { rows } = await query('SELECT * FROM matches WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Match not found' });
    await query('DELETE FROM matches WHERE id = $1', [id]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'match_deleted',
       { home: rows[0].home, away: rows[0].away,
         score: `${rows[0].home_goals}-${rows[0].away_goals}` }, req.ip]
    );
    const { rows: updated } = await query(`
      SELECT m.*, lu.username AS logged_by_name, eu.username AS edited_by_name
      FROM matches m LEFT JOIN users lu ON lu.id=m.logged_by
      LEFT JOIN users eu ON eu.id=m.edited_by
      ORDER BY m.match_date DESC, m.logged_at DESC`);
    res.json(updated.map(rowToMatch));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
