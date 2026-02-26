const { Router } = require("express")
const db = require("../db")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = Router()

const allRows = (sql) =>
  new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)))
  )

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  )

// GET /api/backup/export — admin only, returns full database dump
router.get("/export", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [
      products, users, orders, orderItems, orderChangeLogs, inventoryLogs,
      suppliers, receivingBatches, receivingBatchItems, supplierInvoices, supplierInvoiceItems,
    ] = await Promise.all([
        allRows("SELECT * FROM products"),
        allRows("SELECT * FROM users"),
        allRows("SELECT * FROM orders"),
        allRows("SELECT * FROM order_items"),
        allRows("SELECT * FROM order_change_logs"),
        allRows("SELECT * FROM inventory_logs"),
        allRows("SELECT * FROM suppliers"),
        allRows("SELECT * FROM receiving_batches"),
        allRows("SELECT * FROM receiving_batch_items"),
        allRows("SELECT * FROM supplier_invoices"),
        allRows("SELECT * FROM supplier_invoice_items"),
      ])

    res.json({
      exportedAt: new Date().toISOString(),
      tables: {
        products, users, orders, orderItems, orderChangeLogs, inventoryLogs,
        suppliers, receivingBatches, receivingBatchItems, supplierInvoices, supplierInvoiceItems,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/backup/import — admin only, restores from dump
router.post("/import", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { tables } = req.body
    if (!tables) return res.status(400).json({ error: { message: "Missing tables" } })

    const importTable = async (name, rows, columns) => {
      if (!rows || !rows.length) return 0
      await run(`DELETE FROM ${name}`)
      const placeholders = columns.map(() => "?").join(", ")
      const stmt = db.prepare(`INSERT INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`)
      for (const row of rows) {
        await new Promise((resolve, reject) =>
          stmt.run(columns.map((c) => row[c] ?? null), (err) => (err ? reject(err) : resolve()))
        )
      }
      await new Promise((resolve, reject) => stmt.finalize((err) => (err ? reject(err) : resolve())))
      return rows.length
    }

    const results = {}

    // Import order matters (foreign keys)
    results.products = await importTable("products", tables.products, [
      "id", "name", "unit", "warehouseType", "price", "isAvailable", "stock", "notes",
    ])
    results.users = await importTable("users", tables.users, [
      "id", "username", "password", "role", "customerId",
    ])
    results.orders = await importTable("orders", tables.orders, [
      "id", "customerId", "deliveryDate", "status", "tripNumber",
      "stockDeducted", "pendingReview", "lastModifiedAt", "lastReviewedAt",
    ])
    results.orderItems = await importTable("order_items", tables.orderItems, [
      "id", "orderId", "productId", "qtyOrdered", "qtyPicked", "status",
      "picked", "outOfStock", "unitPrice",
    ])
    results.orderChangeLogs = await importTable("order_change_logs", tables.orderChangeLogs, [
      "id", "orderId", "type", "detail", "createdAt", "readAt",
    ])
    results.inventoryLogs = await importTable("inventory_logs", tables.inventoryLogs, [
      "id", "productId", "type", "quantity", "logDate", "remark",
      "partnerName", "reason", "refOrderId", "createdAt", "batchId",
    ])
    results.suppliers = await importTable("suppliers", tables.suppliers, [
      "id", "name", "contact", "notes", "createdAt",
    ])
    results.receivingBatches = await importTable("receiving_batches", tables.receivingBatches, [
      "id", "batchNo", "supplierId", "receivedDate", "notes", "reconcileStatus", "createdAt",
    ])
    results.receivingBatchItems = await importTable("receiving_batch_items", tables.receivingBatchItems, [
      "id", "batchId", "productId", "productName", "quantity", "createdAt",
    ])
    results.supplierInvoices = await importTable("supplier_invoices", tables.supplierInvoices, [
      "id", "invoiceNo", "supplierId", "invoiceDate", "periodStart", "periodEnd",
      "totalAmount", "notes", "status", "createdAt",
    ])
    results.supplierInvoiceItems = await importTable("supplier_invoice_items", tables.supplierInvoiceItems, [
      "id", "invoiceId", "productName", "productId", "quantity", "unitPrice",
      "amount", "matchedQty", "matchStatus", "discrepancyNotes",
    ])

    res.json({ ok: true, imported: results })
  } catch (err) {
    next(err)
  }
})

module.exports = router
