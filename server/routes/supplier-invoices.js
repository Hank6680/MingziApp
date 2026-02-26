const express = require("express")
const multer = require("multer")
const XLSX = require("xlsx")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

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

router.use(requireAuth, requireAdmin)

// ---------- helpers ----------

/**
 * Try to match an Excel product name to a product in our DB.
 * 1. Exact match on products.name
 * 2. Fuzzy LIKE match
 * Returns { productId, productName } or null
 */
async function resolveProduct(name) {
  if (!name) return null
  const trimmed = String(name).trim()
  if (!trimmed) return null

  // exact
  const exact = await dbGet("SELECT id, name FROM products WHERE name = ?", [trimmed])
  if (exact) return { productId: exact.id, productName: exact.name }

  // fuzzy
  const fuzzy = await dbGet("SELECT id, name FROM products WHERE name LIKE ?", [`%${trimmed}%`])
  if (fuzzy) return { productId: fuzzy.id, productName: fuzzy.name }

  return null
}

// ---------- POST /import ----------
router.post("/import", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return next(httpError(400, "请上传 Excel 文件", "VALIDATION_ERROR"))
    }

    const { supplierId, invoiceNo, periodStart, periodEnd, columnMap: columnMapRaw } = req.body || {}

    if (!supplierId) return next(httpError(400, "supplierId is required", "VALIDATION_ERROR"))

    const supplier = await dbGet("SELECT id FROM suppliers WHERE id = ?", [Number(supplierId)])
    if (!supplier) return next(httpError(404, "供应商不存在", "NOT_FOUND"))

    // Parse column map: { productName: 'A列名', quantity: 'B列名', unitPrice: 'C列名', amount: 'D列名' }
    let columnMap
    try {
      columnMap = typeof columnMapRaw === "string" ? JSON.parse(columnMapRaw) : columnMapRaw || {}
    } catch {
      return next(httpError(400, "columnMap must be valid JSON", "VALIDATION_ERROR"))
    }

    if (!columnMap.productName) {
      return next(httpError(400, "columnMap.productName is required", "VALIDATION_ERROR"))
    }

    // Parse Excel
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return next(httpError(400, "Excel 文件为空", "VALIDATION_ERROR"))

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" })
    if (!rows.length) return next(httpError(400, "Excel 无数据行", "VALIDATION_ERROR"))

    // Aggregate receiving batch items for this supplier in the date range
    const dateFilters = []
    const dateParams = [Number(supplierId)]
    if (periodStart) { dateFilters.push("rb.receivedDate >= ?"); dateParams.push(periodStart) }
    if (periodEnd) { dateFilters.push("rb.receivedDate <= ?"); dateParams.push(periodEnd) }
    const dateWhere = dateFilters.length ? ` AND ${dateFilters.join(" AND ")}` : ""

    const receivedSummary = await dbAll(
      `SELECT rbi.productId, rbi.productName, SUM(rbi.quantity) as totalQty
       FROM receiving_batch_items rbi
       JOIN receiving_batches rb ON rb.id = rbi.batchId
       WHERE rb.supplierId = ?${dateWhere}
       GROUP BY rbi.productId`,
      dateParams
    )

    // Build lookup: productId -> { productName, totalQty }
    const receivedMap = new Map()
    for (const r of receivedSummary) {
      receivedMap.set(r.productId, { productName: r.productName, totalQty: r.totalQty })
    }

    // Create invoice record
    await dbRun("BEGIN IMMEDIATE")

    const invoiceResult = await dbRun(
      `INSERT INTO supplier_invoices (invoiceNo, supplierId, invoiceDate, periodStart, periodEnd, totalAmount, notes, status)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending')`,
      [invoiceNo || null, Number(supplierId), new Date().toISOString(), periodStart || null, periodEnd || null]
    )
    const invoiceId = invoiceResult.lastID

    const items = []
    let totalAmount = 0

    for (const row of rows) {
      const rawName = row[columnMap.productName]
      if (!rawName || !String(rawName).trim()) continue

      const productName = String(rawName).trim()
      const quantity = columnMap.quantity ? Number(row[columnMap.quantity]) || 0 : 0
      const unitPrice = columnMap.unitPrice ? Number(row[columnMap.unitPrice]) || 0 : 0
      const amount = columnMap.amount ? Number(row[columnMap.amount]) || (quantity * unitPrice) : (quantity * unitPrice)

      totalAmount += amount

      // Try to resolve product
      const resolved = await resolveProduct(productName)
      const productId = resolved ? resolved.productId : null

      // Determine match status
      let matchStatus = "unmatched"
      let matchedQty = null

      if (productId && receivedMap.has(productId)) {
        const received = receivedMap.get(productId)
        matchedQty = received.totalQty
        if (quantity > 0 && Math.abs(received.totalQty - quantity) < 0.001) {
          matchStatus = "auto_confirmed"
        } else {
          matchStatus = "need_review"
        }
      }

      const itemResult = await dbRun(
        `INSERT INTO supplier_invoice_items
         (invoiceId, productName, productId, quantity, unitPrice, amount, matchedQty, matchStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, productName, productId, quantity, unitPrice, amount, matchedQty, matchStatus]
      )

      items.push({
        id: itemResult.lastID,
        invoiceId,
        productName,
        productId,
        quantity,
        unitPrice,
        amount,
        matchedQty,
        matchStatus,
        discrepancyNotes: null,
      })
    }

    // Update total amount
    await dbRun("UPDATE supplier_invoices SET totalAmount = ? WHERE id = ?", [totalAmount, invoiceId])

    await dbRun("COMMIT")

    // Summary counts
    const autoConfirmed = items.filter((i) => i.matchStatus === "auto_confirmed").length
    const needReview = items.filter((i) => i.matchStatus === "need_review").length
    const unmatched = items.filter((i) => i.matchStatus === "unmatched").length

    return res.status(201).json({
      invoice: {
        id: invoiceId,
        invoiceNo: invoiceNo || null,
        supplierId: Number(supplierId),
        totalAmount,
        status: "pending",
      },
      items,
      summary: { total: items.length, autoConfirmed, needReview, unmatched },
    })
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {})
    return next(err)
  }
})

// ---------- GET / ----------
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const filters = []
    const params = []

    if (req.query.supplierId) {
      filters.push("si.supplierId = ?")
      params.push(Number(req.query.supplierId))
    }
    if (req.query.status) {
      filters.push("si.status = ?")
      params.push(req.query.status)
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

    const countRow = await dbGet(
      `SELECT COUNT(*) as total FROM supplier_invoices si ${where}`,
      params
    )

    const rows = await dbAll(
      `SELECT si.*, s.name as supplierName,
        (SELECT COUNT(*) FROM supplier_invoice_items WHERE invoiceId = si.id) as itemCount,
        (SELECT COUNT(*) FROM supplier_invoice_items WHERE invoiceId = si.id AND matchStatus = 'auto_confirmed') as autoConfirmedCount,
        (SELECT COUNT(*) FROM supplier_invoice_items WHERE invoiceId = si.id AND matchStatus = 'need_review') as needReviewCount,
        (SELECT COUNT(*) FROM supplier_invoice_items WHERE invoiceId = si.id AND matchStatus = 'unmatched') as unmatchedCount
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplierId
       ${where}
       ORDER BY si.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return res.json({ total: countRow?.total ?? 0, items: rows })
  } catch (err) {
    return next(err)
  }
})

