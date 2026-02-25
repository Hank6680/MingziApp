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

router.get("/summary", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50)
    const offset = Number(req.query.offset ?? 0)
    if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
      return next(httpError(400, "limit must be between 1 and 500", "VALIDATION_ERROR"))
    }
    if (!Number.isFinite(offset) || offset < 0) {
      return next(httpError(400, "offset must be >= 0", "VALIDATION_ERROR"))
    }

    const { q, warehouseType } = req.query
    const filters = []
    const params = []

    if (q) {
      filters.push("name LIKE ?")
      params.push(`%${q}%`)
    }
    if (warehouseType) {
      filters.push("warehouseType = ?")
      params.push(warehouseType)
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

    const countRow = await dbGet(
      `SELECT COUNT(*) as total FROM products ${whereClause}`,
      params
    )

    const rows = await dbAll(
      `SELECT id, name, unit, warehouseType, price, isAvailable, stock, notes
       FROM products ${whereClause}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return res.json({ total: countRow?.total ?? 0, items: rows })
  } catch (err) {
    return next(err)
  }
})

router.patch("/:productId", async (req, res, next) => {
  const productId = Number(req.params.productId)
  if (!Number.isInteger(productId) || productId <= 0) {
    return next(httpError(400, "Invalid productId", "VALIDATION_ERROR"))
  }

  const { stock, notes } = req.body || {}
  const updates = []
  const params = []

  if (stock !== undefined) {
    const normalizedStock = Number(stock)
    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
      return next(httpError(400, "stock must be a non-negative number", "VALIDATION_ERROR"))
    }
    updates.push("stock = ?")
    params.push(normalizedStock)
  }

  if (notes !== undefined) {
    updates.push("notes = ?")
    params.push(notes == null ? null : String(notes).slice(0, 500))
  }

  if (!updates.length) {
    return next(httpError(400, "No fields to update", "VALIDATION_ERROR"))
  }

  params.push(productId)

  try {
    const result = await dbRun(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`, params)
    if (result.changes === 0) {
      return next(httpError(404, "Product not found", "NOT_FOUND"))
    }
    const updated = await dbGet(
      "SELECT id, name, unit, warehouseType, price, isAvailable, stock, notes FROM products WHERE id = ?",
      [productId]
    )
    return res.json({ item: updated })
  } catch (err) {
    return next(err)
  }
})

const parsePositiveInt = (value, field) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw httpError(400, `${field} must be a positive integer`, "VALIDATION_ERROR")
  }
  return normalized
}

const parseDateInput = (value) => {
  if (value == null || value === "") return new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, "logDate must be a valid date", "VALIDATION_ERROR")
  }
  return parsed
}

const fetchProductOrFail = async (productId) => {
  const product = await dbGet("SELECT id, stock, name FROM products WHERE id = ?", [productId])
  if (!product) {
    throw httpError(404, "Product not found", "NOT_FOUND")
  }
  return product
}

router.post("/inbound", async (req, res, next) => {
  const { productId, quantity, logDate, remark } = req.body || {}

  let normalizedProductId
  let normalizedQuantity
  let normalizedDate
  try {
    normalizedProductId = parsePositiveInt(productId, "productId")
    normalizedQuantity = parsePositiveInt(quantity, "quantity")
    normalizedDate = parseDateInput(logDate)
  } catch (validationErr) {
    return next(validationErr)
  }

  const remarkText = remark == null ? null : String(remark).slice(0, 500)

  try {
    await dbRun("BEGIN IMMEDIATE")

    await fetchProductOrFail(normalizedProductId)

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

router.post("/returns", async (req, res, next) => {
  const { productId, quantity, partnerName, reason, logDate } = req.body || {}

  let normalizedProductId
  let normalizedQuantity
  let normalizedDate
  try {
    normalizedProductId = parsePositiveInt(productId, "productId")
    normalizedQuantity = parsePositiveInt(quantity, "quantity")
    normalizedDate = parseDateInput(logDate)
  } catch (validationErr) {
    return next(validationErr)
  }

  const partner = partnerName && String(partnerName).trim()
  if (!partner) {
    return next(httpError(400, "partnerName is required", "VALIDATION_ERROR"))
  }

  const reasonText = reason ? String(reason).trim().slice(0, 500) : null

  try {
    await dbRun("BEGIN IMMEDIATE")

    await fetchProductOrFail(normalizedProductId)

    await dbRun("UPDATE products SET stock = stock + ? WHERE id = ?", [normalizedQuantity, normalizedProductId])
    await dbRun(
      `INSERT INTO inventory_logs (productId, type, quantity, logDate, partnerName, reason, remark)
       VALUES (?, 'return', ?, ?, ?, ?, NULL)`,
      [normalizedProductId, normalizedQuantity, normalizedDate.toISOString(), partner, reasonText]
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

router.post("/damages", async (req, res, next) => {
  const { productId, quantity, reason, logDate } = req.body || {}

  let normalizedProductId
  let normalizedQuantity
  let normalizedDate
  try {
    normalizedProductId = parsePositiveInt(productId, "productId")
    normalizedQuantity = parsePositiveInt(quantity, "quantity")
    normalizedDate = parseDateInput(logDate)
  } catch (validationErr) {
    return next(validationErr)
  }

  const reasonText = reason ? String(reason).trim().slice(0, 500) : null

  try {
    await dbRun("BEGIN IMMEDIATE")

    const product = await fetchProductOrFail(normalizedProductId)
    if (product.stock < normalizedQuantity) {
      await dbRun("ROLLBACK")
      return next(httpError(400, `库存不足，现有 ${product.stock}`, "STOCK_INSUFFICIENT"))
    }

    await dbRun("UPDATE products SET stock = stock - ? WHERE id = ?", [normalizedQuantity, normalizedProductId])
    await dbRun(
      `INSERT INTO inventory_logs (productId, type, quantity, logDate, reason, remark)
       VALUES (?, 'damage', ?, ?, ?, NULL)`,
      [normalizedProductId, normalizedQuantity, normalizedDate.toISOString(), reasonText]
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

router.get("/logs", async (req, res, next) => {
  const { type, limit = 20 } = req.query
  const allowedTypes = new Set(["return", "damage", "in"])
  if (type && !allowedTypes.has(type)) {
    return next(httpError(400, "type must be return|damage|in", "VALIDATION_ERROR"))
  }

  const pageSize = Number(limit)
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return next(httpError(400, "limit must be 1-100", "VALIDATION_ERROR"))
  }

  try {
    const rows = await dbAll(
      `SELECT il.*, p.name as productName, p.unit, p.warehouseType
       FROM inventory_logs il
       LEFT JOIN products p ON p.id = il.productId
       ${type ? "WHERE il.type = ?" : ""}
       ORDER BY il.id DESC
       LIMIT ?`,
      type ? [type, pageSize] : [pageSize]
    )
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

module.exports = router
