const db = require("../db")

const logAudit = (req, { action, targetType, targetId, targetDate, details }) => {
  const triggeredBy = req.headers["x-triggered-by"] === "agent" ? "agent" : "human"
  const userId = req.user?.id || null
  const username = req.user?.username || null
  const detailStr = details ? JSON.stringify(details) : null

  db.run(
    `INSERT INTO audit_logs (action, entity, entityId, detail, username, targetDate, triggeredBy, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [action, targetType, targetId, detailStr, username, targetDate, triggeredBy, userId],
    (err) => {
      if (err) console.error("Audit log failed:", err.message)
    }
  )
}

module.exports = { logAudit }
