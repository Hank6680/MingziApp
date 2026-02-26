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

// GET / — list all suppliers, ordered by name
router.get("/", async (req, res, next) => {
  try {
    const rows = await dbAll("SELECT * FROM suppliers ORDER BY name ASC")
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

// POST / — create supplier
router.post("/", async (req, res, next) => {
  const { name, contact, notes } = req.body || {}

  const trimmedName = name && String(name).trim()
  if (!trimmedName) {
    return next(httpError(400, "name is required", "VALIDATION_ERROR"))
  }

  const contactText = contact != null ? String(contact).trim() : null
  const notesText = notes != null ? String(notes).trim().slice(0, 500) : null

  try {
    const result = await dbRun(
      "INSERT INTO suppliers (name, contact, notes) VALUES (?, ?, ?)",
      [trimmedName, contactText, notesText]
    )
    const created = await dbGet("SELECT * FROM suppliers WHERE id = ?", [result.lastID])
    return res.status(201).json({ item: created })
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return next(httpError(409, "Supplier name already exists", "DUPLICATE_NAME"))
    }
    return next(err)
  }
})

// PATCH /:id — update supplier fields
router.patch("/:id", async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid supplier id", "VALIDATION_ERROR"))
  }

  const { name, contact, notes } = req.body || {}
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

  if (notes !== undefined) {
    updates.push("notes = ?")
    params.push(notes == null ? null : String(notes).trim().slice(0, 500))
  }

  if (!updates.length) {
    return next(httpError(400, "No fields to update", "VALIDATION_ERROR"))
  }

  params.push(id)

  try {
    const result = await dbRun(`UPDATE suppliers SET ${updates.join(", ")} WHERE id = ?`, params)
    if (result.changes === 0) {
      return next(httpError(404, "Supplier not found", "NOT_FOUND"))
    }
    const updated = await dbGet("SELECT * FROM suppliers WHERE id = ?", [id])
    return res.json({ item: updated })
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return next(httpError(409, "Supplier name already exists", "DUPLICATE_NAME"))
    }
    return next(err)
  }
})

// DELETE /:id — delete supplier (only if no receiving_batches reference it)
router.delete("/:id", async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, "Invalid supplier id", "VALIDATION_ERROR"))
  }

  try {
    const supplier = await dbGet("SELECT id FROM suppliers WHERE id = ?", [id])
    if (!supplier) {
      return next(httpError(404, "Supplier not found", "NOT_FOUND"))
    }

    const batch = await dbGet("SELECT id FROM receiving_batches WHERE supplierId = ? LIMIT 1", [id])
    if (batch) {
      return next(httpError(409, "Cannot delete supplier with existing receiving batches", "HAS_REFERENCES"))
    }

    await dbRun("DELETE FROM suppliers WHERE id = ?", [id])
    return res.status(204).end()
  } catch (err) {
    return next(err)
  }
})

module.exports = router
