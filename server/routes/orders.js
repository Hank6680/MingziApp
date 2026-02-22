const express = require("express")
const db = require("../db")
const httpError = require("../utils/httpError")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()
const boxUnits = new Set(["箱", "桶", "包"])
const allowedStatuses = new Set(["created", "confirmed", "shipped", "completed", "cancelled"])
const lockedStatuses = new Set(["shipped", "completed", "cancelled"])

// Migrate: add columns if not yet present (sqlite3 ignores error if column exists)
db.run("ALTER TABLE orders ADD COLUMN totalAmount REAL DEFAULT 0", () => {})
db.run("ALTER TABLE order_items ADD COLUMN unitPrice REAL DEFAULT 0", () => {})

// ─── Promise helpers ──────────────────────────────────────────────────────────

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  )

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

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fetchItemsForOrder = (orderId) =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT oi.*, p.name as productName, p.unit as productUnit, p.warehouseType as productWarehouseType, p.price as productPrice
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.productId
       WHERE oi.orderId = ?`,
      [orderId],
      (itemErr, rows) => {
        if (itemErr) return reject(itemErr)
        resolve(rows)
      }
    )
  })

const fetchOrderWithItems = (orderId) =>
  new Promise((resolve, reject) => {
    db.get("SELECT * FROM orders WHERE id = ?", [orderId], async (err, order) => {
      if (err) return reject(err)
      if (!order) return resolve(null)
      try {
        const items = await fetchItemsForOrder(order.id)
        resolve({ ...order, items })
      } catch (itemsErr) {
        reject(itemsErr)
      }
    })
  })

const validateDeliveryDate = (deliveryDate) => {
  if (!deliveryDate) {
    throw httpError(400, "deliveryDate is required", "VALIDATION_ERROR")
  }
  const timestamp = Date.parse(deliveryDate)
  if (Number.isNaN(timestamp)) {
    throw httpError(400, "deliveryDate must be a valid ISO date", "VALIDATION_ERROR")
  }
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// unit=kg: > 0, max 2 decimal places
// unit=箱/桶/包: positive integer
const validateQty = (unit, qty) => {
  if (!Number.isFinite(qty) || qty <= 0) {
    return "数量必须大于 0"
  }
  if (unit === "kg") {
    if (!/^\d+(\.\d{1,2})?$/.test(String(qty))) {
      return "kg 单位最多允许 2 位小数"
    }
  } else if (boxUnits.has(unit)) {
    if (!Number.isInteger(qty) || qty < 1) {
      return `${unit} 单位必须为正整数`
    }
  }
  return null
}

const recalcOrderTotal = async (orderId) => {
  const rows = await dbAll("SELECT qtyOrdered, unitPrice FROM order_items WHERE orderId = ?", [orderId])
  const total =
    Math.round(rows.reduce((sum, row) => sum + (Number(row.qtyOrdered) || 0) * (Number(row.unitPrice) || 0), 0) * 100) /
    100
  await dbRun("UPDATE orders SET totalAmount = ? WHERE id = ?", [total, orderId])
  return total
}

const fetchOrderRow = async (orderId) => {
  const order = await dbGet("SELECT * FROM orders WHERE id = ?", [orderId])
  if (!order) {
    throw httpError(404, "Order not found", "NOT_FOUND")
  }
  return order
}

const markOrderPending = async (orderId, detail) => {
  const stamp = new Date().toISOString()
  await dbRun("UPDATE orders SET pendingReview = 1, lastModifiedAt = ? WHERE id = ?", [stamp, orderId])
  if (detail) {
    await dbRun(
      "INSERT INTO order_change_logs (orderId, type, detail, createdAt) VALUES (?, 'change', ?, ?)",
      [orderId, detail, stamp]
    )
  }
}

const clearOrderPending = async (orderId) => {
  await dbRun("UPDATE orders SET pendingReview = 0 WHERE id = ?", [orderId])
}

const fetchOrderItemDetail = async (itemId) => {
  const row = await dbGet(
    `SELECT oi.*, o.status as orderStatus, o.customerId, o.deliveryDate, o.id as parentOrderId, p.unit, p.name as productName
     FROM order_items oi
     JOIN orders o ON o.id = oi.orderId
     LEFT JOIN products p ON p.id = oi.productId
     WHERE oi.id = ?`,
    [itemId]
  )
  if (!row) {
    throw httpError(404, "Order item not found", "NOT_FOUND")
  }
  return row
}

const normalizeQtyInput = (unit, qty) => {
  const normalized = Number(qty)
  const error = validateQty(unit, normalized)
  if (error) {
    throw httpError(400, error, "INVALID_QUANTITY")
  }
  return normalized
}

const requireEditableOrder = (order) => {
  if (lockedStatuses.has(order.status)) {
    throw httpError(409, "订单已发货或完成，无法直接修改，请创建新订单", "ORDER_LOCKED")
  }
}

const fetchProductInfo = async (productId) => {
  const product = await dbGet("SELECT * FROM products WHERE id = ?", [productId])
  if (!product) {
    throw httpError(404, "Product not found", "NOT_FOUND")
  }
  return product
}

const createFollowupOrder = async (orderRow) => {
  const result = await dbRun(
    "INSERT INTO orders (customerId, deliveryDate, status, totalAmount, tripNumber, stockDeducted) VALUES (?, ?, 'created', 0, NULL, 0)",
    [orderRow.customerId, orderRow.deliveryDate]
  )
  return result.lastID
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.use(requireAuth)

router.get("/", (req, res, next) => {
  const filters = []
  const params = []
  let targetCustomerId = req.user.customerId

  if (req.user.role === "admin" && req.query.customerId) {
    const parsed = Number(req.query.customerId)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return next(httpError(400, "customerId must be a positive number", "VALIDATION_ERROR"))
    }
    targetCustomerId = parsed
  }

  if (req.user.role !== "admin") {
    if (!Number.isFinite(targetCustomerId)) {
      return next(httpError(400, "User is missing customerId", "VALIDATION_ERROR"))
    }
  }

  if (Number.isFinite(targetCustomerId)) {
    filters.push("customerId = ?")
    params.push(targetCustomerId)
  }

  let query = "SELECT * FROM orders"
  if (filters.length) {
    query += ` WHERE ${filters.join(" AND ")}`
  }
  query += " ORDER BY id DESC"

  db.all(query, params, (err, orders) => {
    if (err) {
      return next(err)
    }

    if (!orders.length) {
      return res.json([])
    }

    Promise.all(
      orders.map(async (order) => {
        const items = await fetchItemsForOrder(order.id)
        return { ...order, items }
      })
    )
      .then((results) => res.json(results))
      .catch((itemsErr) => next(itemsErr))
  })
})

router.get("/picking", requireAdmin, async (req, res, next) => {
  const { trip, warehouseType } = req.query
  if (!trip || typeof trip !== "string" || !trip.trim()) {
    return next(httpError(400, "trip query parameter is required", "VALIDATION_ERROR"))
  }

  const params = [trip.trim()]
  let sql = `SELECT oi.id as itemId, oi.orderId, o.customerId, o.tripNumber, oi.productId, oi.qtyOrdered, oi.picked, oi.outOfStock, oi.status,
    p.name as productName, p.unit as productUnit, p.warehouseType, p.price
    FROM order_items oi
    JOIN orders o ON o.id = oi.orderId
    JOIN products p ON p.id = oi.productId
    WHERE o.tripNumber = ?`

  if (warehouseType && warehouseType !== "全部") {
    sql += " AND p.warehouseType = ?"
    params.push(warehouseType)
  }

  try {
    const rows = await dbAll(sql + " ORDER BY p.warehouseType, p.name", params)
    return res.json(rows)
  } catch (err) {
    return next(err)
  }
})

router.get("/:id", async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId)) {
    return next(httpError(400, "Invalid order id", "VALIDATION_ERROR"))
  }

  try {
    const order = await fetchOrderWithItems(orderId)
    if (!order) {
      return next(httpError(404, "Order not found", "NOT_FOUND"))
    }
    if (req.user.role !== "admin" && order.customerId !== req.user.customerId) {
      return next(httpError(403, "Not allowed to view this order", "AUTH_FORBIDDEN"))
    }
    return res.json(order)
  } catch (err) {
    return next(err)
  }
})

router.post("/", async (req, res, next) => {
  const { items, deliveryDate, customerId: bodyCustomerId } = req.body

  // 1. Validate items array
  if (!Array.isArray(items) || items.length === 0) {
    return next(httpError(400, "Order items are required", "VALIDATION_ERROR"))
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (typeof item !== "object" || item === null) {
      return next(httpError(400, `Item ${i + 1} must be an object`, "VALIDATION_ERROR"))
    }
    const productId = Number(item.productId)
    if (!Number.isInteger(productId) || productId <= 0) {
      return next(httpError(400, `Item ${i + 1} requires a positive integer productId`, "VALIDATION_ERROR"))
    }
    if (!Number.isFinite(Number(item.qtyOrdered))) {
      return next(httpError(400, `Item ${i + 1} requires numeric qtyOrdered`, "VALIDATION_ERROR"))
    }
  }

  // 2. Validate deliveryDate
  let normalizedDeliveryDate
  try {
    normalizedDeliveryDate = validateDeliveryDate(deliveryDate)
  } catch (err) {
    return next(err)
  }

  // 3. Determine customerId
  let effectiveCustomerId = req.user.customerId
  if (req.user.role === "admin" && bodyCustomerId != null) {
    const parsed = Number(bodyCustomerId)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return next(httpError(400, "customerId must be a positive integer", "VALIDATION_ERROR"))
    }
    effectiveCustomerId = parsed
  }
  if (!Number.isFinite(effectiveCustomerId)) {
    return next(httpError(400, "No customerId available for order", "VALIDATION_ERROR"))
  }

  try {
    let existingOrderId = null
    const shouldAutoMerge = req.user.role !== "admin"
    if (shouldAutoMerge) {
      const existing = await dbGet(
        `SELECT id FROM orders
         WHERE customerId = ?
           AND status IN ('created','confirmed')
           AND (deliveryDate = ? OR date(deliveryDate) = date(?))
         ORDER BY id ASC LIMIT 1`,
        [effectiveCustomerId, normalizedDeliveryDate, normalizedDeliveryDate]
      )
      if (existing) {
        existingOrderId = existing.id
      }
    }

    // 4. Fetch products (availability + price + unit)
    const productIds = [...new Set(items.map((item) => Number(item.productId)))]
    const placeholders = productIds.map(() => "?").join(",")
    const products = await dbAll(
      `SELECT id, name, unit, price, isAvailable FROM products WHERE id IN (${placeholders})`,
      productIds
    )

    if (products.length !== productIds.length) {
      return next(httpError(400, "Some products do not exist", "VALIDATION_ERROR"))
    }

    const productMap = products.reduce((acc, p) => {
      acc[p.id] = p
      return acc
    }, {})

    // 5. Validate availability + quantity rules, build validated items
    const validatedItems = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const productId = Number(item.productId)
      const product = productMap[productId]
      const qty = Number(item.qtyOrdered)

      // Check is_available
      if (!product.isAvailable) {
        return next(
          httpError(400, `商品「${product.name}」当前不可订购`, "PRODUCT_UNAVAILABLE")
        )
      }

      // Check quantity rules
      const qtyError = validateQty(product.unit, qty)
      if (qtyError) {
        return next(
          httpError(400, `第 ${i + 1} 项（${product.name}）：${qtyError}`, "INVALID_QUANTITY")
        )
      }

      validatedItems.push({
        productId,
        qtyOrdered: qty,
        unitPrice: product.price, // snapshot at order time
      })
    }

    const totalAmount =
      Math.round(
        validatedItems.reduce((sum, item) => sum + item.qtyOrdered * item.unitPrice, 0) * 100
      ) / 100

    // 7. Write inside a transaction
    await dbRun("BEGIN IMMEDIATE")

    try {
      let orderId = existingOrderId
      if (!orderId) {
        const orderResult = await dbRun(
          "INSERT INTO orders (customerId, deliveryDate, status, totalAmount) VALUES (?, ?, ?, ?)",
          [effectiveCustomerId, normalizedDeliveryDate, "created", totalAmount]
        )
        orderId = orderResult.lastID
      }

      for (const item of validatedItems) {
        await dbRun(
          "INSERT INTO order_items (orderId, productId, qtyOrdered, qtyPicked, unitPrice, status) VALUES (?, ?, ?, ?, ?, ?)",
          [orderId, item.productId, item.qtyOrdered, 0, item.unitPrice, "created"]
        )
      }

      const updatedTotal = await recalcOrderTotal(orderId)
      await markOrderPending(orderId, JSON.stringify({ items }))
      await dbRun("COMMIT")

      return res.status(existingOrderId ? 200 : 201).json({ orderId, totalAmount: updatedTotal, merged: Boolean(existingOrderId) })
    } catch (txErr) {
      await dbRun("ROLLBACK").catch(() => {})
      throw txErr
    }
  } catch (err) {
    return next(err)
  }
})

router.get("/pending/changes", requireAdmin, async (_req, res, next) => {
  try {
    const rows = await dbAll(
      `SELECT o.*, (
          SELECT json_group_array(json_object('id', l.id, 'detail', l.detail, 'createdAt', l.createdAt))
          FROM order_change_logs l WHERE l.orderId = o.id
        ) as changes
       FROM orders o
       WHERE o.pendingReview = 1 AND o.status IN ('created','confirmed')
       ORDER BY o.lastModifiedAt DESC`
    )
    return res.json({ items: rows })
  } catch (err) {
    return next(err)
  }
})

router.patch("/:id/status", requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId)) {
    return next(httpError(400, "Invalid order id", "VALIDATION_ERROR"))
  }

  const { status } = req.body || {}
  if (!allowedStatuses.has(status)) {
    return next(httpError(400, "Invalid order status", "VALIDATION_ERROR"))
  }

  const requiresStockDeduction = status === "shipped" || status === "completed"

  try {
    await dbRun("BEGIN IMMEDIATE")

    const orderRow = await dbGet("SELECT * FROM orders WHERE id = ?", [orderId])
    if (!orderRow) {
      await dbRun("ROLLBACK")
      return next(httpError(404, "Order not found", "NOT_FOUND"))
    }

    if (requiresStockDeduction && orderRow.stockDeducted) {
      await dbRun("UPDATE orders SET status = ? WHERE id = ?", [status, orderId])
      await dbRun("COMMIT")
      const order = await fetchOrderWithItems(orderId)
      return res.json(order)
    }

    if (requiresStockDeduction) {
      const items = await dbAll(
        `SELECT oi.id, oi.productId, oi.qtyPicked, p.stock, p.name
         FROM order_items oi
         JOIN products p ON p.id = oi.productId
         WHERE oi.orderId = ?`,
        [orderId]
      )

      const insufficient = []
      for (const item of items) {
        const qty = Number(item.qtyPicked) || 0
        if (qty > 0 && item.stock < qty) {
          insufficient.push({ productId: item.productId, name: item.name, stock: item.stock, required: qty })
        }
      }

      if (insufficient.length) {
        await dbRun("ROLLBACK")
        return next(
          httpError(
            400,
            `库存不足：${insufficient
              .map((i) => `${i.name ?? i.productId} (现有 ${i.stock}, 需要 ${i.required})`)
              .join(", ")}`,
            "STOCK_INSUFFICIENT"
          )
        )
      }

      const nowIso = new Date().toISOString()
      for (const item of items) {
        const qty = Number(item.qtyPicked) || 0
        if (qty <= 0) continue
        await dbRun("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, item.productId])
        await dbRun(
          `INSERT INTO inventory_logs (productId, type, quantity, logDate, remark)
           VALUES (?, 'out', ?, ?, ?)`,
          [item.productId, qty, nowIso, `Order #${orderId} - ${status}`]
        )
      }

      await dbRun("UPDATE orders SET stockDeducted = 1 WHERE id = ?", [orderId])
    }

    await dbRun("UPDATE orders SET status = ? WHERE id = ?", [status, orderId])
    await dbRun("COMMIT")

    const order = await fetchOrderWithItems(orderId)
    return res.json(order)
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {})
    return next(err)
  }
})

