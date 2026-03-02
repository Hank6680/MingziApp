const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdminOrManagerOrManager, requireStaffOrAdmin } = require("../middleware/auth")

const router = express.Router()

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  )

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  )

router.use(requireAuth)

// GET /api/customer-tags - all unique tags
router.get("/", requireStaffOrAdmin, async (_req, res, next) => {
  try {
    const rows = await dbAll("SELECT DISTINCT tag FROM customer_tags ORDER BY tag")
    res.json({ tags: rows.map((r) => r.tag) })
  } catch (err) {
    next(err)
  }
})

// GET /api/customer-tags/grouped - customers grouped by tag
router.get("/grouped", requireStaffOrAdmin, async (_req, res, next) => {
  try {
    const customers = await dbAll("SELECT * FROM customers ORDER BY name")
    const tagRows = await dbAll("SELECT customerId, tag FROM customer_tags ORDER BY tag")

    // Build tag map: customerId -> tags[]
    const tagMap = {}
    for (const row of tagRows) {
      if (!tagMap[row.customerId]) tagMap[row.customerId] = []
      tagMap[row.customerId].push(row.tag)
    }

    // Build grouped result: tag -> customers[]
    const grouped = {}
    const allTags = new Set()
    const untagged = []

    for (const c of customers) {
      const tags = tagMap[c.id] || []
      c.tags = tags
      if (tags.length === 0) {
        untagged.push(c)
      } else {
        for (const tag of tags) {
          allTags.add(tag)
          if (!grouped[tag]) grouped[tag] = []
          grouped[tag].push(c)
        }
      }
    }

    res.json({
      customers,
      grouped,
      tags: [...allTags].sort(),
      untagged,
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/customer-tags/customer/:id - set tags for a customer (admin only)
router.put("/customer/:id", requireAdminOrManager, async (req, res, next) => {
  const customerId = Number(req.params.id)
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return next(httpError(400, "Invalid customer id", "VALIDATION_ERROR"))
  }

  const { tags } = req.body || {}
  if (!Array.isArray(tags)) {
    return next(httpError(400, "tags must be an array", "VALIDATION_ERROR"))
  }

  try {
    await dbRun("DELETE FROM customer_tags WHERE customerId = ?", [customerId])
    for (const tag of tags) {
      const trimmed = String(tag).trim()
      if (trimmed) {
        await dbRun(
          "INSERT OR IGNORE INTO customer_tags (customerId, tag) VALUES (?, ?)",
          [customerId, trimmed]
        )
      }
    }

    const rows = await dbAll("SELECT tag FROM customer_tags WHERE customerId = ?", [customerId])
    res.json({ customerId, tags: rows.map((r) => r.tag) })
  } catch (err) {
    next(err)
  }
})

module.exports = router
