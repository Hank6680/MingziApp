import type {
  AuthResponse,
  Order,
  Product,
  PickingItem,
  OrderItem,
  PendingOrderSummary,
  OrderChangeLog,
  Customer,
  Supplier,
  ReceivingBatch,
  SupplierInvoice,
  SupplierInvoiceItem,
} from '../types'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || 'http://localhost:4000'

interface RequestOptions extends RequestInit {
  token?: string | null
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = data?.error?.message || data?.message || '请求失败'
    throw new Error(message)
  }

  return data as T
}

export function login(username: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function getProductNames(token: string) {
  return request<{ names: string[] }>('/api/products/names', {
    method: 'GET',
    token,
  })
}

export function getProducts(
  params: { q?: string; available?: string; limit?: number; offset?: number },
  token: string
) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.available) query.set('available', params.available)
  if (params.limit != null) query.set('limit', String(params.limit))
  if (params.offset != null) query.set('offset', String(params.offset))
  const search = query.toString() ? `?${query.toString()}` : ''
  return request<{ total: number; items: Product[] }>(`/api/products${search}`, {
    method: 'GET',
    token,
  })
}

export interface OrderItemInput {
  productId: number
  qtyOrdered: number
}

export function createOrder(
  payload: { deliveryDate: string; items: OrderItemInput[]; customerId?: number },
  token: string
) {
  return request<Order>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function getOrders(token: string, customerId?: number) {
  const search = customerId ? `?customerId=${customerId}` : ''
  return request<Order[]>(`/api/orders${search}`, {
    method: 'GET',
    token,
  })
}

export function deleteOrder(orderId: number, token: string) {
  return request<{ success: boolean; deletedOrderId: number }>(`/api/orders/${orderId}`, {
    method: 'DELETE',
    token,
  })
}

export function updateOrderStatus(orderId: number, status: string, token: string) {
  return request<Order>(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  })
}

export function updateProduct(productId: number, payload: Partial<Pick<Product, 'name' | 'unit' | 'warehouseType' | 'price'>>, token: string) {
  return request<Product>(`/api/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function updateProductAvailability(productId: number, isAvailable: boolean, token: string) {
  return request<Product>(`/api/products/${productId}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
    token,
  })
}

export function deleteProduct(productId: number, token: string) {
  return request<{ success: boolean; deleted: number }>(`/api/products/${productId}`, {
    method: 'DELETE',
    token,
  })
}

export function bulkDeleteProducts(ids: number[], token: string) {
  return request<{ success: boolean; deleted: number }>(`/api/products`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
    token,
  })
}

