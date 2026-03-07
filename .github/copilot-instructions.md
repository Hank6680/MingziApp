# MingziApp — Copilot 上下文文件

## 项目定位
食材供应链 B2B 管理系统（"名字供应"）。核心用户：管理员、经理、采购员工、客户。
本地开发中，部分功能已部署至 Render.com。

---

## 技术栈

### 前端
- React 19 + TypeScript + Vite 7
- Tailwind CSS + 自定义 CSS（`src/App.css`）
- React Router v7，客户端路由
- 状态管理：React Context（`AuthContext`、`CartContext`）
- 无 Redux / Zustand

### 后端
- Node.js + Express（CommonJS，非 ESM）
- SQLite3（`server/data.db`，生产用 `DATA_DIR` 环境变量覆盖路径）
- JWT 鉴权（无过期时间，永久 token）
- 文件上传：multer（仅供应商对账 Excel）

### 本地启动
```
前端：npm run dev          → http://localhost:5173
后端：cd server && node index.js  → http://localhost:4000
```

---

## 目录结构

```
MingziApp/
├── src/
│   ├── api/client.ts        # 所有前端 API 调用（统一通过 request() 函数）
│   ├── types.ts             # 所有 TypeScript 类型定义
│   ├── context/
│   │   ├── AuthContext.tsx  # 登录状态、token、user 对象
│   │   └── CartContext.tsx  # 代客下单购物车
│   ├── pages/               # 页面组件（每页一个文件）
│   ├── components/          # 复用组件
│   └── App.tsx              # 路由配置
└── server/
    ├── index.js             # Express 入口，注册所有路由
    ├── db.js                # SQLite 初始化 + 建表 + 种子数据
    ├── middleware/
    │   ├── auth.js          # JWT 验证、角色中间件
    │   └── audit.js         # 操作日志记录
    └── routes/              # 各模块路由（独立文件）
```

---

## 角色权限

| 角色 | 权限范围 |
|------|----------|
| `admin` | 全部功能，包括供应商对账、系统设置、备份 |
| `manager` | 除对账/设置/备份外的管理功能（拣货、库存、客户、供应商） |
| `staff` | 代客下单、订单列表、商品列表（只读） |
| `customer` | 仅自己的订单（当前前端无客户专属页，路由不对外暴露） |

前端路由守卫：`src/components/ProtectedRoute.tsx`
后端中间件：`requireAdmin` / `requireAdminOrManager` / `requireStaffOrAdmin`

---

## 页面 → 路由映射

| 路由 | 页面文件 | 最低权限 |
|------|----------|----------|
| `/dashboard` | DashboardPage | 全部 |
| `/products` | ProductsPage | 全部 |
| `/orders` | OrdersPage | 全部 |
| `/staff-ordering` | StaffOrderingPage | staff/admin/manager |
| `/customers` | CustomersPage | admin/manager |
| `/suppliers` | SuppliersPage | admin/manager |
| `/picking` | PickingPage | admin/manager |
| `/inventory` | InventoryPage | admin/manager |
| `/reconciliation` | ReconciliationPage | admin |
| `/settings` | SettingsPage | admin |

---

## 后端 API 路由

| 前缀 | 文件 | 备注 |
|------|------|------|
| `/api/auth` | routes/auth.js | 登录 |
| `/api/products` | routes/products.js | 商品 CRUD、批量操作 |
| `/api/orders` | routes/orders.js | 订单全生命周期，含批量创建 |
| `/api/inventory` | routes/inventory.js | 入库、退货、货损、盘点 |
| `/api/customers` | routes/customers.js | 客户 CRUD |
| `/api/customer-tags` | routes/customer-tags.js | 客户标签 |
| `/api/suppliers` | routes/suppliers.js | 供应商 CRUD |
| `/api/receiving-batches` | routes/receiving-batches.js | 收货批次 |
| `/api/supplier-invoices` | routes/supplier-invoices.js | 供应商对账（Excel导入） |
| `/api/dashboard` | routes/dashboard.js | 仪表盘统计 |
| `/api/reports` | routes/reports.js | 日报、缺货报告 |
| `/api/system` | routes/system.js | 价格历史、审计日志、DB信息 |
| `/api/backup` | routes/backup.js | 数据库导出/导入 |

---

## 核心业务逻辑

### 订单状态流转
`created` → `confirmed` → `shipped` → `completed`（可随时 → `cancelled`）
- `shipped`/`completed`/`cancelled` 为锁定状态，不可修改商品明细
- 状态变为 `shipped` 时扣减库存（`stockDeducted` 标志）

### 车次（tripNumber）
订单可分配到车次，拣货页按车次+仓储类型筛选。

### 仓储类型（warehouseType）
商品分三类：`干`（干货）/ `鲜`（鲜货）/ `冻`（冷冻）

### 拣货流程
拣货员在 PickingPage 按车次加载订单商品，逐项标记 picked/out-of-stock，支持 PDF 导出。

### 供应商对账
上传 Excel → 自动匹配商品（精确 + 模糊）→ 人工复核未匹配项 → 确认账单

---

## 测试账号（本地）

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | admin |
| demo | demo123 | staff |
| mgr01~mgr10 | mgr01pass~mgr10pass | manager |

---

## 部署信息
- 前端：Render.com 静态站（`https://mingziapp.onrender.com`）
- 后端：Render.com Web Service（`https://mingziapp-api.onrender.com`）
- 生产环境变量：`DATA_DIR`（SQLite 持久化路径）、`JWT_SECRET`、`PORT`

---

## 开发约定

- 不说废话，不鼓励，直接给结论
- 用户想法有误时主动指出
- 改代码前先读相关文件，不瞎猜
- 前端新增 API 调用统一在 `src/api/client.ts` 添加函数
- 后端新路由在对应 `server/routes/*.js` 文件中添加，并在 `server/index.js` 注册
- 权限变更要同时修改前端 ProtectedRoute 和后端 middleware
- 密码明文存储（已知技术债，生产环境需改为哈希，暂不处理）
