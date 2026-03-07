const express = require("express")
const OAuthClient = require("intuit-oauth")
const https = require("https")
const db = require("../db")
const { requireAuth, requireAdmin } = require("../middleware/auth")
const httpError = require("../utils/httpError")

const router = express.Router()

// Initialise OAuth client (reads from env at startup)
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: process.env.QBO_ENV || "sandbox",
  redirectUri: process.env.QBO_REDIRECT_URI || "http://localhost:3000/api/qbo/callback",
})

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getStoredToken() {
  return new Promise((resolve, reject) =>
    db.get("SELECT * FROM qbo_tokens WHERE id = 1", (err, row) =>
      err ? reject(err) : resolve(row || null)
    )
  )
}

function saveTokens(tokenJson, realmId) {
  const { access_token, refresh_token, token_type, expires_in, x_refresh_token_expires_in } =
    tokenJson
  const expiresAt = Date.now() + expires_in * 1000
  const refreshExpiresAt = Date.now() + x_refresh_token_expires_in * 1000
  return new Promise((resolve, reject) =>
    db.run(
      `INSERT OR REPLACE INTO qbo_tokens
         (id, access_token, refresh_token, realm_id, token_type, expires_at, refresh_token_expires_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
      [access_token, refresh_token, realmId, token_type || "bearer", expiresAt, refreshExpiresAt],
      (err) => (err ? reject(err) : resolve())
    )
  )
}

// ─── Token management ─────────────────────────────────────────────────────────

async function getValidAccessToken() {
  const stored = await getStoredToken()
  if (!stored) throw httpError(400, "QuickBooks not connected", "QBO_NOT_CONNECTED")

  if (Date.now() > stored.refresh_token_expires_at) {
    throw httpError(400, "QuickBooks session expired — please reconnect", "QBO_TOKEN_EXPIRED")
  }

  // Refresh if access token expires within 5 minutes
  if (Date.now() > stored.expires_at - 300_000) {
    const authResponse = await oauthClient.refreshUsingToken(stored.refresh_token)
    const newToken = authResponse.getJson()
    await saveTokens(newToken, stored.realm_id)
    return { accessToken: newToken.access_token, realmId: stored.realm_id }
  }

  return { accessToken: stored.access_token, realmId: stored.realm_id }
}

// ─── QBO REST helper ──────────────────────────────────────────────────────────

function qboRequest(method, path, accessToken, realmId, body) {
  const isProduction = (process.env.QBO_ENV || "sandbox") === "production"
  const hostname = isProduction
    ? "quickbooks.api.intuit.com"
    : "sandbox-quickbooks.api.intuit.com"

  const bodyStr = body ? JSON.stringify(body) : ""

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: `/v3/company/${realmId}${path}`,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bodyStr && { "Content-Length": Buffer.byteLength(bodyStr) }),
      },
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 400) {
            const detail =
              parsed?.Fault?.Error?.[0]?.Message || parsed?.Fault?.Error?.[0]?.Detail || data
            reject(new Error(`QBO ${res.statusCode}: ${detail}`))
          } else {
            resolve(parsed)
          }
        } catch {
          reject(new Error(`Non-JSON QBO response (${res.statusCode}): ${data.slice(0, 300)}`))
        }
      })
    })

    req.on("error", reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ─── OAuth routes ─────────────────────────────────────────────────────────────

// GET /api/qbo/connect  — redirect to Intuit OAuth page (no auth required, OAuth itself is the security)
router.get("/connect", (_req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "mingziapp",
  })
  res.redirect(authUri)
})

// GET /api/qbo/callback  — Intuit redirects here after user approves
router.get("/callback", async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url)
    const tokenJson = authResponse.getJson()
    const realmId = authResponse.token.realmId
    await saveTokens(tokenJson, realmId)
    const base = process.env.FRONTEND_URL || "http://localhost:5173"
    res.redirect(`${base}/settings?qbo=connected`)
  } catch (err) {
    console.error("QBO callback error:", err)
    const base = process.env.FRONTEND_URL || "http://localhost:5173"
    res.redirect(`${base}/settings?qbo=error&msg=${encodeURIComponent(err.message)}`)
  }
})

// GET /api/qbo/status
router.get("/status", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const stored = await getStoredToken()
    if (!stored) return res.json({ connected: false })
    if (Date.now() > stored.refresh_token_expires_at)
      return res.json({ connected: false, reason: "token_expired" })
    res.json({ connected: true, realmId: stored.realm_id })
  } catch {
    res.json({ connected: false })
  }
})

// POST /api/qbo/disconnect
router.post("/disconnect", requireAuth, requireAdmin, (req, res) => {
  db.run("DELETE FROM qbo_tokens WHERE id = 1", (err) => {
    if (err) return res.status(500).json({ error: "DB error" })
    res.json({ ok: true })
  })
})

// ─── Business helpers ─────────────────────────────────────────────────────────

// Find customer by DisplayName in QBO, create if not found
async function findOrCreateQboCustomer(accessToken, realmId, displayName) {
  // QBO uses '' to escape single quotes inside query strings
  const safeName = displayName.replace(/'/g, "''")
  const query = `SELECT * FROM Customer WHERE DisplayName = '${safeName}'`
  const result = await qboRequest(
    "GET",
    `/query?query=${encodeURIComponent(query)}&minorversion=65`,
    accessToken,
    realmId
  )
  const existing = result.QueryResponse?.Customer
  if (existing?.length > 0) return existing[0].Id

  const created = await qboRequest(
    "POST",
    "/customer?minorversion=65",
    accessToken,
    realmId,
    { DisplayName: displayName }
  )
  return created.Customer.Id
}

// ─── Push order → QBO Invoice ─────────────────────────────────────────────────

// POST /api/qbo/push/:orderId
router.post("/push/:orderId", requireAuth, requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.orderId)
  if (!Number.isInteger(orderId) || orderId <= 0)
    return next(httpError(400, "Invalid orderId", "VALIDATION_ERROR"))

  try {
    const { accessToken, realmId } = await getValidAccessToken()

    // Load order + customer name
    const order = await new Promise((resolve, reject) =>
      db.get(
        `SELECT o.*, c.name AS customerName
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customerId
         WHERE o.id = ?`,
        [orderId],
        (err, row) => (err ? reject(err) : resolve(row))
      )
    )
    if (!order) return next(httpError(404, "Order not found"))

    // Load order items with product info
    const items = await new Promise((resolve, reject) =>
      db.all(
        `SELECT oi.qtyOrdered, oi.unitPrice, p.name AS productName, p.unit AS productUnit
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.productId
         WHERE oi.orderId = ?`,
        [orderId],
        (err, rows) => (err ? reject(err) : resolve(rows))
      )
    )
    if (!items.length) return next(httpError(400, "Order has no items"))

    // Find or create QBO customer
    const displayName = order.customerName || `Customer #${order.customerId}`
    const qboCustomerId = await findOrCreateQboCustomer(accessToken, realmId, displayName)

    // Build invoice lines using SalesItemLineDetail with generic Services item (id=1)
    const lines = items.map((item) => {
      const qty = Number(item.qtyOrdered) || 1
      const unitPrice = Number(item.unitPrice) || 0
      const amount = Math.round(qty * unitPrice * 100) / 100
      return {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: `${item.productName || "Item"} × ${qty} ${item.productUnit || ""}`.trim(),
        SalesItemLineDetail: {
          ItemRef: { value: "1" },
          Qty: qty,
          UnitPrice: unitPrice,
        },
      }
    })

    const invoicePayload = {
      CustomerRef: { value: qboCustomerId },
      Line: lines,
      PrivateNote: `MingziApp Order #${orderId}`,
    }

    const result = await qboRequest(
      "POST",
      "/invoice?minorversion=65",
      accessToken,
      realmId,
      invoicePayload
    )
    const invoice = result.Invoice

    // Persist QBO invoice ID to the local order record
    await new Promise((resolve, reject) =>
      db.run(
        "UPDATE orders SET qbo_invoice_id = ? WHERE id = ?",
        [invoice.Id, orderId],
        (err) => (err ? reject(err) : resolve(undefined))
      )
    )

    res.json({
      ok: true,
      qboInvoiceId: invoice.Id,
      qboInvoiceDocNumber: invoice.DocNumber,
      qboTotal: invoice.TotalAmt,
    })
  } catch (err) {
    console.error("QBO push error:", err)
    next(err.status ? err : httpError(500, err.message || String(err), "QBO_ERROR"))
  }
})

