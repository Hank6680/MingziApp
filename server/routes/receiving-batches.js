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

router.use(requireAuth, requireAdmin)

// ─── POST / — Create batch + multi-item inbound ─────────────────────────────

router.post("/", async (req, res, next) => {
  const { supplierId, receivedDate, notes, items } = req.body || {}

  // Validate supplierId
  const normalizedSupplierId = Number(supplierId)
  if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) {
    return next(httpError(400, "supplierId must be a positive integer", "VALIDATION_ERROR"))
  }

  // Validate receivedDate
  if (!receivedDate) {
    return next(httpError(400, "receivedDate is required", "VALIDATION_ERROR"))
  }
  const parsedDate = new Date(receivedDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return next(httpError(400, "receivedDate must be a valid date", "VALIDATION_ERROR"))
  }

  // Validate items array
  if (!Array.isArray(items) || items.length === 0) {
    return next(httpError(400, "items array is required and must not be empty", "VALIDATION_ERROR"))
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (typeof item !== "object" || item === null) {
      return next(httpError(400, `Item ${i + 1} must be an object`, "VALIDATION_ERROR"))
    }
    const pid = Number(item.productId)
    if (!Number.isInteger(pid) || pid <= 0) {
      return next(httpError(400, `Item ${i + 1} requires a positive integer productId`, "VALIDATION_ERROR"))
    }
    const qty = Number(item.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      return next(httpError(400, `Item ${i + 1} requires a positive quantity`, "VALIDATION_ERROR"))
    }
  }

  const notesText = notes != null ? String(notes).trim().slice(0, 500) : null

  try {
    await dbRun("BEGIN IMMEDIATE")

    try {
      // 1. Validate supplier exists
      const supplier = await dbGet("SELECT id, name FROM suppliers WHERE id = ?", [normalizedSupplierId])
      if (!supplier) {
        await dbRun("ROLLBACK")
        return next(httpError(404, "Supplier not found", "NOT_FOUND"))
      }

      // 2. Generate batchNo: RB-YYYYMMDD-XXXX
      const dateStr = parsedDate.getFullYear().toString() +
        String(parsedDate.getMonth() + 1).padStart(2, "0") +
        String(parsedDate.getDate()).padStart(2, "0")

      const countRow = await dbGet(
        "SELECT COUNT(*) as cnt FROM receiving_batches WHERE batchNo LIKE ?",
        [`RB-${dateStr}-%`]
      )
      const seq = (countRow?.cnt ?? 0) + 1
      const batchNo = `RB-${dateStr}-${String(seq).padStart(4, "0")}`

      // 3. Insert receiving_batches
      const batchResult = await dbRun(
        `INSERT INTO receiving_batches (batchNo, supplierId, receivedDate, notes, reconcileStatus)
         VALUES (?, ?, ?, ?, 'pending')`,
        [batchNo, normalizedSupplierId, parsedDate.toISOString(), notesText]
      )
      const batchId = batchResult.lastID

      // 4. Process each item
      const createdItems = []
      const nowIso = new Date().toISOString()

      for (const item of items) {
        const productId = Number(item.productId)
        const quantity = Number(item.quantity)

        // Validate product exists
        const product = await dbGet("SELECT id, name FROM products WHERE id = ?", [productId])
        if (!product) {
          await dbRun("ROLLBACK")
          return next(httpError(404, `Product id ${productId} not found`, "NOT_FOUND"))
        }

        // Insert batch item
        const itemResult = await dbRun(
          `INSERT INTO receiving_batch_items (batchId, productId, productName, quantity)
           VALUES (?, ?, ?, ?)`,
          [batchId, productId, product.name, quantity]
        )

        // Update product stock
        await dbRun("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, productId])

        // Insert inventory log
        await dbRun(
          `INSERT INTO inventory_logs (productId, type, quantity, logDate, remark, batchId)
           VALUES (?, 'in', ?, ?, ?, ?)`,
          [productId, quantity, nowIso, `收货批次 ${batchNo}`, batchId]
        )

        createdItems.push({
          id: itemResult.lastID,
          batchId,
          productId,
          productName: product.name,
          quantity,
        })
      }

      // 5. COMMIT
      await dbRun("COMMIT")

      // 6. Return created batch + items
      return res.status(201).json({
        batch: {
          id: batchId,
          batchNo,
          supplierId: normalizedSupplierId,
          supplierName: supplier.name,
          receivedDate: parsedDate.toISOString(),
          notes: notesText,
          reconcileStatus: "pending",
          items: createdItems,
        },
      })
    } catch (txErr) {
      await dbRun("ROLLBACK").catch(() => {})
      throw txErr
    }
  } catch (err) {
    return next(err)
  }
})

