const jwt = require("jsonwebtoken")
const httpError = require("../utils/httpError")

const JWT_SECRET = process.env.JWT_SECRET || "mingzi-dev-secret"
const TOKEN_TTL = "7d"

const issueToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL })

const authenticate = (options = { required: true }) => (req, _res, next) => {
  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    if (options.required === false) {
      req.user = null
      return next()
    }
    return next(httpError(401, "Missing authentication token", "AUTH_MISSING"))
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    next(httpError(401, "Invalid or expired token", "AUTH_INVALID"))
  }
}

const requireAuth = authenticate({ required: true })

const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== "admin") {
    return next(httpError(403, "Admin privileges required", "AUTH_FORBIDDEN"))
  }
  return next()
}

module.exports = {
  issueToken,
  authenticate,
  requireAuth,
  requireAdmin,
}