// POST /api/qbo/push-bill/:invoiceId  — create a QBO Bill from a confirmed supplier invoice
router.post('/push-bill/:invoiceId', requireAuth, requireAdmin, async (req, res, next) => {
  const invoiceId = Number(req.params.invoiceId)
  if (!Number.isInteger(invoiceId) || invoiceId <= 0)
    return next(httpError(400, 'Invalid invoiceId', 'VALIDATION_ERROR'))

  try {
    // Load supplier invoice + items
    const invoice = await new Promise((resolve, reject) =>
      db.get(
        `SELECT si.*, s.name as supplierName FROM supplier_invoices si
         LEFT JOIN suppliers s ON s.id = si.supplierId
         WHERE si.id = ?`,
        [invoiceId], (err, row) => err ? reject(err) : resolve(row)
      )
    )
    if (!invoice) return next(httpError(404, 'Supplier invoice not found'))
    if (invoice.qbo_bill_id)
      return res.json({ ok: true, skipped: true, qboBillId: invoice.qbo_bill_id, message: '\u8be5\u8d26\u5355\u5df2\u63a8\u9001\u8fc7 QBO' })

    const items = await new Promise((resolve, reject) =>
      db.all('SELECT * FROM supplier_invoice_items WHERE invoiceId = ?', [invoiceId],
        (err, rows) => err ? reject(err) : resolve(rows))
    )
    if (!items.length) return next(httpError(400, '\u8d26\u5355\u6ca1\u6709\u660e\u7ec6\u9879\u76ee'))

    const { accessToken, realmId } = await getValidAccessToken()

    // Find or create QBO Vendor
    const vendorName = invoice.supplierName || `Supplier #${invoice.supplierId}`
    const safeVendorName = vendorName.replace(/'/g, "''")
    const vendorQuery = `SELECT * FROM Vendor WHERE DisplayName = '${safeVendorName}'`
    const vendorResult = await qboRequest('GET',
      `/query?query=${encodeURIComponent(vendorQuery)}&minorversion=65`, accessToken, realmId)
    let vendorId = vendorResult.QueryResponse?.Vendor?.[0]?.Id
    if (!vendorId) {
      const created = await qboRequest('POST', '/vendor?minorversion=65', accessToken, realmId,
        { DisplayName: vendorName })
      vendorId = created.Vendor.Id
    }

    // Find an expense account (Cost of Goods Sold preferred, fallback to any Expense)
    const acctResult = await qboRequest('GET',
      `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Cost of Goods Sold' MAXRESULTS 1")}&minorversion=65`,
      accessToken, realmId)
    let accountId = acctResult.QueryResponse?.Account?.[0]?.Id
    if (!accountId) {
      const fallback = await qboRequest('GET',
        `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1")}&minorversion=65`,
        accessToken, realmId)
      accountId = fallback.QueryResponse?.Account?.[0]?.Id
    }
    if (!accountId) return next(httpError(500, 'QBO \u4e2d\u672a\u627e\u5230\u53ef\u7528\u7684\u8d39\u7528\u79d1\u76ee', 'QBO_NO_ACCOUNT'))

    // Build Bill lines
    const lines = items.map(item => ({
      Amount: Number(item.amount || 0),
      DetailType: 'AccountBasedExpenseLineDetail',
      Description: `${item.productName || 'Item'} x${item.quantity || 1}`,
      AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
    }))

    const txnDate = invoice.invoiceDate
      ? invoice.invoiceDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const billPayload = {
      VendorRef: { value: vendorId },
      TxnDate: txnDate,
      Line: lines,
      PrivateNote: `MingziApp \u4f9b\u5e94\u5546\u8d26\u5355 ${invoice.invoiceNo || '#' + invoiceId}`,
    }

    const result = await qboRequest('POST', '/bill?minorversion=65', accessToken, realmId, billPayload)
    const bill = result.Bill

    // Save qbo_bill_id
    await new Promise((resolve, reject) =>
      db.run('UPDATE supplier_invoices SET qbo_bill_id = ? WHERE id = ?',
        [bill.Id, invoiceId], (err) => err ? reject(err) : resolve(undefined))
    )

    res.json({ ok: true, qboBillId: bill.Id, qboBillDocNumber: bill.DocNumber, qboTotal: bill.TotalAmt })
  } catch (err) {
    next(err.status ? err : httpError(500, err.message, 'QBO_ERROR'))
  }
})

// POST /api/qbo/sync-payments  — pull Invoice balances from QBO and mark paid orders
// POST /api/qbo/push-batch-bill/:batchId  — create a QBO Bill from a receiving batch ($0 placeholder)
router.post('/push-batch-bill/:batchId', requireAuth, requireAdmin, async (req, res, next) => {
  const batchId = Number(req.params.batchId)
  if (!Number.isInteger(batchId) || batchId <= 0)
    return next(httpError(400, 'Invalid batchId', 'VALIDATION_ERROR'))

  try {
    const batch = await new Promise((resolve, reject) =>
      db.get(
        `SELECT rb.*, s.name as supplierName FROM receiving_batches rb
         LEFT JOIN suppliers s ON s.id = rb.supplierId
         WHERE rb.id = ?`,
        [batchId], (err, row) => err ? reject(err) : resolve(row)
      )
    )
    if (!batch) return next(httpError(404, '批次不存在'))
    if (!batch.supplierId) return next(httpError(400, '该批次未填写供应商，请先补填供应商再推送', 'NO_SUPPLIER'))
    if (batch.qbo_bill_id)
      return res.json({ ok: true, skipped: true, qboBillId: batch.qbo_bill_id, message: '该批次已推送过 QBO' })

    const items = await new Promise((resolve, reject) =>
      db.all('SELECT * FROM receiving_batch_items WHERE batchId = ?', [batchId],
        (err, rows) => err ? reject(err) : resolve(rows))
    )
    if (!items.length) return next(httpError(400, '批次没有明细项目'))

    const { accessToken, realmId } = await getValidAccessToken()

    const vendorName = batch.supplierName || `Supplier #${batch.supplierId}`
    const safeVendorName = vendorName.replace(/'/g, "''")
    const vendorQuery = `SELECT * FROM Vendor WHERE DisplayName = '${safeVendorName}'`
    const vendorResult = await qboRequest('GET',
      `/query?query=${encodeURIComponent(vendorQuery)}&minorversion=65`, accessToken, realmId)
    let vendorId = vendorResult.QueryResponse?.Vendor?.[0]?.Id
    if (!vendorId) {
      const created = await qboRequest('POST', '/vendor?minorversion=65', accessToken, realmId,
        { DisplayName: vendorName })
      vendorId = created.Vendor.Id
    }

    const acctResult = await qboRequest('GET',
      `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Cost of Goods Sold' MAXRESULTS 1")}&minorversion=65`,
      accessToken, realmId)
    let accountId = acctResult.QueryResponse?.Account?.[0]?.Id
    if (!accountId) {
      const fallback = await qboRequest('GET',
        `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1")}&minorversion=65`,
        accessToken, realmId)
      accountId = fallback.QueryResponse?.Account?.[0]?.Id
    }
    if (!accountId) return next(httpError(500, 'QBO 中未找到可用的费用科目', 'QBO_NO_ACCOUNT'))

    const lines = items.map(item => ({
      Amount: 0.01,
      DetailType: 'AccountBasedExpenseLineDetail',
      Description: `${item.productName || 'Item'} x${item.quantity || 1} ${item.unit || ''}`.trim(),
      AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
    }))

    const txnDate = batch.receivedDate
      ? batch.receivedDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const billPayload = {
      VendorRef: { value: vendorId },
      TxnDate: txnDate,
      Line: lines,
      PrivateNote: `MingziApp 入库批次 ${batch.batchNo || '#' + batchId}（待填价格）`,
    }

    const result = await qboRequest('POST', '/bill?minorversion=65', accessToken, realmId, billPayload)
    const bill = result.Bill

    await new Promise((resolve, reject) =>
      db.run('UPDATE receiving_batches SET qbo_bill_id = ? WHERE id = ?',
        [bill.Id, batchId], (err) => err ? reject(err) : resolve(undefined))
    )

    res.json({ ok: true, qboBillId: bill.Id, qboBillDocNumber: bill.DocNumber })
  } catch (err) {
    next(err.status ? err : httpError(500, err.message, 'QBO_ERROR'))
  }
})

router.post('/sync-payments', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { accessToken, realmId } = await getValidAccessToken()

    // Find all local orders that have a qbo_invoice_id and are currently unpaid
    const orders = await new Promise((resolve, reject) =>
      db.all(
        "SELECT id, qbo_invoice_id FROM orders WHERE qbo_invoice_id IS NOT NULL AND payment_status = 'unpaid'",
        (err, rows) => (err ? reject(err) : resolve(rows))
      )
    )

    if (!orders.length) return res.json({ ok: true, updated: 0, message: '没有待同步的订单' })

    let updated = 0
    for (const order of orders) {
      try {
        const result = await qboRequest(
          'GET',
          `/invoice/${order.qbo_invoice_id}?minorversion=65`,
          accessToken,
          realmId
        )
        const balance = Number(result.Invoice?.Balance ?? 1)
        if (balance === 0) {
          await new Promise((resolve, reject) =>
            db.run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [order.id],
              (err) => (err ? reject(err) : resolve(undefined))
            )
          )
          updated++
        }
      } catch {
        // Skip individual invoice errors — don't abort the whole sync
      }
    }

    res.json({ ok: true, updated, total: orders.length })
  } catch (err) {
    next(err.status ? err : httpError(500, err.message, 'QBO_ERROR'))
  }
})