export function bulkUpdateAvailability(ids: number[], isAvailable: boolean, token: string) {
  return request<{ success: boolean; updated: number }>(`/api/products/bulk/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ ids, isAvailable }),
    token,
  })
}

export function bulkUpdatePrice(ids: number[], mode: 'percentage' | 'fixed', value: number, token: string) {
  return request<{ success: boolean; updated: number }>(`/api/products/bulk/price`, {
    method: 'PATCH',
    body: JSON.stringify({ ids, mode, value }),
    token,
  })
}

export function updateOrderTrip(orderId: number, tripNumber: string | null, token: string) {
  return request<Order>(`/api/orders/${orderId}/trip`, {
    method: 'PATCH',
    body: JSON.stringify({ tripNumber }),
    token,
  })
}

export function getPendingOrderChanges(token: string) {
  return request<{ items: PendingOrderSummary[] }>(`/api/orders/pending/changes`, {
    method: 'GET',
    token,
  })
}

export function acknowledgeOrderChange(orderId: number, token: string) {
  return request<{ orderId: number }>(`/api/orders/${orderId}/review`, {
    method: 'PATCH',
    token,
  })
}

export function getPendingOrders(token: string) {
  return request<{ items: PendingOrderSummary[] }>(`/api/orders/pending/changes`, {
    method: 'GET',
    token,
  })
}

export function acknowledgeOrderReview(orderId: number, token: string) {
  return request<{ orderId: number }>(`/api/orders/${orderId}/review`, {
    method: 'PATCH',
    token,
  })
}

export function getOrderChangeLogs(orderId: number, token: string) {
  return request<{ items: OrderChangeLog[] }>(`/api/orders/${orderId}/change-logs`, {
    method: 'GET',
    token,
  })
}

export function getPickingItems(params: { trip: string; warehouseType?: string }, token: string) {
  const query = new URLSearchParams()
  query.set('trip', params.trip)
  if (params.warehouseType && params.warehouseType !== '全部') {
    query.set('warehouseType', params.warehouseType)
  }
  return request<PickingItem[]>(`/api/orders/picking?${query.toString()}`, {
    method: 'GET',
    token,
  })
}

export function updateOrderItemStatus(
  itemId: number,
  payload: { picked?: boolean; outOfStock?: boolean },
  token: string
) {
  return request<OrderItem>(`/api/orders/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export interface OrderItemEditPayload {
  qtyOrdered?: number
  unitPrice?: number
}

export interface AddOrderItemPayload {
  productId: number
  qtyOrdered: number
  unitPrice?: number
}

export function addOrderItem(orderId: number, payload: AddOrderItemPayload, token: string) {
  return request<{ order: Order; redirectedOrderId?: number }>(`/api/orders/${orderId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function updateOrderItemFields(itemId: number, payload: OrderItemEditPayload, token: string) {
  return request<Order>(`/api/orders/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function deleteOrderItem(itemId: number, token: string) {
  return request<Order>(`/api/orders/items/${itemId}`, {
    method: 'DELETE',
    token,
  })
}

export interface InventoryInboundPayload {
  productId: number
  quantity: number
  logDate?: string
  remark?: string
}

export interface InventoryReturnPayload extends InventoryInboundPayload {
  partnerName: string
  reason?: string
}

export interface InventoryDamagePayload {
  productId: number
  quantity: number
  logDate?: string
  reason?: string
}

export function updateInventoryStock(productId: number, payload: { stock?: number; notes?: string | null }, token: string) {
  return request<{ item: Product }>(`/api/inventory/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function getInventorySummary(
  params: { limit?: number; offset?: number; q?: string; warehouseType?: string } = {},
  token: string
) {
  const query = new URLSearchParams()
  if (params.limit != null) query.set('limit', String(params.limit))
  if (params.offset != null) query.set('offset', String(params.offset))
  if (params.q) query.set('q', params.q)
  if (params.warehouseType) query.set('warehouseType', params.warehouseType)
  const search = query.toString() ? `?${query.toString()}` : ''
  return request<{ total: number; items: Product[] }>(`/api/inventory/summary${search}`, {
    method: 'GET',
    token,
  })
}

export function inboundInventory(payload: InventoryInboundPayload, token: string) {
  return request<{ item: Product }>(`/api/inventory/inbound`, {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function createInboundRecord(payload: InventoryInboundPayload, token: string) {
  return inboundInventory(payload, token)
}

export function createReturnRecord(payload: InventoryReturnPayload, token: string) {
  return request<{ item: Product }>(`/api/inventory/returns`, {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function createDamageRecord(payload: InventoryDamagePayload, token: string) {
  return request<{ item: Product }>(`/api/inventory/damages`, {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function getInventoryLogs(params: { type?: string; limit?: number } = {}, token: string) {
  const search = new URLSearchParams()
  if (params.type) search.set('type', params.type)
  if (params.limit) search.set('limit', String(params.limit))
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return request<{ items: Array<Record<string, unknown>> }>(`/api/inventory/logs${suffix}`, {
    method: 'GET',
    token,
  })
}

export interface StockCountItem {
  productId: number
  actualStock: number
}

export function submitStockCount(items: StockCountItem[], warehouseType: string, token: string) {
  return request<{
    success: boolean
    total: number
    adjusted: number
    items: Array<{
      productId: number
      name: string
      systemStock: number
      actualStock: number
      diff: number
      adjusted: boolean
    }>
  }>('/api/inventory/stockcount', {
    method: 'POST',
    body: JSON.stringify({ items, warehouseType }),
    token,
  })
}

// --- Customers ---

export function getCustomers(token: string) {
  return request<{ items: Customer[] }>('/api/customers', { method: 'GET', token })
}

export function createCustomer(payload: { name: string; contact?: string; phone?: string; address?: string; notes?: string }, token: string) {
  return request<{ item: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function updateCustomer(id: number, payload: Partial<{ name: string; contact: string; phone: string; address: string; notes: string }>, token: string) {
  return request<{ item: Customer }>(`/api/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function deleteCustomer(id: number, token: string) {
  return request<void>(`/api/customers/${id}`, { method: 'DELETE', token })
}

export interface FrequentProduct {
  productId: number
  name: string
  unit: string
  warehouseType: string
  price: number
  isAvailable: number
  totalQty: number
  orderCount: number
  lastPrice?: number | null
}

export function getCustomerFrequentProducts(customerId: number, token: string) {
  return request<{ items: FrequentProduct[] }>(`/api/customers/${customerId}/frequent-products`, {
    method: 'GET',
    token,
  })
}

// --- QuickBooks Online ---

export function updateOrderPayment(orderId: number, payment_status: 'paid' | 'unpaid', token: string) {
  return request<{ ok: boolean; orderId: number; payment_status: string }>(`/api/orders/${orderId}/payment`, {
    method: 'PATCH',
    body: JSON.stringify({ payment_status }),
    token,
  })
}

export function syncQboPayments(token: string) {
  return request<{ ok: boolean; updated: number; total: number; message?: string }>('/api/qbo/sync-payments', {
    method: 'POST',
    token,
  })
}

export function recordQboPayment(orderId: number, token: string) {
  return request<{ ok: boolean; skipped?: boolean; message?: string; qboPaymentId?: string }>(`/api/qbo/record-payment/${orderId}`, {
    method: 'POST',
    token,
  })
}

export function pushSupplierInvoiceToQbo(invoiceId: number, token: string) {
  return request<{ ok: boolean; skipped?: boolean; message?: string; qboBillId?: string; qboBillDocNumber?: string; qboTotal?: number }>(`/api/qbo/push-bill/${invoiceId}`, {
    method: 'POST',
    token,
  })
}

export function pushBatchBillToQbo(batchId: number, token: string) {
  return request<{ ok: boolean; skipped?: boolean; message?: string; qboBillId?: string; qboBillDocNumber?: string }>(`/api/qbo/push-batch-bill/${batchId}`, {
    method: 'POST',
    token,
  })
}

export function pushOrderToQbo(orderId: number, token: string) {
  return request<{ ok: boolean; qboInvoiceId: string; qboInvoiceDocNumber: string; qboTotal: number }>(`/api/qbo/push/${orderId}`, {
    method: 'POST',
    token,
  })
}

export async function downloadInvoicePdf(qboInvoiceId: string, token: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/qbo/invoice/${qboInvoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error?.message || '下载 PDF 失败')
  }
  return res.blob()
}

// --- Suppliers ---

export function getSuppliers(token: string) {
  return request<{ items: Supplier[] }>('/api/suppliers', { method: 'GET', token })
}

export function createSupplier(payload: { name: string; contact?: string; notes?: string }, token: string) {
  return request<{ item: Supplier }>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function updateSupplier(id: number, payload: Partial<{ name: string; contact: string; notes: string }>, token: string) {
  return request<{ item: Supplier }>(`/api/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function deleteSupplier(id: number, token: string) {
  return request<void>(`/api/suppliers/${id}`, { method: 'DELETE', token })
}

// --- Receiving Batches ---

export interface CreateBatchPayload {
  supplierId?: number
  receivedDate: string
  notes?: string
  items: { productId: number; quantity: number }[]
}

export function createReceivingBatch(payload: CreateBatchPayload, token: string) {
  return request<{ batch: ReceivingBatch }>('/api/receiving-batches', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function updateBatchSupplier(batchId: number, supplierId: number, token: string) {
  return request<{ ok: boolean; supplierId: number; supplierName: string }>(`/api/receiving-batches/${batchId}/supplier`, {
    method: 'PATCH',
    body: JSON.stringify({ supplierId }),
    token,
  })
}

export function getReceivingBatches(
  params: { supplierId?: number; startDate?: string; endDate?: string; reconcileStatus?: string; limit?: number; offset?: number } = {},
  token: string
) {
  const q = new URLSearchParams()
  if (params.supplierId) q.set('supplierId', String(params.supplierId))
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
  if (params.reconcileStatus) q.set('reconcileStatus', params.reconcileStatus)
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.offset != null) q.set('offset', String(params.offset))
  const search = q.toString() ? `?${q.toString()}` : ''
  return request<{ total: number; items: ReceivingBatch[] }>(`/api/receiving-batches${search}`, {
    method: 'GET',
    token,
  })
}

export function getReceivingBatch(id: number, token: string) {
  return request<{ batch: ReceivingBatch }>(`/api/receiving-batches/${id}`, {
    method: 'GET',
    token,
  })
}

// --- Supplier Invoices ---

export function importSupplierInvoice(formData: FormData, token: string): Promise<{
  invoice: SupplierInvoice
  items: SupplierInvoiceItem[]
  summary: { total: number; autoConfirmed: number; needReview: number; unmatched: number }
}> {
  return fetch(`${API_BASE}/api/supplier-invoices/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || '上传失败')
    return data
  })
}

export function getSupplierInvoices(
  params: { supplierId?: number; status?: string; limit?: number; offset?: number } = {},
  token: string
) {
  const q = new URLSearchParams()
  if (params.supplierId) q.set('supplierId', String(params.supplierId))
  if (params.status) q.set('status', params.status)
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.offset != null) q.set('offset', String(params.offset))
  const search = q.toString() ? `?${q.toString()}` : ''
  return request<{ total: number; items: SupplierInvoice[] }>(`/api/supplier-invoices${search}`, {
    method: 'GET',
    token,
  })
}

export function getSupplierInvoice(id: number, token: string) {
  return request<{ invoice: SupplierInvoice }>(`/api/supplier-invoices/${id}`, {
    method: 'GET',
    token,
  })
}

export function updateInvoiceItem(
  invoiceId: number,
  itemId: number,
  payload: { matchStatus?: string; productId?: number | null; discrepancyNotes?: string },
  token: string
) {
  return request<{ item: SupplierInvoiceItem }>(`/api/supplier-invoices/${invoiceId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function confirmInvoice(invoiceId: number, token: string) {
  return request<{ invoice: SupplierInvoice }>(`/api/supplier-invoices/${invoiceId}/confirm`, {
    method: 'POST',
    token,
  })
}

// --- Dashboard ---

export interface DashboardTrend {
  day: string
  orders: number
  revenue: number
}

export interface DashboardAlert {
  type: string
  level: string
  title: string
  items?: Array<{ id: number; name: string; stock: number; unit: string }>
}

export interface TripSummary {
  tripNumber: string
  orderCount: number
  pickedItems: number
  totalItems: number
}

export interface DashboardStats {
  stats: {
    totalProducts: number
    availableProducts: number
    lowStockProducts: number
    todayOrders: number
    pendingOrders: number
    totalRevenue: number
  }
  trends: DashboardTrend[]
  alerts: DashboardAlert[]
  tripSummary: TripSummary[]
}

export function getDashboardStats(token: string) {
  return request<DashboardStats>('/api/dashboard/stats', { method: 'GET', token })
}

export function getTripNumbers(token: string) {
  return request<{ trips: string[] }>('/api/dashboard/trips', { method: 'GET', token })
}

export function getOrdersByTrip(trip: string, token: string) {
  return request<Order[]>(`/api/orders?tripNumber=${encodeURIComponent(trip)}`, { method: 'GET', token })
}

// --- System ---

export interface PriceHistoryEntry {
  id: number
  productId: number
  oldPrice: number | null
  newPrice: number
  changedAt: string
  changedBy: string | null
}

export function getPriceHistory(productId: number, token: string) {
  return request<{ product: { id: number; name: string }; items: PriceHistoryEntry[] }>(
    `/api/system/price-history/${productId}`,
    { method: 'GET', token }
  )
}

export interface AuditLogEntry {
  id: number
  action: string
  entity: string | null
  entityId: number | null
  detail: string | null
  username: string | null
  createdAt: string
}

export function getAuditLogs(params: { limit?: number; entity?: string } = {}, token: string) {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.entity) q.set('entity', params.entity)
  const s = q.toString() ? `?${q.toString()}` : ''
  return request<{ items: AuditLogEntry[] }>(`/api/system/audit-logs${s}`, { method: 'GET', token })
}

export function getDbInfo(token: string) {
  return request<{ tables: Record<string, number> }>('/api/system/db-info', { method: 'GET', token })
}

// --- Customer Tags ---

export function getCustomerTags(token: string) {
  return request<{ tags: string[] }>('/api/customer-tags', { method: 'GET', token })
}

export function getCustomersGrouped(token: string) {
  return request<{
    customers: Customer[]
    grouped: Record<string, Customer[]>
    tags: string[]
    untagged: Customer[]
  }>('/api/customer-tags/grouped', { method: 'GET', token })
}

export function setCustomerTags(customerId: number, tags: string[], token: string) {
  return request<{ customerId: number; tags: string[] }>(`/api/customer-tags/customer/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
    token,
  })
}

// --- Batch Orders (staff) ---

export interface BatchOrderInput {
  customerId: number
  deliveryDate: string
  items: { productId: number; qtyOrdered: number; unitPrice?: number }[]
}

export function createOrdersBatch(orders: BatchOrderInput[], token: string) {
  return request<{ orders: { orderId: number; customerId: number; deliveryDate: string }[]; count: number }>(
    '/api/orders/batch',
    {
      method: 'POST',
      body: JSON.stringify({ orders }),
      token,
    }
  )
}