router.patch("/:id/review", requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return next(httpError(400, "Invalid order id", "VALIDATION_ERROR"))
  }

  try {
    await clearOrderPending(orderId)
    return res.json({ orderId })
  } catch (err) {
    return next(err)
  }
})

router.patch("/:id/trip", requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId)) {
    return next(httpError(400, "Invalid order id", "VALIDATION_ERROR"))
  }

  const { tripNumber } = req.body || {}
  const normalized = tripNumber == null || tripNumber === "" ? null : String(tripNumber).trim()

  db.run("UPDATE orders SET tripNumber = ? WHERE id = ?", [normalized, orderId], async function (err) {
    if (err) {
      return next(err)
    }
    if (this.changes === 0) {
      return next(httpError(404, "Order not found", "NOT_FOUND"))
    }
    try {
      const order = await fetchOrderWithItems(orderId)
      return res.json(order)
    } catch (fetchErr) {
      return next(fetchErr)
    }
  })
})

router.post("/:id/items", requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return next(httpError(400, "Invalid order id", "VALIDATION_ERROR"))
  }

  const { productId, qtyOrdered, unitPrice } = req.body || {}
  if (!Number.isInteger(Number(productId)) || Number(productId) <= 0) {
    return next(httpError(400, "productId must be a positive integer", "VALIDATION_ERROR"))
  }

  try {
    const product = await fetchProductInfo(Number(productId))
    const qty = normalizeQtyInput(product.unit, Number(qtyOrdered))
    const orderRow = await fetchOrderRow(orderId)

    let targetOrderId = orderId
    let redirectedOrderId = null

    if (lockedStatuses.has(orderRow.status)) {
      targetOrderId = await createFollowupOrder(orderRow)
      redirectedOrderId = targetOrderId
    }

    const price = unitPrice != null && !Number.isNaN(Number(unitPrice)) ? Number(unitPrice) : product.price || 0

    await dbRun(
      "INSERT INTO order_items (orderId, productId, qtyOrdered, qtyPicked, unitPrice, status) VALUES (?, ?, ?, 0, ?, 'created')",
      [targetOrderId, product.id, qty, price]
    )

    await recalcOrderTotal(targetOrderId)
    const order = await fetchOrderWithItems(targetOrderId)
    return res.status(201).json({ order, redirectedOrderId })
  } catch (err) {
    return next(err)
  }
})

