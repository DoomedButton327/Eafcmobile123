# Mettlestate × EA FC Mobile League v2

Full-stack league management platform. Node.js + Express + PostgreSQL backend, served alongside the existing frontend. Deployable to [Render.com](https://render.com) in under 10 minutes.

---

## What's New in v2

| Feature | v1 (GitHub Pages) | v2 (Render) |
|---|---|---|
| Data storage | `localStorage` + GitHub JSON | PostgreSQL database |
| Authentication | None (open admin) | JWT login — you + helpers |
| Staff accounts | Single user | Add unlimited helpers |
| Activity log | None | Full audit trail (who did what, when) |
| Images | GitHub repo uploads | Stored in database (up to 5MB each) |
| Hosting | GitHub Pages (free) | Render.com (free tier) |
| API | None | Full REST API |

---

## Project Structure

```
eafc-league/
├── backend/                 ← Node.js server
│   ├── server.js            ← Express app + static file serving
│   ├── package.json
│   ├── .env.example         ← Copy to .env for local dev
│   ├── seed.js              ← One-time data migration script
│   ├── db/
│   │   ├── index.js         ← PostgreSQL connection pool
│   │   └── schema.sql       ← Tables (auto-created on startup)
│   ├── middleware/
│   │   └── auth.js          ← JWT verification
│   └── routes/
│       ├── auth.js          ← Login / me / change-password
│       ├── players.js       ← Player CRUD + batch stats
│       ├── fixtures.js      ← Fixture CRUD + batch replace
│       ├── matches.js       ← Match results + image upload
│       ├── users.js         ← Staff management (owner only)
│       └── settings.js      ← Settings, audit log, backup
├── frontend/                ← Static HTML/CSS/JS (unchanged design)
│   ├── index.html           ← Admin app (requires login)
│   ├── login.html           ← Login page
│   ├── leaderboard.html     ← Public leaderboard (no login)
│   ├── css/                 ← Existing stylesheets (unchanged)
│   └── js/
│       ├── api.js           ← NEW: replaces storage.js + github.js
│       ├── app.js           ← Modified: auth guard + API loading
│       ├── admin.js         ← Modified: staff management + audit log
│       ├── players.js       ← Modified: API-backed mutations
│       ├── fixtures.js      ← Modified: API-backed mutations
│       ├── results.js       ← Modified: API-backed + image upload
│       └── ...              ← Everything else unchanged
├── render.yaml              ← Auto-deploy config for Render
└── README.md
```

---

## Deploy to Render (10 min)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/eafc-league.git
git push -u origin main
```

### 2. Create Render Blueprint

1. Go to [render.com](https://render.com) → **New** → **Blueprint**
2. Connect your GitHub account and select the repo
3. Render reads `render.yaml` automatically and creates:
   - A **Web Service** (Node.js)
   - A **PostgreSQL database**

### 3. Set Environment Variables

In the Render dashboard for the web service, add:

| Key | Value |
|---|---|
| `OWNER_PASSWORD` | Your secure password |
| `OWNER_USERNAME` | `tyron` (or change it) |
| `OWNER_DISPLAY_NAME` | `Tyron (Owner)` |

> `JWT_SECRET` and `DATABASE_URL` are set automatically by Render.

### 4. First Deploy

- Render builds and starts the server
- On first boot, it creates the database tables and your owner account
- Visit `https://your-app.onrender.com/login.html`
- Log in with your `OWNER_USERNAME` / `OWNER_PASSWORD`

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (or use a free [Supabase](https://supabase.com) database)

### Setup

```bash
# Install backend dependencies
cd backend
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your DATABASE_URL and a JWT_SECRET
```

### .env (for local dev)

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/eafc_league
JWT_SECRET=any-long-random-string-for-local-dev
NODE_ENV=development
PORT=3000
OWNER_USERNAME=tyron
OWNER_PASSWORD=test123
OWNER_DISPLAY_NAME=Tyron (Owner)
```

### Run

```bash
cd backend
npm run dev   # uses nodemon for auto-restart
```

Visit `http://localhost:3000` — it serves both the API and the frontend.

---

## Migrate Existing Data

If you have existing data in the JSON files:

1. Open `backend/seed.js`
2. Paste your `players.json` data into `existingPlayers`
3. Paste your `fixtures.json` data into `existingFixtures`
4. Combine all your `matches.json` files into `existingMatches`
5. Run:

```bash
cd backend
node seed.js
```

The seed script skips duplicate usernames/IDs so it's safe to run multiple times.

---

## Adding Staff / Helpers

1. Log in as owner
2. Go to **Admin** → **Staff Management**
3. Fill in username, display name, password, and role
4. Click **Add Staff Member**
5. Share the login URL + credentials with your helper

**Roles:**
- `admin` — Can log scores, manage players, fixtures, view audit log
- `owner` — Full access + staff management + danger zone

---

## Public Leaderboard

The leaderboard at `/leaderboard.html` is **public** (no login required).  
Share the URL: `https://your-app.onrender.com/leaderboard.html`

It auto-refreshes every 5 minutes from the `/api/leaderboard` endpoint.

---

## API Reference

All protected routes require `Authorization: Bearer <token>` header.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login → returns JWT |
| `GET` | `/api/auth/me` | ✓ | Current user info |
| `GET` | `/api/state` | ✓ | Full state (players + fixtures + matches + settings) |
| `GET` | `/api/leaderboard` | — | Public leaderboard data |
| `GET` | `/api/players` | — | All players |
| `POST` | `/api/players` | ✓ | Add player |
| `DELETE` | `/api/players/:username` | ✓ | Remove player |
| `POST` | `/api/players/:username/suspend` | ✓ | Toggle suspension |
| `PUT` | `/api/players/batch` | ✓ | Batch stats update |
| `GET` | `/api/fixtures` | — | All fixtures |
| `POST` | `/api/fixtures` | ✓ | Add fixture |
| `PUT` | `/api/fixtures/batch` | ✓ | Replace all fixtures |
| `DELETE` | `/api/fixtures/:id` | ✓ | Remove fixture |
| `POST` | `/api/fixtures/:id/postpone` | ✓ | Postpone fixture |
| `POST` | `/api/fixtures/:id/resume` | ✓ | Resume fixture |
| `GET` | `/api/matches` | — | All results |
| `POST` | `/api/matches` | ✓ | Log result (supports image upload) |
| `PUT` | `/api/matches/:id` | ✓ | Edit result |
| `DELETE` | `/api/matches/:id` | ✓ | Delete result |
| `GET` | `/api/users` | Owner | List staff |
| `POST` | `/api/users` | Owner | Add staff |
| `DELETE` | `/api/users/:id` | Owner | Deactivate staff |
| `GET` | `/api/audit` | ✓ | Activity log |
| `GET` | `/api/settings` | ✓ | Get settings |
| `POST` | `/api/settings` | ✓ | Save setting |
| `GET` | `/api/backup/export` | ✓ | Export full backup |
| `POST` | `/api/backup/import` | Owner | Restore backup |

---

## Render Free Tier Notes

- **Web service**: Spins down after 15 min inactivity → cold start ~30s
- **PostgreSQL**: 256MB storage, 1GB RAM, 90 days free then pauses (upgrade to $7/mo or re-create)
- **Images**: Stored as base64 in PostgreSQL — each image ≈ 30–80KB, so 200 matches ≈ 10MB well within limits

**To keep the service awake**: Use [UptimeRobot](https://uptimerobot.com) to ping `https://your-app.onrender.com/api/leaderboard` every 14 minutes.

---

## Changelog

### v2.0 (Current)
- Full backend with PostgreSQL
- JWT authentication + role-based access
- Staff management (add/remove/reset password)
- Activity audit log
- Match image upload to database
- Discord webhook stored server-side
- Public leaderboard served from API
- One-click Render deploy via `render.yaml`

### v1.0 (Original)
- Static GitHub Pages site
- localStorage + GitHub API sync
- No authentication
