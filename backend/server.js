/* ================================================================
   METTLESTATE × EA FC MOBILE LEAGUE — server.js
   Node.js + Express backend with PostgreSQL
   Serves static frontend from ../frontend
================================================================ */
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const rateLimit  = require('express-rate-limit');
const { initSchema, query } = require('./db');

// ── Routes ────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const playerRoutes   = require('./routes/players');
const fixtureRoutes  = require('./routes/fixtures');
const matchRoutes    = require('./routes/matches');
const userRoutes     = require('./routes/users');
const { settingsRouter, auditRouter, backupRouter } = require('./routes/settings');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.set('trust proxy', 1); // Render sits behind a proxy

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));

// Parse JSON + URL-encoded — large limit for base64 images
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Rate limit: 200 requests/15 min per IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests — try again in a bit.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Tighter limit on login attempts
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts — try again in 15 minutes.' },
}));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/players',  playerRoutes);
app.use('/api/fixtures', fixtureRoutes);
app.use('/api/matches',  matchRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/settings', settingsRouter);
app.use('/api/audit',    auditRouter);
app.use('/api/backup',   backupRouter);

// ── Public leaderboard (no auth) ─────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [playerRes, matchRes] = await Promise.all([
      query('SELECT * FROM players ORDER BY points DESC, (gf-ga) DESC, gf DESC'),
      query('SELECT COUNT(*) AS total FROM matches'),
    ]);
    res.json({
      players: playerRes.rows.map(r => ({
        name: r.name, username: r.username, played: r.played,
        wins: r.wins, draws: r.draws, losses: r.losses, points: r.points,
        gf: r.gf, ga: r.ga, form: r.form || [], suspended: r.suspended,
      })),
      matchesPlayed: parseInt(matchRes.rows[0].total),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full state endpoint (one fetch for app init) ──────────────
const { requireAuth } = require('./middleware/auth');
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const [p, f, m, s] = await Promise.all([
      query('SELECT * FROM players ORDER BY points DESC, (gf-ga) DESC, gf DESC'),
      query('SELECT * FROM fixtures ORDER BY scheduled_date ASC NULLS LAST, id ASC'),
      query(`SELECT m.*, lu.username AS logged_by_name, eu.username AS edited_by_name
             FROM matches m LEFT JOIN users lu ON lu.id=m.logged_by
             LEFT JOIN users eu ON eu.id=m.edited_by
             ORDER BY m.match_date DESC, m.logged_at DESC`),
      query('SELECT key, value FROM settings ORDER BY key'),
    ]);

    const settings = {};
    s.rows.forEach(r => { settings[r.key] = r.value; });

    res.json({
      players: p.rows.map(r => ({
        name: r.name, username: r.username, phone: r.phone || '',
        played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
        points: r.points, gf: r.gf, ga: r.ga, form: r.form || [],
        postponements: r.postponements, suspended: r.suspended,
      })),
      fixtures: f.rows.map(r => ({
        id: Number(r.id), home: r.home, away: r.away,
        scheduledDate: r.scheduled_date?.toISOString().slice(0, 10) || null,
        postponedBy: r.postponed_by || null,
      })),
      results: m.rows.map(r => ({
        id: Number(r.id), uid: r.uid, home: r.home, away: r.away,
        result: r.result, homeGoals: r.home_goals, awayGoals: r.away_goals,
        date: r.match_date?.toISOString().slice(0, 10) || null,
        imageUrl: r.image_url || null,
        imageData: r.image_data || null,
        loggedAt: r.logged_at, editedAt: r.edited_at || null,
        loggedBy: r.logged_by_name || null,
      })),
      settings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Static frontend ───────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// SPA fallback — serve index.html for unknown routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  try {
    await initSchema();

    // Create default owner account if no users exist
    const { rows } = await query('SELECT COUNT(*) AS cnt FROM users');
    if (parseInt(rows[0].cnt) === 0) {
      const username     = (process.env.OWNER_USERNAME || 'tyron').toLowerCase();
      const password     = process.env.OWNER_PASSWORD  || 'change-this-password';
      const displayName  = process.env.OWNER_DISPLAY_NAME || 'Owner';
      const hash = await bcrypt.hash(password, 12);
      await query(
        'INSERT INTO users (username, display_name, password_hash, role) VALUES ($1,$2,$3,$4)',
        [username, displayName, hash, 'owner']
      );
      console.log(`[Setup] Owner account created → username: "${username}"`);
      console.log('[Setup] ⚠  Change the password immediately via Admin → Staff → Change Password');
    }

    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[Startup Error]', err);
    process.exit(1);
  }
}

start();