// ---------- GET /:id ----------
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return next(httpError(400, "Invalid invoice id", "VALIDATION_ERROR"))
    }

    const invoice = await dbGet(
      `SELECT si.*, s.name as supplierName
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplierId
       WHERE si.id = ?`,
      [id]
    )
    if (!invoice) return next(httpError(404, "账单不存在", "NOT_FOUND"))

    const items = await dbAll(
      `SELECT sii.*, p.unit, p.warehouseType
       FROM supplier_invoice_items sii
       LEFT JOIN products p ON p.id = sii.productId
       WHERE sii.invoiceId = ?
       ORDER BY sii.id`,
      [id]
    )

    return res.json({ invoice: { ...invoice, items } })
  } catch (err) {
    return next(err)
  }
})

// ---------- PATCH /:id/items/:itemId ----------
router.patch("/:id/items/:itemId", async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id)
    const itemId = Number(req.params.itemId)

    const item = await dbGet(
      "SELECT * FROM supplier_invoice_items WHERE id = ? AND invoiceId = ?",
      [itemId, invoiceId]
    )
    if (!item) return next(httpError(404, "明细不存在", "NOT_FOUND"))

    const { matchStatus, productId, discrepancyNotes } = req.body || {}

    const updates = []
    const params = []

    if (matchStatus) {
      const allowed = ["auto_confirmed", "manual_confirmed", "need_review", "unmatched", "ignored"]
      if (!allowed.includes(matchStatus)) {
        return next(httpError(400, "Invalid matchStatus", "VALIDATION_ERROR"))
      }
      updates.push("matchStatus = ?")
      params.push(matchStatus)
    }

    if (productId !== undefined) {
      if (productId !== null) {
        const product = await dbGet("SELECT id FROM products WHERE id = ?", [Number(productId)])
        if (!product) return next(httpError(404, "商品不存在", "NOT_FOUND"))
      }
      updates.push("productId = ?")
      params.push(productId)
    }

    if (discrepancyNotes !== undefined) {
      updates.push("discrepancyNotes = ?")
      params.push(discrepancyNotes)
    }

    if (!updates.length) {
      return next(httpError(400, "No fields to update", "VALIDATION_ERROR"))
    }

    params.push(itemId)
    await dbRun(`UPDATE supplier_invoice_items SET ${updates.join(", ")} WHERE id = ?`, params)

    const updated = await dbGet("SELECT * FROM supplier_invoice_items WHERE id = ?", [itemId])
    return res.json({ item: updated })
  } catch (err) {
    return next(err)
  }
})

