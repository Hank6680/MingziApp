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
}

export interface Order {
  id: number
  customerId: number
  deliveryDate: string
  status: string
  tripNumber?: string | null
  totalAmount?: number
  items: OrderItem[]
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
