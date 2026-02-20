const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { issueToken } = require("../middleware/auth")

const router = express.Router()

router.post("/login", (req, res, next) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return next(httpError(400, "username and password are required", "VALIDATION_ERROR"))
  }

  db.get(
    "SELECT id, username, role, customerId FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (err) {
        return next(err)
      }
      if (!user) {
        return next(httpError(401, "Invalid credentials", "INVALID_CREDENTIALS"))
      }
      const token = issueToken({
        id: user.id,
        username: user.username,
        role: user.role,
        customerId: user.customerId,
      })
      return res.json({ token, user })
    }
  )
})

module.exports = router
