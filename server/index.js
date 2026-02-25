const express = require("express")
const cors = require("cors")
require("./db")

const httpError = require("./utils/httpError")

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://mingziapp.onrender.com",
]

const app = express()
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (health checks, server-to-server)
      if (!origin) return callback(null, true)
      // Allow any .onrender.com subdomain + explicit whitelist
      if (
        allowedOrigins.includes(origin) ||
        /\.onrender\.com$/.test(new URL(origin).hostname)
      ) {
        return callback(null, true)
      }
      return callback(httpError(403, "Origin not allowed", "CORS_FORBIDDEN"))
    },
    credentials: true,
  })
)
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.use("/api/products", require("./routes/products"))
app.use("/api/orders", require("./routes/orders"))
app.use("/api/auth", require("./routes/auth"))
app.use("/api/inventory", require("./routes/inventory"))

app.use((req, _res, next) => {
  next(httpError(404, `Route ${req.method} ${req.originalUrl} not found`, "NOT_FOUND"))
})

app.use((err, _req, res, _next) => {
  const status = err.status || 500
  if (status >= 500) {
    console.error(err)
  }
  res.status(status).json({
    error: {
      message: err.message || "Internal server error",
      code: err.code || "ERR_INTERNAL",
    },
  })
})

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
});
