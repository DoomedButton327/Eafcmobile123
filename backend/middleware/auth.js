/* ================================================================
   middleware/auth.js — JWT verification + role guards
================================================================ */
const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-in-prod';

/** Verify JWT and attach req.user. Returns 401 if invalid/missing. */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require owner role. Must be used after requireAuth. */
function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
  next();
}

/** Sign a JWT for a user record. */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    SECRET(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

module.exports = { requireAuth, requireOwner, signToken };
