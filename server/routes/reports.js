const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdminOrManager } = require("../middleware/auth")

const router = express.Router()

router.use(requireAuth)
router.use(requireAdminOrManager)

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  )

// GET /api/reports/daily-summary?deliveryDate=YYYY-MM-DD
router.get("/daily-summary", async (req, res, next) => {
  const { deliveryDate } = req.query
  if (!deliveryDate) {
    return next(httpError(400, "deliveryDate query parameter is required", "VALIDATION_ERROR"))
  }

  try {
    const orders = await dbAll(
      "SELECT id, status, totalAmount FROM orders WHERE date(deliveryDate) = date(?)",
      [deliveryDate]
    )

    const orderCount = orders.length
    const totalAmount = Math.round(orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0) * 100) / 100
    const byStatus = {}
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
    }

    const orderIds = orders.map((o) => o.id)
    let items = { total: 0, picked: 0, outOfStock: 0, pending: 0 }

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(",")
      const itemRows = await dbAll(
        `SELECT picked, outOfStock FROM order_items WHERE orderId IN (${placeholders})`,
        orderIds
      )
      items.total = itemRows.length
      items.picked = itemRows.filter((i) => i.picked === 1).length
      items.outOfStock = itemRows.filter((i) => i.outOfStock === 1).length
      items.pending = items.total - items.picked - items.outOfStock
    }

    return res.json({ deliveryDate, orderCount, totalAmount, byStatus, items })
  } catch (err) {
    return next(err)
  }
})

// GET /api/reports/out-of-stock?deliveryDate=YYYY-MM-DD
router.get("/out-of-stock", async (req, res, next) => {
  const { deliveryDate } = req.query
  if (!deliveryDate) {
    return next(httpError(400, "deliveryDate query parameter is required", "VALIDATION_ERROR"))
  }

  try {
    const rows = await dbAll(
      `SELECT oi.id as itemId, oi.orderId, oi.productId, oi.qtyOrdered,
              o.customerId, o.deliveryDate, c.name as customerName,
              p.name as productName, p.unit as productUnit, p.warehouseType
       FROM order_items oi
       JOIN orders o ON o.id = oi.orderId
       LEFT JOIN customers c ON c.id = o.customerId
       JOIN products p ON p.id = oi.productId
       WHERE date(o.deliveryDate) = date(?) AND oi.outOfStock = 1`,
      [deliveryDate]
    )

    return res.json({ deliveryDate, count: rows.length, items: rows })
  } catch (err) {
    return next(err)
  }
})

module.exports = router
