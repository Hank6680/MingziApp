const path = require("path")
const sqlite3 = require("sqlite3").verbose()

const dbPath = path.join(__dirname, "data.db")
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

  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) {
      console.error("Failed to count products", err)
      return
    }

    if (row?.count === 0) {
      const seedProducts = [
        { name: "冷冻牛肉", unit: "kg", warehouseType: "冻", price: 52.3, isAvailable: 1 },
        { name: "生鲜鸡胸", unit: "kg", warehouseType: "鲜", price: 28.6, isAvailable: 1 },
        { name: "矿泉水", unit: "箱", warehouseType: "干", price: 48, isAvailable: 1 },
        { name: "食用油", unit: "桶", warehouseType: "干", price: 96.5, isAvailable: 0 },
        { name: "调味酱", unit: "包", warehouseType: "干", price: 18.2, isAvailable: 1 },
        { name: "冷冻虾仁", unit: "kg", warehouseType: "冻", price: 75.9, isAvailable: 1 },
        { name: "鲜奶", unit: "箱", warehouseType: "鲜", price: 62, isAvailable: 1 },
        { name: "果蔬拼盘", unit: "包", warehouseType: "鲜", price: 33.8, isAvailable: 0 },
        { name: "高筋面粉", unit: "包", warehouseType: "干", price: 24.5, isAvailable: 1 },
        { name: "冷藏酸奶", unit: "箱", warehouseType: "鲜", price: 54.2, isAvailable: 1 },
        { name: "酱油", unit: "桶", warehouseType: "干", price: 88.9, isAvailable: 1 },
      ]

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
          console.log("Seeded default products")
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
        ["demo", "demo123", "customer", 1],
        (insertErr) => {
          if (insertErr) {
            console.error("Failed to insert demo user", insertErr)
          } else {
            console.log("Seeded demo user")
          }
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
})

module.exports = db
