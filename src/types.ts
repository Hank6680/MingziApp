export type UserRole = 'customer' | 'admin'

export interface User {
  id: number
  username: string
  role: UserRole
  customerId: number | null
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Product {
  id: number
  name: string
  unit: string
  warehouseType: string
  price: number
  isAvailable: number
  stock?: number
  notes?: string | null
}

export interface OrderItem {
  id?: number
  orderId?: number
  productId: number
  qtyOrdered: number
  qtyPicked?: number
  picked?: number
  outOfStock?: number
  status?: string
  productName?: string
  productUnit?: string
  productWarehouseType?: string
  productPrice?: number
  unitPrice?: number
}

export interface OrderChangeLog {
  id: number
  orderId: number
  type: string
  detail?: Record<string, unknown> | null
  createdAt: string
  readAt?: string | null
}

export interface Order {
  id: number
  customerId: number
  deliveryDate: string
  status: string
  tripNumber?: string | null
  totalAmount?: number
  pendingReview?: number
  lastModifiedAt?: string | null
  lastReviewedAt?: string | null
  items?: OrderItem[]
}

export interface PendingOrderSummary extends Order {
  pendingChangeCount?: number
  changes?: OrderChangeLog[]
}

export interface InventoryLog {
  id: number
  productId: number
  type: 'in' | 'return' | 'damage' | 'out'
  quantity: number
  logDate: string
  remark?: string | null
  partnerName?: string | null
  reason?: string | null
  refOrderId?: number | null
  createdAt: string
  productName?: string
  unit?: string
  warehouseType?: string
}

export interface PickingItem {
  itemId: number
  orderId: number
  customerId: number
  tripNumber: string | null
  productId: number
  qtyOrdered: number
  picked: number
  outOfStock: number
  status: string
  productName: string
  productUnit: string
  warehouseType: string
  price: number
}

// --- Suppliers & Receiving Batches ---

export interface Supplier {
  id: number
  name: string
  contact?: string | null
  notes?: string | null
  createdAt: string
}

export interface ReceivingBatchItem {
  id: number
  batchId: number
  productId: number
  productName: string
  quantity: number
  unit?: string
  warehouseType?: string
  createdAt: string
}

export interface ReceivingBatch {
  id: number
  batchNo: string
  supplierId: number
  supplierName?: string
  receivedDate: string
  notes?: string | null
  reconcileStatus: 'pending' | 'reconciled' | 'discrepancy'
  createdAt: string
  itemCount?: number
  totalQty?: number
  items?: ReceivingBatchItem[]
}

export type InvoiceMatchStatus = 'auto_confirmed' | 'manual_confirmed' | 'need_review' | 'unmatched' | 'ignored'

export interface SupplierInvoiceItem {
  id: number
  invoiceId: number
  productName: string
  productId: number | null
  quantity: number
  unitPrice: number
  amount: number
  matchedQty: number | null
  matchStatus: InvoiceMatchStatus
  discrepancyNotes?: string | null
  unit?: string
  warehouseType?: string
}

export interface SupplierInvoice {
  id: number
  invoiceNo?: string | null
  supplierId: number
  supplierName?: string
  invoiceDate?: string
  periodStart?: string | null
  periodEnd?: string | null
  totalAmount: number | null
  notes?: string | null
  status: 'pending' | 'confirmed' | 'partial'
  createdAt: string
  itemCount?: number
  autoConfirmedCount?: number
  needReviewCount?: number
  unmatchedCount?: number
  items?: SupplierInvoiceItem[]
}
