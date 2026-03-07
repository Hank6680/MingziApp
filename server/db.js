const fs = require("fs")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()

// Use DATA_DIR env var for persistent disk on Render, fallback to local
const dataDir = process.env.DATA_DIR || __dirname
if (process.env.DATA_DIR && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
const dbPath = path.join(dataDir, "data.db")
console.log(`SQLite database path: ${dbPath}`)
const db = new sqlite3.Database(dbPath)

const ensureColumn = (table, column, type, defaultValue) => {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) return
    const exists = rows.some((r) => r.name === column)
    if (!exists) {
      const defaultClause = defaultValue !== undefined ? ` DEFAULT ${defaultValue}` : ""
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultClause}`)
    }
  })
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      unit TEXT,
      warehouseType TEXT,
      price REAL,
      isAvailable INTEGER,
      stock INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      logDate TEXT NOT NULL,
      remark TEXT,
      partnerName TEXT,
      reason TEXT,
      refOrderId INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(productId) REFERENCES products(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS order_change_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      type TEXT NOT NULL,
      detail TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      readAt TEXT,
      FOREIGN KEY(orderId) REFERENCES orders(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT,
      role TEXT,
      customerId INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER,
      deliveryDate TEXT,
      status TEXT DEFAULT 'created',
      tripNumber TEXT,
      stockDeducted INTEGER NOT NULL DEFAULT 0,
      pendingReview INTEGER NOT NULL DEFAULT 0,
      lastModifiedAt TEXT,
      lastReviewedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER,
      productId INTEGER,
      qtyOrdered REAL,
      qtyPicked REAL,
      status TEXT,
      picked INTEGER DEFAULT 0,
      outOfStock INTEGER DEFAULT 0
    )
  `)

  ensureColumn("orders", "tripNumber", "TEXT", "NULL")
  ensureColumn("order_items", "picked", "INTEGER", 0)
  ensureColumn("order_items", "outOfStock", "INTEGER", 0)
  ensureColumn("products", "stock", "INTEGER NOT NULL", 0)
  ensureColumn("orders", "stockDeducted", "INTEGER NOT NULL", 0)
  ensureColumn("orders", "pendingReview", "INTEGER NOT NULL", 0)
  ensureColumn("orders", "lastModifiedAt", "TEXT")
  ensureColumn("orders", "lastReviewedAt", "TEXT")
  ensureColumn("products", "notes", "TEXT")
  ensureColumn("inventory_logs", "partnerName", "TEXT")
  ensureColumn("inventory_logs", "reason", "TEXT")
  ensureColumn("inventory_logs", "refOrderId", "INTEGER")
  ensureColumn("order_change_logs", "type", "TEXT")
  ensureColumn("order_change_logs", "readAt", "TEXT")
  ensureColumn("orders", "qbo_invoice_id", "TEXT")
  ensureColumn("orders", "payment_status", "TEXT", "'unpaid'")
  ensureColumn("supplier_invoices", "qbo_bill_id", "TEXT")
  ensureColumn("products", "defaultSupplierId", "INTEGER")
  ensureColumn("receiving_batches", "qbo_bill_id", "TEXT")

  // Migrate receiving_batches.supplierId to allow NULL (SQLite can't ALTER NOT NULL)
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='receiving_batches'", (err, row) => {
    if (!err && row && row.sql && /supplierId\s+INTEGER\s+NOT\s+NULL/i.test(row.sql)) {
      db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF")
        db.run(`CREATE TABLE IF NOT EXISTS receiving_batches_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batchNo TEXT NOT NULL UNIQUE,
          supplierId INTEGER,
          receivedDate TEXT NOT NULL,
          notes TEXT,
          reconcileStatus TEXT NOT NULL DEFAULT 'pending',
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          qbo_bill_id TEXT,
          FOREIGN KEY(supplierId) REFERENCES suppliers(id)
        )`)
        db.run(`INSERT INTO receiving_batches_new SELECT id, batchNo, supplierId, receivedDate, notes, reconcileStatus, createdAt, qbo_bill_id FROM receiving_batches`)
        db.run(`DROP TABLE receiving_batches`)
        db.run(`ALTER TABLE receiving_batches_new RENAME TO receiving_batches`)
        db.run("PRAGMA foreign_keys = ON")
      })
    }
  })

  // --- Receiving batches & supplier reconciliation tables ---
  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS receiving_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batchNo TEXT NOT NULL UNIQUE,
      supplierId INTEGER NOT NULL,
      receivedDate TEXT NOT NULL,
      notes TEXT,
      reconcileStatus TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS receiving_batch_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batchId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batchId) REFERENCES receiving_batches(id),
      FOREIGN KEY(productId) REFERENCES products(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNo TEXT,
      supplierId INTEGER NOT NULL,
      invoiceDate TEXT,
      periodStart TEXT,
      periodEnd TEXT,
      totalAmount REAL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      productName TEXT,
      productId INTEGER,
      quantity REAL,
      unitPrice REAL,
      amount REAL,
      matchedQty REAL,
      matchStatus TEXT NOT NULL DEFAULT 'unmatched',
      discrepancyNotes TEXT,
      FOREIGN KEY(invoiceId) REFERENCES supplier_invoices(id),
      FOREIGN KEY(productId) REFERENCES products(id)
    )
  `)

  // Price history table
  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      oldPrice REAL,
      newPrice REAL NOT NULL,
      changedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      changedBy TEXT,
      FOREIGN KEY(productId) REFERENCES products(id)
    )
  `)

  // Audit logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity TEXT,
      entityId INTEGER,
      detail TEXT,
      username TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Customer tags table
  db.run(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE(customerId, tag)
    )
  `)

  // QBO OAuth token storage (single row, id=1)
  db.run(`
    CREATE TABLE IF NOT EXISTS qbo_tokens (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      realm_id TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'bearer',
      expires_at INTEGER NOT NULL,
      refresh_token_expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Extra audit_logs columns for agent integration
  ensureColumn("audit_logs", "targetDate", "TEXT")
  ensureColumn("audit_logs", "triggeredBy", "TEXT", "'human'")
  ensureColumn("audit_logs", "userId", "INTEGER")

  ensureColumn("inventory_logs", "batchId", "INTEGER")

  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) {
      console.error("Failed to count products", err)
      return
    }

    if (row?.count === 0) {
      // Load seed data from JSON file
      let seedProducts
      try {
        const seedPath = path.join(__dirname, "seed-products.json")
        seedProducts = JSON.parse(fs.readFileSync(seedPath, "utf-8"))
      } catch (readErr) {
        console.error("Failed to read seed-products.json, using minimal defaults", readErr.message)
        seedProducts = [
          { name: "冷冻牛肉", unit: "kg", warehouseType: "冻", price: 52.3, isAvailable: 1 },
          { name: "矿泉水", unit: "箱", warehouseType: "干", price: 48, isAvailable: 1 },
        ]
      }

      const stmt = db.prepare(
        "INSERT INTO products (name, unit, warehouseType, price, isAvailable) VALUES (?, ?, ?, ?, ?)"
      )

      seedProducts.forEach((p) => {
        stmt.run(p.name, p.unit, p.warehouseType, p.price, p.isAvailable)
      })

      stmt.finalize((seedErr) => {
        if (seedErr) {
          console.error("Failed to seed products", seedErr)
        } else {
          console.log(`Seeded ${seedProducts.length} products`)
        }
      })
    }
  })

  db.get("SELECT COUNT(*) as count FROM users WHERE username = ?", ["demo"], (err, row) => {
    if (err) {
      console.error("Failed to check demo user", err)
      return
    }

    if (row?.count === 0) {
      db.run(
        "INSERT INTO users (username, password, role, customerId) VALUES (?, ?, ?, ?)",
        ["demo", "demo123", "staff", null],
        (insertErr) => {
          if (insertErr) {
            console.error("Failed to insert demo user", insertErr)
          } else {
            console.log("Seeded demo (staff) user")
          }
        }
      )
    } else {
      // Migrate existing demo user to staff role
      db.run(
        "UPDATE users SET role = 'staff', customerId = NULL WHERE username = 'demo' AND role = 'customer'",
        (updateErr) => {
          if (updateErr) console.error("Failed to migrate demo user to staff", updateErr)
        }
      )
    }
  })

  db.get("SELECT COUNT(*) as count FROM users WHERE username = ?", ["admin"], (err, row) => {
    if (err) {
      console.error("Failed to check admin user", err)
      return
    }

    if (row?.count === 0) {
      db.run(
        "INSERT INTO users (username, password, role, customerId) VALUES (?, ?, ?, ?)",
        ["admin", "admin123", "admin", null],
        (insertErr) => {
          if (insertErr) {
            console.error("Failed to insert admin user", insertErr)
          } else {
            console.log("Seeded admin user")
          }
        }
      )
    }
  })

  // Seed 10 manager accounts
  const managerAccounts = [
    { username: "mgr01", password: "mgr01pass" },
    { username: "mgr02", password: "mgr02pass" },
    { username: "mgr03", password: "mgr03pass" },
    { username: "mgr04", password: "mgr04pass" },
    { username: "mgr05", password: "mgr05pass" },
    { username: "mgr06", password: "mgr06pass" },
    { username: "mgr07", password: "mgr07pass" },
    { username: "mgr08", password: "mgr08pass" },
    { username: "mgr09", password: "mgr09pass" },
    { username: "mgr10", password: "mgr10pass" },
  ]
  managerAccounts.forEach(({ username, password }) => {
    db.get("SELECT COUNT(*) as count FROM users WHERE username = ?", [username], (err, row) => {
      if (err) return
      if (row?.count === 0) {
        db.run(
          "INSERT INTO users (username, password, role, customerId) VALUES (?, ?, ?, ?)",
          [username, password, "manager", null],
          (insertErr) => {
            if (insertErr) console.error(`Failed to insert ${username}`, insertErr)
            else console.log(`Seeded manager account: ${username}`)
          }
        )
      }
    })
  })

  // Seed customers
  db.get("SELECT COUNT(*) as count FROM customers", (err, row) => {
    if (err) {
      console.error("Failed to count customers", err)
      return
    }

    if (row?.count === 0) {
      const seedCustomers = [
        { name: "好味道餐厅", contact: "张经理", phone: "13800001111", address: "市中心路100号" },
        { name: "家常菜馆", contact: "李老板", phone: "13800002222", address: "和平路200号" },
        { name: "鲜味坊", contact: "王师傅", phone: "13800003333", address: "新华街300号" },
      ]

      const stmt = db.prepare(
        "INSERT INTO customers (name, contact, phone, address) VALUES (?, ?, ?, ?)"
      )
      seedCustomers.forEach((c) => {
        stmt.run(c.name, c.contact, c.phone, c.address)
      })
      stmt.finalize((seedErr) => {
        if (seedErr) {
          console.error("Failed to seed customers", seedErr)
        } else {
          console.log(`Seeded ${seedCustomers.length} customers`)
          // Seed example customer tags
          const tagStmt = db.prepare(
            "INSERT OR IGNORE INTO customer_tags (customerId, tag) VALUES (?, ?)"
          )
          tagStmt.run(1, "区域A")
          tagStmt.run(2, "区域A")
          tagStmt.run(3, "VIP")
          tagStmt.run(1, "VIP")
          tagStmt.finalize()
          console.log("Seeded example customer tags")
        }
      })
    }
  })
})

module.exports = db
