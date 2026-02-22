import { useCallback, useEffect, useState } from 'react'
import {
  addOrderItem,
  acknowledgeOrderChange,
  deleteOrderItem,
  getOrders,
  getPendingOrderChanges,
  getProducts,
  updateOrderItemFields,
  updateOrderStatus,
  updateOrderTrip,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Order, Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'

const STATUSES = ['created', 'confirmed', 'shipped', 'completed', 'cancelled']

const formatDeliveryDate = (value?: string | null) => {
  if (!value) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${Number(m)}/${Number(d)}/${y}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

const getLineTotals = (item: Order['items'][number]) => {
  const qty = Number(item.qtyOrdered) || 0
  const unitPrice = Number(item.unitPrice ?? item.productPrice ?? 0)
  const lineTotal = Math.round(qty * unitPrice * 100) / 100
  return { unitPrice, lineTotal }
}

const computeOrderTotal = (items: Order['items']) =>
  Math.round(
    items.reduce((sum, item) => {
      const { lineTotal } = getLineTotals(item)
      return sum + lineTotal
    }, 0) * 100
  ) / 100

export default function OrdersPage() {
  const { token, user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tripInputs, setTripInputs] = useState<Record<number, string>>({})
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null)
  const [editQuantities, setEditQuantities] = useState<Record<number, string>>({})
  const [editPrices, setEditPrices] = useState<Record<number, string>>({})
  const [newItemForm, setNewItemForm] = useState({ productId: '', qty: '', unitPrice: '' })
  const [productsCache, setProductsCache] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState<string | null>(null)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  const isAdmin = user?.role === 'admin'

  const loadProducts = useCallback(async () => {
    if (!token || !isAdmin || productsCache.length) return
    try {
      setProductsLoading(true)
      const data = await getProducts({ limit: 200, offset: 0 }, token)
      setProductsCache(data.items)
    } catch (err) {
      console.error(err)
    } finally {
      setProductsLoading(false)
    }
  }, [isAdmin, productsCache, token])

  const fetchPendingOrders = useCallback(async () => {
    if (!token || !isAdmin) return
    try {
      setPendingLoading(true)
      const data = await getPendingOrderChanges(token)
      setPendingOrders(data.items ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setPendingLoading(false)
    }
  }, [isAdmin, token])

  const fetchOrders = async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const data = await getOrders(token)
      setOrders(data)
      setTripInputs(
        data.reduce<Record<number, string>>((acc, order) => {
          acc[order.id] = order.tripNumber ?? ''
          return acc
        }, {})
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (editingOrderId && isAdmin) {
      loadProducts()
    }
  }, [editingOrderId, isAdmin, loadProducts])

  const handleStatusChange = async (orderId: number, status: string) => {
    if (!token) return
    try {
      await updateOrderStatus(orderId, status, token)
      setMessage('状态已更新')
      window.dispatchEvent(new CustomEvent(INVENTORY_REFRESH_EVENT))
      fetchOrders()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleTripChange = (orderId: number, value: string) => {
    setTripInputs((prev) => ({ ...prev, [orderId]: value }))
  }

  const handleTripSave = async (orderId: number) => {
    if (!token) return
    try {
      await updateOrderTrip(orderId, tripInputs[orderId]?.trim() || null, token)
      setMessage('车次已更新')
      fetchOrders()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => {
    if (!editingOrderId) return
    const target = orders.find((o) => o.id === editingOrderId)
    if (!target) {
      setEditingOrderId(null)
      return
    }
    const qtyMap: Record<number, string> = {}
    const priceMap: Record<number, string> = {}
    target.items?.forEach((item) => {
      if (item.id) {
        qtyMap[item.id] = String(item.qtyOrdered)
        priceMap[item.id] = item.unitPrice != null ? String(item.unitPrice) : item.productPrice != null ? String(item.productPrice) : ''
      }
    })
    setEditQuantities(qtyMap)
    setEditPrices(priceMap)
  }, [editingOrderId, orders])

  const startEditOrder = (order: Order) => {
    if (!isAdmin) return
    if (editingOrderId === order.id) {
      setEditingOrderId(null)
      setEditQuantities({})
      setEditPrices({})
      setAdminMessage(null)
      return
    }
    const qtyMap: Record<number, string> = {}
    const priceMap: Record<number, string> = {}
    order.items?.forEach((item) => {
      if (item.id) {
        qtyMap[item.id] = String(item.qtyOrdered)
        priceMap[item.id] = item.unitPrice != null ? String(item.unitPrice) : item.productPrice != null ? String(item.productPrice) : ''
      }
    })
    setEditQuantities(qtyMap)
    setEditPrices(priceMap)
    setNewItemForm({ productId: '', qty: '', unitPrice: '' })
    setEditingOrderId(order.id)
    setAdminMessage(null)
  }

  const handleItemFieldChange = (itemId: number, field: 'qty' | 'price', value: string) => {
    if (field === 'qty') {
      setEditQuantities((prev) => ({ ...prev, [itemId]: value }))
    } else {
      setEditPrices((prev) => ({ ...prev, [itemId]: value }))
    }
  }

  const handleSaveItem = async (item: Order['items'][number]) => {
    if (!token || !item.id) return
    try {
      const payload: { qtyOrdered?: number; unitPrice?: number } = {}
      const qtyVal = editQuantities[item.id]
      const priceVal = editPrices[item.id]
      if (qtyVal != null && qtyVal !== String(item.qtyOrdered)) {
        payload.qtyOrdered = Number(qtyVal)
      }
      if (priceVal != null && priceVal !== String(item.unitPrice ?? item.productPrice ?? '')) {
        payload.unitPrice = Number(priceVal)
      }
      if (!payload.qtyOrdered && !payload.unitPrice) {
        setAdminMessage('无需保存：没有变化')
        return
      }
      await updateOrderItemFields(item.id, payload, token)
      setAdminMessage('订单已更新')
      await fetchOrders()
    } catch (err) {
      setAdminMessage((err as Error).message)
    }
  }

  const handleDeleteItem = async (item: Order['items'][number]) => {
    if (!token || !item.id) return
    if (!window.confirm(`确认删除商品「${item.productName ?? item.productId}」吗？`)) return
    try {
      await deleteOrderItem(item.id, token)
      setAdminMessage('商品已删除')
      await fetchOrders()
    } catch (err) {
      setAdminMessage((err as Error).message)
    }
  }

  const handleAddItem = async (orderId: number) => {
    if (!token) return
    const productId = Number(newItemForm.productId)
    const qty = Number(newItemForm.qty)
    if (!Number.isInteger(productId) || productId <= 0) {
      setAdminMessage('请选择商品')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setAdminMessage('请输入有效数量')
      return
    }
    try {
      const payload: { productId: number; qtyOrdered: number; unitPrice?: number } = { productId, qtyOrdered: qty }
      if (newItemForm.unitPrice) {
        payload.unitPrice = Number(newItemForm.unitPrice)
      }
      const result = await addOrderItem(orderId, payload, token)
      if (result.redirectedOrderId) {
        setAdminMessage(`原订单已发货，新订单 #${result.redirectedOrderId} 已创建。`)
      } else {
        setAdminMessage('已添加商品')
      }
      setNewItemForm({ productId: '', qty: '', unitPrice: '' })
      await fetchOrders()
      window.dispatchEvent(new CustomEvent(INVENTORY_REFRESH_EVENT))
    } catch (err) {
      setAdminMessage((err as Error).message)
    }
  }

  return (
    <div>
      <div className="orders-header">
        <h1>订单列表</h1>
        <button onClick={fetchOrders}>刷新</button>
      </div>
      {loading && <p>加载中…</p>}
      {error && <p className="error-text">{error}</p>}
      {message && <p className="hint">{message}</p>}

      {orders.length === 0 ? (
        <p>暂无订单。</p>
      ) : (
        <div className="orders">
          {orders.map((order) => (
            <div key={order.id}>
              <div className="order-card">
                <div className="order-head">
                <div>
                  <strong>订单 #{order.id}</strong>
                  <p>客户 ID: {order.customerId ?? '未知'}</p>
                  <p>送达日期: {formatDeliveryDate(order.deliveryDate)}</p>
                </div>
                <div className="order-controls">
                  <div>
                    <p>状态：{order.status}</p>
                    {isAdmin && (
                      <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)}>
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {isAdmin && (
                    <>
                      <div className="trip-input">
                        <label>
                          车次
                          <input value={tripInputs[order.id] ?? ''} onChange={(e) => handleTripChange(order.id, e.target.value)} />
                        </label>
                        <button type="button" onClick={() => handleTripSave(order.id)}>
                          保存
                        </button>
                      </div>
                      <button type="button" className="ghost" onClick={() => startEditOrder(order)}>
                        {editingOrderId === order.id ? '完成编辑' : '编辑订单'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>单位</th>
                    <th>数量</th>
                    <th>仓储</th>
                    <th>单价</th>
                    <th>小计</th>
                    <th>拣货状态</th>
                    {isAdmin && editingOrderId === order.id && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item) => {
                    const { unitPrice, lineTotal } = getLineTotals(item)
                    const isRowEditable = isAdmin && editingOrderId === order.id && Boolean(item.id)
                    const qtyValue = item.id ? editQuantities[item.id] ?? String(item.qtyOrdered) : String(item.qtyOrdered)
                    const priceValue = item.id
                      ? editPrices[item.id] ?? String(unitPrice)
                      : String(unitPrice)
                    return (
                      <tr key={`${order.id}-${item.productId}`}>
                        <td>{item.productName ?? item.productId}</td>
                        <td>{item.productUnit}</td>
                        <td>
                          {isRowEditable ? (
                            <input
                              type="number"
                              value={qtyValue}
                              onChange={(e) => handleItemFieldChange(item.id!, 'qty', e.target.value)}
                              min={item.productUnit === 'kg' ? 0.1 : 1}
                              step={item.productUnit === 'kg' ? 0.1 : 1}
                            />
                          ) : (
                            item.qtyOrdered
                          )}
                        </td>
                        <td>{item.productWarehouseType}</td>
                        <td>
                          {isRowEditable ? (
                            <input
                              type="number"
                              step="0.01"
                              value={priceValue}
                              onChange={(e) => handleItemFieldChange(item.id!, 'price', e.target.value)}
                            />
                          ) : (
                            formatMoney(unitPrice)
                          )}
                        </td>
                        <td>{formatMoney(lineTotal)}</td>
                        <td>
                          {item.outOfStock
                            ? '缺货'
                            : item.picked
                              ? '已拣'
                              : item.status === 'picked'
                                ? '已拣'
                                : '待拣'}
                        </td>
                        {isAdmin && editingOrderId === order.id && (
                          <td className="admin-actions">
                            {isRowEditable ? (
                              <>
                                <button type="button" onClick={() => handleSaveItem(item)}>
                                  保存
                                </button>
                                <button type="button" className="danger" onClick={() => handleDeleteItem(item)}>
                                  删除
                                </button>
                              </>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {isAdmin && editingOrderId === order.id && (
                <div className="order-add-item">
                  <h4>添加商品</h4>
                  <div className="order-add-form">
                    <select
                      value={newItemForm.productId}
                      onChange={(e) => setNewItemForm((prev) => ({ ...prev, productId: e.target.value }))}
                      disabled={productsLoading}
                    >
                      <option value="">选择商品</option>
                      {productsCache.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.1}
                      step="0.1"
                      placeholder="数量"
                      value={newItemForm.qty}
                      onChange={(e) => setNewItemForm((prev) => ({ ...prev, qty: e.target.value }))}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="单价（可选）"
                      value={newItemForm.unitPrice}
                      onChange={(e) => setNewItemForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
                    />
                    <button type="button" onClick={() => handleAddItem(order.id)}>
                      添加
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="order-price-summary">
              订单总价：{formatMoney(order.totalAmount ?? computeOrderTotal(order.items ?? []))}
            </div>
          </div>
          ))}
        </div>
      )}
      {adminMessage && <p className="hint">{adminMessage}</p>}
    </div>
  )
}
