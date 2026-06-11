/* ================================================================
   routes/users.js — Staff management (owner-only)
================================================================ */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

// GET /api/users — all users (owner only)
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at, u.last_login,
              c.username AS created_by_name
       FROM users u LEFT JOIN users c ON c.id = u.created_by
       ORDER BY u.role DESC, u.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users — add staff member (owner only)
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { username, displayName, password, role } = req.body;
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: 'Username and password (min 6 chars) required' });
  if (!['admin', 'owner'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or owner' });
  try {
    const existing = await query('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
    if (existing.rows.length)
      return res.status(409).json({ error: `Username "${username}" already taken` });

    const hash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (username, display_name, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [username.trim().toLowerCase(), displayName || username, hash, role, req.user.id]
    );

    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'user_created',
       { newUser: username, role }, req.ip]
    );

    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at, u.last_login,
              c.username AS created_by_name
       FROM users u LEFT JOIN users c ON c.id = u.created_by
       ORDER BY u.role DESC, u.created_at ASC`
    );
    res.status(201).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id — deactivate user (owner only; cannot deactivate self)
router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id)
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [targetId]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'user_deactivated',
       { targetUser: rows[0].username }, req.ip]
    );
    const { rows: updated } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at, u.last_login,
              c.username AS created_by_name
       FROM users u LEFT JOIN users c ON c.id = u.created_by
       ORDER BY u.role DESC, u.created_at ASC`
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/password — reset password (owner resets others; anyone resets own)
router.put('/:id/password', requireAuth, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'owner' && targetId !== req.user.id)
    return res.status(403).json({ error: 'You can only reset your own password' });

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, targetId]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'password_reset',
       { targetId }, req.ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/reactivate — reactivate user (owner only)
router.put('/:id/reactivate', requireAuth, requireOwner, async (req, res) => {
  const targetId = parseInt(req.params.id);
  try {
    await query('UPDATE users SET is_active = TRUE WHERE id = $1', [targetId]);
    await query(
      'INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'user_reactivated', { targetId }, req.ip]
    );
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at, u.last_login,
              c.username AS created_by_name
       FROM users u LEFT JOIN users c ON c.id = u.created_by
       ORDER BY u.role DESC, u.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
