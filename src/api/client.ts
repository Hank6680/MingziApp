import type { AuthResponse, Order, Product, PickingItem, OrderItem } from '../types'

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

export function createOrder(payload: { deliveryDate: string; items: { productId: number; qtyOrdered: number }[] }, token: string) {
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

export interface InventoryInboundPayload {
  productId: number
  quantity: number
  logDate?: string
  remark?: string
}

export function getInventorySummary(token: string) {
  return request<{ items: Product[] }>(`/api/inventory/summary`, {
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
