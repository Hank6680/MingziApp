import type {
  AuthResponse,
  Order,
  Product,
  PickingItem,
  OrderItem,
  PendingOrderSummary,
  OrderChangeLog,
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
  supplierId: number
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