router.patch("/items/:id", requireAdmin, async (req, res, next) => {
  const itemId = Number(req.params.id)
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return next(httpError(400, "Invalid item id", "VALIDATION_ERROR"))
  }

  const { qtyOrdered, unitPrice } = req.body || {}

  if (qtyOrdered == null && unitPrice == null) {
    return next(httpError(400, "No fields to update", "VALIDATION_ERROR"))
  }

  try {
    const detail = await fetchOrderItemDetail(itemId)
    requireEditableOrder({ status: detail.orderStatus })

    const updates = []
    const params = []

    if (qtyOrdered != null) {
      const qty = normalizeQtyInput(detail.unit, Number(qtyOrdered))
      updates.push("qtyOrdered = ?")
      params.push(qty)
    }

    if (unitPrice != null) {
      const price = Number(unitPrice)
      if (!Number.isFinite(price)) {
        return next(httpError(400, "unitPrice must be a number", "VALIDATION_ERROR"))
      }
      updates.push("unitPrice = ?")
      params.push(price)
    }

    params.push(itemId)

    await dbRun(`UPDATE order_items SET ${updates.join(", ")} WHERE id = ?`, params)
    await recalcOrderTotal(detail.parentOrderId)
    const order = await fetchOrderWithItems(detail.parentOrderId)
    return res.json(order)
  } catch (err) {
    return next(err)
  }
})

