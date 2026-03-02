const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin, requireStaffOrAdmin } = require("../middleware/auth")

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

// GET / — list all customers, ordered by name (all authenticated users)
router.get("/", async (req, res, next) => {
  try {
    const rows = await dbAll("SELECT * FROM customers ORDER BY name ASC")
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

// POST / — create customer (staff or admin)
router.post("/", requireStaffOrAdmin, async (req, res, next) => {
  const { name, contact, phone, address, notes } = req.body || {}

  const trimmedName = name && String(name).trim()
  if (!trimmedName) {
    return next(httpError(400, "name is required", "VALIDATION_ERROR"))
  }

  const contactText = contact != null ? String(contact).trim() : null
  const phoneText = phone != null ? String(phone).trim() : null
  const addressText = address != null ? String(address).trim() : null
  const notesText = notes != null ? String(notes).trim().slice(0, 500) : null

  try {
    const result = await dbRun(
      "INSERT INTO customers (name, contact, phone, address, notes) VALUES (?, ?, ?, ?, ?)",
      [trimmedName, contactText, phoneText, addressText, notesText]
    )
    const created = await dbGet("SELECT * FROM customers WHERE id = ?", [result.lastID])
    return res.status(201).json({ item: created })
  } catch (err) {
    return next(err)
  }
})

// GET /:id/frequent-products — products this customer has ordered, sorted by frequency
router.get("/:id/frequent-products", requireStaffOrAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid customer id", "VALIDATION_ERROR"))
  }

  try {
    const rows = await dbAll(
      `SELECT oi.productId, p.name, p.unit, p.warehouseType, p.price, p.isAvailable,
              SUM(oi.qtyOrdered) as totalQty, COUNT(*) as orderCount
       FROM order_items oi
       JOIN orders o ON o.id = oi.orderId
       JOIN products p ON p.id = oi.productId
       WHERE o.customerId = ?
       GROUP BY oi.productId
       ORDER BY orderCount DESC, totalQty DESC
       LIMIT 50`,
      [id]
    )
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

// PATCH /:id — update customer fields (admin only)
router.patch("/:id", requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid customer id", "VALIDATION_ERROR"))
  }

  const { name, contact, phone, address, notes } = req.body || {}
  const updates = []
  const params = []

  if (name !== undefined) {
    const trimmedName = String(name).trim()
    if (!trimmedName) {
      return next(httpError(400, "name cannot be empty", "VALIDATION_ERROR"))
    }
    updates.push("name = ?")
    params.push(trimmedName)
  }

  if (contact !== undefined) {
    updates.push("contact = ?")
    params.push(contact == null ? null : String(contact).trim())
  }

  if (phone !== undefined) {
    updates.push("phone = ?")
    params.push(phone == null ? null : String(phone).trim())
  }

  if (address !== undefined) {
    updates.push("address = ?")
    params.push(address == null ? null : String(address).trim())
  }

  if (notes !== undefined) {
    updates.push("notes = ?")
    params.push(notes == null ? null : String(notes).trim().slice(0, 500))
  }

  if (!updates.length) {
    return next(httpError(400, "No fields to update", "VALIDATION_ERROR"))
  }

  params.push(id)

  try {
    const result = await dbRun(`UPDATE customers SET ${updates.join(", ")} WHERE id = ?`, params)
    if (result.changes === 0) {
      return next(httpError(404, "Customer not found", "NOT_FOUND"))
    }
    const updated = await dbGet("SELECT * FROM customers WHERE id = ?", [id])
    return res.json({ item: updated })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id — delete customer (admin only, only if no orders reference it)
router.delete("/:id", requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid customer id", "VALIDATION_ERROR"))
  }

  try {
    const customer = await dbGet("SELECT id FROM customers WHERE id = ?", [id])
    if (!customer) {
      return next(httpError(404, "Customer not found", "NOT_FOUND"))
    }

    const order = await dbGet("SELECT id FROM orders WHERE customerId = ? LIMIT 1", [id])
    if (order) {
      return next(httpError(409, "Cannot delete customer with existing orders", "HAS_REFERENCES"))
    }

    await dbRun("DELETE FROM customers WHERE id = ?", [id])
    return res.status(204).end()
  } catch (err) {
    return next(err)
  }
})

module.exports = router
