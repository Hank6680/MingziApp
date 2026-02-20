const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()

const parsePagination = (limitRaw, offsetRaw) => {
  const limit = Number(limitRaw ?? 20)
  const offset = Number(offsetRaw ?? 0)

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw httpError(400, "limit must be between 1 and 100", "VALIDATION_ERROR")
  }
  if (!Number.isFinite(offset) || offset < 0) {
    throw httpError(400, "offset must be >= 0", "VALIDATION_ERROR")
  }

  return { limit, offset }
}

router.get("/", (req, res, next) => {
  try {
    const { q, available } = req.query
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset)

    const filters = []
    const params = []

    if (q) {
      filters.push("name LIKE ?")
      params.push(`%${q}%`)
    }

    if (available === "0" || available === "1") {
      filters.push("isAvailable = ?")
      params.push(Number(available))
    } else if (available !== undefined && available !== "") {
      throw httpError(400, "available must be 0 or 1", "VALIDATION_ERROR")
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : ""
    const countSql = `SELECT COUNT(*) as total FROM products ${whereClause}`

    db.get(countSql, params, (countErr, countRow) => {
      if (countErr) {
        return next(countErr)
      }

      const dataSql = `${
        whereClause ? `SELECT * FROM products ${whereClause}` : "SELECT * FROM products"
      } ORDER BY id DESC LIMIT ? OFFSET ?`

      db.all(dataSql, [...params, limit, offset], (err, rows) => {
        if (err) {
          return next(err)
        }

        return res.json({ total: countRow?.total ?? 0, items: rows })
      })
    })
  } catch (validationErr) {
    next(validationErr)
  }
})

router.post("/", requireAuth, requireAdmin, (req, res, next) => {
  const { name, unit, warehouseType, price, isAvailable = 1 } = req.body

  if (!name || !unit || !warehouseType || typeof price !== "number") {
    return next(httpError(400, "name, unit, warehouseType, price are required", "VALIDATION_ERROR"))
  }

  const stmt = `INSERT INTO products (name, unit, warehouseType, price, isAvailable) VALUES (?, ?, ?, ?, ?)`

  db.run(stmt, [name, unit, warehouseType, price, isAvailable], function (err) {
    if (err) {
      return next(err)
    }
    return res.status(201).json({ id: this.lastID, name, unit, warehouseType, price, isAvailable })
  })
})

router.patch("/:id", requireAuth, requireAdmin, (req, res, next) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return next(httpError(400, "Invalid product id", "VALIDATION_ERROR"))
  }

  const { name, unit, warehouseType, price } = req.body || {}
  const fields = []
  const values = []

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      return next(httpError(400, "name must be a non-empty string", "VALIDATION_ERROR"))
    }
    fields.push("name = ?")
    values.push(name.trim())
  }

  if (unit !== undefined) {
    if (!unit || typeof unit !== "string") {
      return next(httpError(400, "unit must be a non-empty string", "VALIDATION_ERROR"))
    }
    fields.push("unit = ?")
    values.push(unit.trim())
  }

  if (warehouseType !== undefined) {
    if (!warehouseType || typeof warehouseType !== "string") {
      return next(httpError(400, "warehouseType must be a non-empty string", "VALIDATION_ERROR"))
    }
    fields.push("warehouseType = ?")
    values.push(warehouseType.trim())
  }

  if (price !== undefined) {
    if (typeof price !== "number" || Number.isNaN(price)) {
      return next(httpError(400, "price must be a number", "VALIDATION_ERROR"))
    }
    fields.push("price = ?")
    values.push(price)
  }

  if (!fields.length) {
    return next(httpError(400, "No valid fields provided", "VALIDATION_ERROR"))
  }

  const sql = `UPDATE products SET ${fields.join(", ")} WHERE id = ?`
  values.push(productId)

  db.run(sql, values, function (err) {
    if (err) {
      return next(err)
    }
    if (this.changes === 0) {
      return next(httpError(404, "Product not found", "NOT_FOUND"))
    }
    db.get("SELECT * FROM products WHERE id = ?", [productId], (fetchErr, row) => {
      if (fetchErr) {
        return next(fetchErr)
      }
      return res.json(row)
    })
  })
})

router.patch("/:id/availability", requireAuth, requireAdmin, (req, res, next) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return next(httpError(400, "Invalid product id", "VALIDATION_ERROR"))
  }

  const { isAvailable } = req.body || {}
  const flag = isAvailable === true || isAvailable === 1 || isAvailable === "1" ? 1 : isAvailable === false || isAvailable === 0 || isAvailable === "0" ? 0 : null
  if (flag === null) {
    return next(httpError(400, "isAvailable must be boolean", "VALIDATION_ERROR"))
  }

  db.run("UPDATE products SET isAvailable = ? WHERE id = ?", [flag, productId], function (err) {
    if (err) {
      return next(err)
    }
    if (this.changes === 0) {
      return next(httpError(404, "Product not found", "NOT_FOUND"))
    }
    db.get("SELECT * FROM products WHERE id = ?", [productId], (fetchErr, row) => {
      if (fetchErr) {
        return next(fetchErr)
      }
      return res.json(row)
    })
  })
})

router.delete("/:id", requireAuth, requireAdmin, (req, res, next) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return next(httpError(400, "Invalid product id", "VALIDATION_ERROR"))
  }

  db.run("DELETE FROM products WHERE id = ?", [productId], function (err) {
    if (err) {
      return next(err)
    }
    if (this.changes === 0) {
      return next(httpError(404, "Product not found", "NOT_FOUND"))
    }
    return res.json({ success: true, deleted: 1 })
  })
})

router.delete("/", requireAuth, requireAdmin, (req, res, next) => {
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return next(httpError(400, "ids array required", "VALIDATION_ERROR"))
  }
  const normalized = ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)

  if (normalized.length === 0) {
    return next(httpError(400, "No valid ids provided", "VALIDATION_ERROR"))
  }

  const placeholders = normalized.map(() => "?").join(",")
  db.run(`DELETE FROM products WHERE id IN (${placeholders})`, normalized, function (err) {
    if (err) {
      return next(err)
    }
    return res.json({ success: true, deleted: this.changes })
  })
})

module.exports = router