router.delete("/items/:id", requireAdmin, async (req, res, next) => {
  const itemId = Number(req.params.id)
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return next(httpError(400, "Invalid item id", "VALIDATION_ERROR"))
  }

  try {
    const detail = await fetchOrderItemDetail(itemId)
    requireEditableOrder({ status: detail.orderStatus })

    await dbRun("DELETE FROM order_items WHERE id = ?", [itemId])
    await recalcOrderTotal(detail.parentOrderId)
    const order = await fetchOrderWithItems(detail.parentOrderId)
    return res.json(order)
  } catch (err) {
    return next(err)
  }
})

router.patch("/items/:id/status", async (req, res, next) => {
  const itemId = Number(req.params.id)
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return next(httpError(400, "Invalid item id", "VALIDATION_ERROR"))
  }

  const { picked, outOfStock } = req.body || {}
  const updates = []
  const params = []

  if (picked !== undefined) {
    const flag = picked === true || picked === 1 || picked === "1" ? 1 : 0
    updates.push("picked = ?")
    params.push(flag)
    if (flag === 1) {
      updates.push("status = 'picked'")
    }
  }

  if (outOfStock !== undefined) {
    const flag = outOfStock === true || outOfStock === 1 || outOfStock === "1" ? 1 : 0
    updates.push("outOfStock = ?")
    params.push(flag)
    updates.push(flag === 1 ? "status = 'out_of_stock'" : "status = 'created'")
  }

  if (!updates.length) {
    return next(httpError(400, "No valid fields provided", "VALIDATION_ERROR"))
  }

  const sql = `UPDATE order_items SET ${updates.join(", ")} WHERE id = ?`
  params.push(itemId)

  db.run(sql, params, function (err) {
    if (err) {
      return next(err)
    }
    if (this.changes === 0) {
      return next(httpError(404, "Order item not found", "NOT_FOUND"))
    }

    db.get(
      `SELECT oi.*, p.name as productName, p.unit as productUnit, p.warehouseType as productWarehouseType
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.productId
       WHERE oi.id = ?`,
      [itemId],
      (fetchErr, row) => {
        if (fetchErr) {
          return next(fetchErr)
        }
        return res.json(row)
      }
    )
  })
})

module.exports = router