// ─── GET / — List batches with filters ───────────────────────────────────────

router.get("/", async (req, res, next) => {
  const limit = Number(req.query.limit ?? 20)
  const offset = Number(req.query.offset ?? 0)

  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return next(httpError(400, "limit must be between 1 and 500", "VALIDATION_ERROR"))
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return next(httpError(400, "offset must be >= 0", "VALIDATION_ERROR"))
  }

  const filters = []
  const params = []

  if (req.query.supplierId) {
    const sid = Number(req.query.supplierId)
    if (!Number.isInteger(sid) || sid <= 0) {
      return next(httpError(400, "supplierId must be a positive integer", "VALIDATION_ERROR"))
    }
    filters.push("rb.supplierId = ?")
    params.push(sid)
  }

  if (req.query.startDate) {
    filters.push("rb.receivedDate >= ?")
    params.push(req.query.startDate)
  }

  if (req.query.endDate) {
    filters.push("rb.receivedDate <= ?")
    params.push(req.query.endDate)
  }

  if (req.query.reconcileStatus) {
    filters.push("rb.reconcileStatus = ?")
    params.push(req.query.reconcileStatus)
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

  try {
    const countRow = await dbGet(
      `SELECT COUNT(*) as total FROM receiving_batches rb ${whereClause}`,
      params
    )

    const rows = await dbAll(
      `SELECT rb.id, rb.batchNo, rb.supplierId, s.name as supplierName,
              rb.receivedDate, rb.notes, rb.reconcileStatus, rb.createdAt,
              COUNT(rbi.id) as itemCount,
              COALESCE(SUM(rbi.quantity), 0) as totalQty
       FROM receiving_batches rb
       LEFT JOIN suppliers s ON s.id = rb.supplierId
       LEFT JOIN receiving_batch_items rbi ON rbi.batchId = rb.id
       ${whereClause}
       GROUP BY rb.id
       ORDER BY rb.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return res.json({ total: countRow?.total ?? 0, items: rows })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /:id — Batch detail ────────────────────────────────────────────────

router.get("/:id", async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid batch id", "VALIDATION_ERROR"))
  }

  try {
    const batch = await dbGet(
      `SELECT rb.id, rb.batchNo, rb.supplierId, s.name as supplierName,
              rb.receivedDate, rb.notes, rb.reconcileStatus, rb.createdAt
       FROM receiving_batches rb
       LEFT JOIN suppliers s ON s.id = rb.supplierId
       WHERE rb.id = ?`,
      [id]
    )

    if (!batch) {
      return next(httpError(404, "Batch not found", "NOT_FOUND"))
    }

    const items = await dbAll(
      `SELECT rbi.id, rbi.batchId, rbi.productId, rbi.productName, rbi.quantity,
              p.unit, p.warehouseType
       FROM receiving_batch_items rbi
       LEFT JOIN products p ON p.id = rbi.productId
       WHERE rbi.batchId = ?
       ORDER BY rbi.id ASC`,
      [id]
    )

    return res.json({ batch: { ...batch, items } })
  } catch (err) {
    return next(err)
  }
})

module.exports = router
