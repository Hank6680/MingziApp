const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  )

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  )

router.use(requireAuth, requireAdmin)

// Price history for a product
router.get("/price-history/:productId", async (req, res, next) => {
  const productId = Number(req.params.productId)
  if (!Number.isInteger(productId) || productId <= 0) {
    return next(httpError(400, "Invalid productId", "VALIDATION_ERROR"))
  }
  try {
    const product = await dbGet("SELECT id, name FROM products WHERE id = ?", [productId])
    if (!product) return next(httpError(404, "Product not found", "NOT_FOUND"))

    const history = await dbAll(
      "SELECT * FROM price_history WHERE productId = ? ORDER BY changedAt DESC LIMIT 50",
      [productId]
    )
    return res.json({ product, items: history })
  } catch (err) {
    return next(err)
  }
})

// Audit logs
router.get("/audit-logs", async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const entity = req.query.entity || null
  try {
    let sql = "SELECT * FROM audit_logs"
    const params = []
    if (entity) {
      sql += " WHERE entity = ?"
      params.push(entity)
    }
    sql += " ORDER BY id DESC LIMIT ?"
    params.push(limit)
    const rows = await dbAll(sql, params)
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

// Database info
router.get("/db-info", async (_req, res, next) => {
  try {
    const tables = await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    const counts = {}
    for (const t of tables) {
      const row = await dbGet(`SELECT COUNT(*) as count FROM ${t.name}`)
      counts[t.name] = row.count
    }
    return res.json({ tables: counts })
  } catch (err) {
    return next(err)
  }
})

module.exports = router
