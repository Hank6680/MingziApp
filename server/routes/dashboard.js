const express = require("express")
const db = require("../db")
const { requireAuth, requireAdminOrManagerOrManager } = require("../middleware/auth")

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

router.use(requireAuth)

// Main dashboard stats
router.get("/stats", requireAdminOrManager, async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10)

    // Basic counts
    const productCount = await dbGet("SELECT COUNT(*) as total FROM products")
    const availableCount = await dbGet("SELECT COUNT(*) as total FROM products WHERE isAvailable = 1")
    const lowStockCount = await dbGet("SELECT COUNT(*) as total FROM products WHERE stock < 10 AND isAvailable = 1")

    // Order stats
    const todayOrders = await dbGet(
      "SELECT COUNT(*) as total FROM orders WHERE date(deliveryDate) = date(?)",
      [today]
    )
    const pendingOrders = await dbGet(
      "SELECT COUNT(*) as total FROM orders WHERE status IN ('created', 'confirmed')"
    )
    const revenueRow = await dbGet(
      "SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE status = 'completed'"
    )

    // 7-day order trends
    const trendDays = 7
    const trends = await dbAll(
      `SELECT date(deliveryDate) as day, COUNT(*) as orders, COALESCE(SUM(totalAmount), 0) as revenue
       FROM orders
       WHERE date(deliveryDate) >= date('now', '-${trendDays} days')
       GROUP BY date(deliveryDate)
       ORDER BY day ASC`
    )

    // Fill in missing days
    const trendData = []
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dayStr = d.toISOString().slice(0, 10)
      const found = trends.find((t) => t.day === dayStr)
      trendData.push({
        day: dayStr,
        orders: found ? found.orders : 0,
        revenue: found ? Math.round(found.revenue * 100) / 100 : 0,
      })
    }

    // Alerts
    const alerts = []

    // Low stock items (top 10)
    const lowStockItems = await dbAll(
      "SELECT id, name, stock, unit FROM products WHERE stock < 10 AND isAvailable = 1 ORDER BY stock ASC LIMIT 10"
    )
    if (lowStockItems.length > 0) {
      alerts.push({
        type: "low_stock",
        level: "warning",
        title: `${lowStockCount.total} 个商品库存不足`,
        items: lowStockItems,
      })
    }

    // Pending review orders
    const pendingReviewCount = await dbGet(
      "SELECT COUNT(*) as total FROM orders WHERE pendingReview = 1 AND status IN ('created','confirmed')"
    )
    if (pendingReviewCount.total > 0) {
      alerts.push({
        type: "pending_review",
        level: "info",
        title: `${pendingReviewCount.total} 个订单有待确认变更`,
      })
    }

    // Pending reconciliation invoices
    const pendingInvoices = await dbGet(
      "SELECT COUNT(*) as total FROM supplier_invoices WHERE status = 'pending'"
    )
    if (pendingInvoices.total > 0) {
      alerts.push({
        type: "pending_invoices",
        level: "info",
        title: `${pendingInvoices.total} 张供应商发票待对账`,
      })
    }

    // Today's trip summary
    const tripSummary = await dbAll(
      `SELECT o.tripNumber, COUNT(DISTINCT o.id) as orderCount,
              SUM(CASE WHEN oi.picked = 1 THEN 1 ELSE 0 END) as pickedItems,
              COUNT(oi.id) as totalItems
       FROM orders o
       JOIN order_items oi ON oi.orderId = o.id
       WHERE o.tripNumber IS NOT NULL AND o.status IN ('created', 'confirmed', 'shipped')
       GROUP BY o.tripNumber
       ORDER BY o.tripNumber`
    )

    return res.json({
      stats: {
        totalProducts: productCount.total,
        availableProducts: availableCount.total,
        lowStockProducts: lowStockCount.total,
        todayOrders: todayOrders.total,
        pendingOrders: pendingOrders.total,
        totalRevenue: Math.round(revenueRow.total * 100) / 100,
      },
      trends: trendData,
      alerts,
      tripSummary,
    })
  } catch (err) {
    return next(err)
  }
})

// Get distinct trip numbers
router.get("/trips", requireAdminOrManager, async (_req, res, next) => {
  try {
    const rows = await dbAll(
      "SELECT DISTINCT tripNumber FROM orders WHERE tripNumber IS NOT NULL AND tripNumber != '' ORDER BY tripNumber"
    )
    return res.json({ trips: rows.map((r) => r.tripNumber) })
  } catch (err) {
    return next(err)
  }
})

module.exports = router
