const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  )

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  )

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  )

router.use(requireAuth)
router.use(requireAdmin)

router.get("/summary", async (_req, res, next) => {
  try {
    const rows = await dbAll(
      `SELECT id, name, unit, warehouseType, price, isAvailable, stock
       FROM products
       ORDER BY name ASC`
    )
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

router.post("/inbound", async (req, res, next) => {
  const { productId, quantity, logDate, remark } = req.body || {}

  const normalizedProductId = Number(productId)
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    return next(httpError(400, "productId must be a positive integer", "VALIDATION_ERROR"))
  }

  const normalizedQuantity = Number(quantity)
  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    return next(httpError(400, "quantity must be a positive integer", "VALIDATION_ERROR"))
  }

  let normalizedDate = new Date()
  if (logDate != null) {
    const parsed = new Date(logDate)
    if (Number.isNaN(parsed.getTime())) {
      return next(httpError(400, "logDate must be a valid date", "VALIDATION_ERROR"))
    }
    normalizedDate = parsed
  }

  const remarkText = remark == null ? null : String(remark).slice(0, 500)

  try {
    await dbRun("BEGIN IMMEDIATE")

    const product = await dbGet("SELECT id, stock FROM products WHERE id = ?", [normalizedProductId])
    if (!product) {
      await dbRun("ROLLBACK")
      return next(httpError(404, "Product not found", "NOT_FOUND"))
    }

    await dbRun("UPDATE products SET stock = stock + ? WHERE id = ?", [normalizedQuantity, normalizedProductId])
    await dbRun(
      `INSERT INTO inventory_logs (productId, type, quantity, logDate, remark)
       VALUES (?, 'in', ?, ?, ?)`,
      [normalizedProductId, normalizedQuantity, normalizedDate.toISOString(), remarkText]
    )

    await dbRun("COMMIT")

    const updated = await dbGet(
      "SELECT id, name, unit, warehouseType, price, stock FROM products WHERE id = ?",
      [normalizedProductId]
    )

    return res.status(201).json({ item: updated })
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {})
    return next(err)
  }
})

module.exports = router