// POST /api/qbo/record-payment/:orderId  — create a Check payment in QBO for the invoice
router.post('/record-payment/:orderId', requireAuth, requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.orderId)
  if (!Number.isInteger(orderId) || orderId <= 0)
    return next(httpError(400, 'Invalid orderId', 'VALIDATION_ERROR'))

  try {
    const order = await new Promise((resolve, reject) =>
      db.get('SELECT qbo_invoice_id FROM orders WHERE id = ?', [orderId],
        (err, row) => (err ? reject(err) : resolve(row)))
    )
    if (!order) return next(httpError(404, 'Order not found'))
    if (!order.qbo_invoice_id)
      return next(httpError(400, '\u8be5\u8ba2\u5355\u5c1a\u672a\u63a8\u9001\u5230 QuickBooks\uff0c\u65e0\u6cd5\u8bb0\u5f55\u4ed8\u6b3e', 'NO_QBO_INVOICE'))

    const { accessToken, realmId } = await getValidAccessToken()

    // Fetch invoice to get CustomerRef and current Balance
    const invoiceData = await qboRequest('GET', `/invoice/${order.qbo_invoice_id}?minorversion=65`, accessToken, realmId)
    const invoice = invoiceData.Invoice
    if (!invoice) return next(httpError(404, 'QBO Invoice not found'))
    const balance = Number(invoice.Balance || 0)
    if (balance <= 0) return res.json({ ok: true, skipped: true, message: 'Invoice \u5df2\u5168\u989d\u4ed8\u6b3e' })

    // Look up Check payment method ID
    const pmResult = await qboRequest(
      'GET',
      `/query?query=${encodeURIComponent("SELECT * FROM PaymentMethod WHERE Name = 'Check'")}&minorversion=65`,
      accessToken, realmId
    )
    const pmId = pmResult.QueryResponse?.PaymentMethod?.[0]?.Id || null

    // Create payment
    const paymentPayload = {
      CustomerRef: invoice.CustomerRef,
      TotalAmt: balance,
      ...(pmId ? { PaymentMethodRef: { value: pmId } } : {}),
      Line: [{
        Amount: balance,
        LinkedTxn: [{ TxnId: order.qbo_invoice_id, TxnType: 'Invoice' }],
      }],
    }
    const paymentResult = await qboRequest('POST', '/payment?minorversion=65', accessToken, realmId, paymentPayload)

    res.json({ ok: true, qboPaymentId: paymentResult.Payment?.Id })
  } catch (err) {
    next(err.status ? err : httpError(500, err.message, 'QBO_ERROR'))
  }
})

// GET /api/qbo/invoice/:invoiceId/pdf  — proxy PDF from QBO
router.get('/invoice/:invoiceId/pdf', requireAuth, requireAdmin, async (req, res, next) => {
  const invoiceId = req.params.invoiceId
  if (!invoiceId || !/^\d+$/.test(invoiceId))
    return next(httpError(400, 'Invalid invoiceId', 'VALIDATION_ERROR'))

  try {
    const { accessToken, realmId } = await getValidAccessToken()
    const isProduction = (process.env.QBO_ENV || 'sandbox') === 'production'
    const hostname = isProduction
      ? 'quickbooks.api.intuit.com'
      : 'sandbox-quickbooks.api.intuit.com'

    const options = {
      hostname,
      path: `/v3/company/${realmId}/invoice/${invoiceId}/pdf?minorversion=65`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/pdf',
      },
    }

    const proxyReq = https.request(options, (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        return next(httpError(proxyRes.statusCode || 502, 'QBO PDF fetch failed'))
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoiceId}.pdf"`)
      proxyRes.pipe(res)
    })
    proxyReq.on('error', next)
    proxyReq.end()
  } catch (err) {
    next(err.status ? err : httpError(500, err.message, 'QBO_ERROR'))
  }
})

module.exports = router
