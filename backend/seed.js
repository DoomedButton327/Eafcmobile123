/* ================================================================
   seed.js — Migrate existing JSON data into PostgreSQL
   Run once after setup: node seed.js
================================================================ */
require('dotenv').config();
const { initSchema, query } = require('./db');
const bcrypt = require('bcryptjs');

// ── Paste your existing data here ────────────────────────────
// Or point to JSON files like: const players = require('../data/players.json');
// The data below is from your EAFC-mobile-leagues and leaderboard repos.

const existingPlayers = [
  // Replace with your actual players.json content
  // Example:
  // { "name": "Moosa", "username": "CRANK_", "phone": "+27699906125",
  //   "played": 25, "wins": 20, "draws": 2, "losses": 3, "points": 62,
  //   "gf": 60, "ga": 14, "form": ["L","W","W","W","W"], "postponements": 12, "suspended": false }
];

const existingFixtures = [
  // Replace with your actual fixtures.json content
];

const existingMatches = [
  // Replace with your actual matches (all matches.json files combined)
  // Each entry: { id, uid, home, away, result, homeGoals, awayGoals, date, imageUrl, loggedAt }
];

async function seed() {
  try {
    await initSchema();
    console.log('[Seed] Schema ready.');

    // ── Players ───────────────────────────────────────────────
    if (existingPlayers.length) {
      let count = 0;
      for (const p of existingPlayers) {
        const exists = await query('SELECT id FROM players WHERE username = $1', [p.username]);
        if (exists.rows.length) { console.log(`  Skip player: ${p.username} (exists)`); continue; }
        await query(
          `INSERT INTO players (name, username, phone, played, wins, draws, losses, points,
            gf, ga, form, postponements, suspended)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [p.name, p.username, p.phone || '', p.played || 0, p.wins || 0, p.draws || 0,
           p.losses || 0, p.points || 0, p.gf || 0, p.ga || 0,
           JSON.stringify(p.form || []), p.postponements ?? 20, p.suspended || false]
        );
        count++;
      }
      console.log(`[Seed] Players: inserted ${count}`);
    }

    // ── Fixtures ──────────────────────────────────────────────
    if (existingFixtures.length) {
      let count = 0;
      for (const f of existingFixtures) {
        const exists = await query('SELECT id FROM fixtures WHERE id = $1', [f.id]);
        if (exists.rows.length) continue;
        await query(
          'INSERT INTO fixtures (id, home, away, scheduled_date, postponed_by) VALUES ($1,$2,$3,$4,$5)',
          [f.id, f.home, f.away, f.scheduledDate || null, f.postponedBy || null]
        );
        count++;
      }
      console.log(`[Seed] Fixtures: inserted ${count}`);
    }

    // ── Matches ───────────────────────────────────────────────
    if (existingMatches.length) {
      let count = 0;
      for (const m of existingMatches) {
        const exists = await query('SELECT id FROM matches WHERE id = $1', [m.id]);
        if (exists.rows.length) continue;
        await query(
          `INSERT INTO matches (id, uid, home, away, result, home_goals, away_goals,
            match_date, image_url, logged_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [m.id, m.uid || null, m.home, m.away, m.result,
           m.homeGoals || 0, m.awayGoals || 0, m.date,
           m.imageUrl || null, m.loggedAt || new Date().toISOString()]
        );
        count++;
      }
      console.log(`[Seed] Matches: inserted ${count}`);
    }

    console.log('[Seed] ✅ Complete. You can now start the server.');
    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err);
    process.exit(1);
  }
}

seed();
