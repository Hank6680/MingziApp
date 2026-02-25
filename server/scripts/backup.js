/**
 * MingziApp 数据备份/恢复脚本
 *
 * 用法：
 *   node scripts/backup.js export          # 从线上导出到本地
 *   node scripts/backup.js import          # 从本地恢复到线上
 *   node scripts/backup.js export local    # 从本地后端导出
 *   node scripts/backup.js import local    # 恢复到本地后端
 */

const fs = require("fs")
const path = require("path")

const REMOTE_URL = "https://mingziapp-api.onrender.com"
const LOCAL_URL = "http://localhost:4000"
const BACKUP_DIR = path.join(__dirname, "..", "backups")
const ADMIN_USER = "admin"
const ADMIN_PASS = "admin123"

async function getToken(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const data = await res.json()
  return data.token
}

async function exportBackup(baseUrl) {
  const label = baseUrl.includes("localhost") ? "本地" : "线上"
  console.log(`正在从${label}导出数据...`)

  const token = await getToken(baseUrl)
  const res = await fetch(`${baseUrl}/api/backup/export`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Export failed: ${res.status} ${await res.text()}`)
  const data = await res.json()

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const filename = `backup-${timestamp}.json`
  const filepath = path.join(BACKUP_DIR, filename)

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))

  // Also save as latest
  fs.writeFileSync(path.join(BACKUP_DIR, "latest.json"), JSON.stringify(data, null, 2))

  const counts = Object.entries(data.tables).map(([k, v]) => `${k}: ${v.length}`).join(", ")
  console.log(`导出成功 → ${filepath}`)
  console.log(`数据量: ${counts}`)
  console.log(`同时保存为 backups/latest.json`)
}

async function importBackup(baseUrl) {
  const label = baseUrl.includes("localhost") ? "本地" : "线上"
  const latestPath = path.join(BACKUP_DIR, "latest.json")

  if (!fs.existsSync(latestPath)) {
    console.error("找不到 backups/latest.json，请先执行 export")
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(latestPath, "utf-8"))
  const counts = Object.entries(data.tables).map(([k, v]) => `${k}: ${v.length}`).join(", ")

  console.log(`准备恢复到${label}...`)
  console.log(`备份时间: ${data.exportedAt}`)
  console.log(`数据量: ${counts}`)

  const token = await getToken(baseUrl)
  const res = await fetch(`${baseUrl}/api/backup/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tables: data.tables }),
  })

  if (!res.ok) throw new Error(`Import failed: ${res.status} ${await res.text()}`)
  const result = await res.json()
  console.log("恢复成功:", result.imported)
}

async function main() {
  const [action, target] = process.argv.slice(2)
  const baseUrl = target === "local" ? LOCAL_URL : REMOTE_URL

  if (action === "export") {
    await exportBackup(baseUrl)
  } else if (action === "import") {
    await importBackup(baseUrl)
  } else {
    console.log("用法:")
    console.log("  node scripts/backup.js export          从线上导出")
    console.log("  node scripts/backup.js import          恢复到线上")
    console.log("  node scripts/backup.js export local    从本地导出")
    console.log("  node scripts/backup.js import local    恢复到本地")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("错误:", err.message)
  process.exit(1)
})