// ---------- POST /:id/confirm ----------
router.post("/:id/confirm", async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id)

    const invoice = await dbGet("SELECT * FROM supplier_invoices WHERE id = ?", [invoiceId])
    if (!invoice) return next(httpError(404, "账单不存在", "NOT_FOUND"))

    await dbRun("BEGIN IMMEDIATE")

    // Confirm all auto_confirmed items
    await dbRun(
      `UPDATE supplier_invoice_items SET matchStatus = 'manual_confirmed'
       WHERE invoiceId = ? AND matchStatus IN ('auto_confirmed', 'need_review')`,
      [invoiceId]
    )

    // Update invoice status
    const remaining = await dbGet(
      `SELECT COUNT(*) as cnt FROM supplier_invoice_items
       WHERE invoiceId = ? AND matchStatus NOT IN ('manual_confirmed', 'ignored')`,
      [invoiceId]
    )

    const newStatus = (remaining?.cnt ?? 0) === 0 ? "confirmed" : "partial"
    await dbRun("UPDATE supplier_invoices SET status = ? WHERE id = ?", [newStatus, invoiceId])

    // Update related receiving batches reconcileStatus
    if (newStatus === "confirmed") {
      const periodStart = invoice.periodStart
      const periodEnd = invoice.periodEnd
      const dateFilters = []
      const dateParams = [invoice.supplierId]
      if (periodStart) { dateFilters.push("receivedDate >= ?"); dateParams.push(periodStart) }
      if (periodEnd) { dateFilters.push("receivedDate <= ?"); dateParams.push(periodEnd) }
      const dateWhere = dateFilters.length ? ` AND ${dateFilters.join(" AND ")}` : ""

      await dbRun(
        `UPDATE receiving_batches SET reconcileStatus = 'reconciled'
         WHERE supplierId = ?${dateWhere}`,
        dateParams
      )
    }

    await dbRun("COMMIT")

    const updated = await dbGet("SELECT * FROM supplier_invoices WHERE id = ?", [invoiceId])
    return res.json({ invoice: updated })
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {})
    return next(err)
  }
})

module.exports = router
