import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react'
import type { CartItem, CustomerCart } from '../types'

interface CartState {
  [customerId: number]: CustomerCart
}

interface CartContextValue {
  carts: CartState
  addToCart: (customerId: number, customerName: string, item: CartItem) => void
  removeFromCart: (customerId: number, productId: number) => void
  updateQty: (customerId: number, productId: number, qty: number) => void
  updatePrice: (customerId: number, productId: number, price: number) => void
  setDeliveryDate: (customerId: number, date: string, customerName?: string) => void
  clearCart: (customerId: number) => void
  clearAll: () => void
  totalCustomers: number
  totalItems: number
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

const STORAGE_KEY = 'mingzi-cart'

function loadFromStorage(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveToStorage(state: CartState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<CartState>(loadFromStorage)

  useEffect(() => {
    saveToStorage(carts)
  }, [carts])

  const addToCart = useCallback((customerId: number, customerName: string, item: CartItem) => {
    setCarts((prev) => {
      const cart = prev[customerId] || {
        customerId,
        customerName,
        deliveryDate: new Date().toISOString().slice(0, 10),
        items: [],
      }
      const existing = cart.items.find((i) => i.productId === item.productId)
      let newItems: CartItem[]
      if (existing) {
        newItems = cart.items.map((i) =>
          i.productId === item.productId ? { ...i, qty: i.qty + item.qty } : i
        )
      } else {
        newItems = [...cart.items, item]
      }
      return { ...prev, [customerId]: { ...cart, customerName, items: newItems } }
    })
  }, [])

  const removeFromCart = useCallback((customerId: number, productId: number) => {
    setCarts((prev) => {
      const cart = prev[customerId]
      if (!cart) return prev
      const newItems = cart.items.filter((i) => i.productId !== productId)
      if (newItems.length === 0) {
        const { [customerId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [customerId]: { ...cart, items: newItems } }
    })
  }, [])

  const updateQty = useCallback((customerId: number, productId: number, qty: number) => {
    setCarts((prev) => {
      const cart = prev[customerId]
      if (!cart) return prev
      const newItems = cart.items.map((i) =>
        i.productId === productId ? { ...i, qty } : i
      )
      return { ...prev, [customerId]: { ...cart, items: newItems } }
    })
  }, [])

  const updatePrice = useCallback((customerId: number, productId: number, price: number) => {
    setCarts((prev) => {
      const cart = prev[customerId]
      if (!cart) return prev
      const newItems = cart.items.map((i) =>
        i.productId === productId ? { ...i, price } : i
      )
      return { ...prev, [customerId]: { ...cart, items: newItems } }
    })
  }, [])

  const setDeliveryDate = useCallback((customerId: number, date: string, customerName?: string) => {
    setCarts((prev) => {
      const cart = prev[customerId]
      if (!cart) {
        // Pre-create cart with the date so it's ready when items are added
        return {
          ...prev,
          [customerId]: { customerId, customerName: customerName || `客户 #${customerId}`, deliveryDate: date, items: [] },
        }
      }
      return { ...prev, [customerId]: { ...cart, deliveryDate: date } }
    })
  }, [])

  const clearCart = useCallback((customerId: number) => {
    setCarts((prev) => {
      const { [customerId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearAll = useCallback(() => {
    setCarts({})
  }, [])

  const value = useMemo(() => {
    const cartEntries = Object.values(carts).filter((c) => c.items.length > 0)
    return {
      carts,
      addToCart,
      removeFromCart,
      updateQty,
      updatePrice,
      setDeliveryDate,
      clearCart,
      clearAll,
      totalCustomers: cartEntries.length,
      totalItems: cartEntries.reduce((sum, c) => sum + c.items.length, 0),
    }
  }, [carts, addToCart, removeFromCart, updateQty, updatePrice, setDeliveryDate, clearCart, clearAll])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider')
  }
  return ctx
}
