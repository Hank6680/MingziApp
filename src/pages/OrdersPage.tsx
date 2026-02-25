import { useCallback, useEffect, useState } from 'react'
import {
  addOrderItem,
  acknowledgeOrderChange,
  deleteOrderItem,
  getOrderChangeLogs,
  getOrders,
  getPendingOrderChanges,
  getProducts,
  updateOrderItemFields,
  updateOrderStatus,
  updateOrderTrip,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Order, OrderChangeLog, PendingOrderSummary, Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'
import { describeOrderChange } from '../utils/orderChanges'
import { OrderStatusBadge, WarehouseTypeBadge, PickingStatusBadge } from '../components/Badge'

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

const computeOrderTotal = (items?: Order['items']) =>
  Math.round(
    (items ?? []).reduce((sum, item) => {
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
  const [pendingOrders, setPendingOrders] = useState<PendingOrderSummary[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [pendingExpanded, setPendingExpanded] = useState(false)
  const [pendingActions, setPendingActions] = useState<Record<number, boolean>>({})
  const [orderLogs, setOrderLogs] = useState<Record<number, OrderChangeLog[]>>({})
  const [orderLogsLoading, setOrderLogsLoading] = useState<Record<number, boolean>>({})
  const [orderLogsVisible, setOrderLogsVisible] = useState<Record<number, boolean>>({})
  const [orderLogsError, setOrderLogsError] = useState<Record<number, string | null>>({})

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
      setPendingError(null)
      const data = await getPendingOrderChanges(token)
      setPendingOrders(data.items ?? [])
    } catch (err) {
      setPendingError((err as Error).message)
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
    fetchPendingOrders()
  }, [fetchPendingOrders])

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

  const handleConfirmPending = async (orderId: number) => {
    if (!token) return
    try {
      setPendingActions((prev) => ({ ...prev, [orderId]: true }))
      await acknowledgeOrderChange(orderId, token)
      setMessage('已确认拣货变更')
      await Promise.all([fetchPendingOrders(), fetchOrders()])
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setPendingActions((prev) => ({ ...prev, [orderId]: false }))
    }
  }

  const toggleOrderLogs = async (orderId: number) => {
    if (!token) return
    const nextVisible = !orderLogsVisible[orderId]
    setOrderLogsVisible((prev) => ({ ...prev, [orderId]: nextVisible }))
    if (!nextVisible) return
    if (orderLogs[orderId]?.length) return
    try {
      setOrderLogsLoading((prev) => ({ ...prev, [orderId]: true }))
      setOrderLogsError((prev) => ({ ...prev, [orderId]: null }))
      const data = await getOrderChangeLogs(orderId, token)
      setOrderLogs((prev) => ({ ...prev, [orderId]: data.items ?? [] }))
    } catch (err) {
      setOrderLogsError((prev) => ({ ...prev, [orderId]: (err as Error).message }))
    } finally {
      setOrderLogsLoading((prev) => ({ ...prev, [orderId]: false }))
    }
  }

  return (
    <div className="page-content">
      <div className="orders-header">
        <div className="page-header">
          <h1>订单列表</h1>
          <p>查看和管理所有订单</p>
        </div>
        <button onClick={fetchOrders}>刷新</button>
      </div>
      {loading && <p>加载中…</p>}
      {error && <p className="error-text">{error}</p>}
      {message && <p className="hint">{message}</p>}

      {isAdmin && (
        <section className="pending-changes-panel">
          <div className="pending-header">
            <div>
              <strong>本次拣货有 {pendingOrders.length} 单待确认变更</strong>
              {pendingOrders.length === 0 && !pendingLoading && <p className="muted">暂无加单或数量差异。</p>}
            </div>
            <div className="pending-actions">
              <button type="button" className="ghost" onClick={fetchPendingOrders} disabled={pendingLoading}>
                {pendingLoading ? '刷新中…' : '刷新'}
              </button>
              {pendingOrders.length > 0 && (
                <button type="button" onClick={() => setPendingExpanded((prev) => !prev)}>
                  {pendingExpanded ? '收起' : '展开查看'}
                </button>
              )}
            </div>
          </div>
          {pendingError && <p className="error-text">{pendingError}</p>}
          {pendingExpanded && pendingOrders.length > 0 && (
            <ul className="pending-orders-list">
              {pendingOrders.map((pending) => (
                <li key={pending.id}>
                  <div className="pending-order-meta">
                    <div>
                      <span>
                        订单 #{pending.id} · 客户 {pending.customerId ?? '-'} · 送达 {formatDeliveryDate(pending.deliveryDate)}
                      </span>
                      <small>最近变更：{pending.lastModifiedAt ? new Date(pending.lastModifiedAt).toLocaleString() : '-'}</small>
                    </div>
                    <div className="pending-order-actions">
                      <span className="badge">{pending.pendingChangeCount ?? pending.changes?.length ?? 0} 条差异</span>
                      <button
                        type="button"
                        onClick={() => handleConfirmPending(pending.id)}
                        disabled={pendingActions[pending.id]}
                      >
                        {pendingActions[pending.id] ? '处理中…' : '确认拣货变更'}
                      </button>
                    </div>
                  </div>
                  {pending.changes && pending.changes.length > 0 ? (
                    <ul className="pending-change-details">
                      {pending.changes.map((change) => (
                        <li key={change.id}>
                          <div>
                            <span>{new Date(change.createdAt).toLocaleString()}</span>
                            <p>{describeOrderChange(change)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">暂无差异明细。</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
                    {order.pendingReview ? <span className="badge warning">待确认变更</span> : null}
                    <p>客户 ID: {order.customerId ?? '未知'}</p>
                    <p>送达日期: {formatDeliveryDate(order.deliveryDate)}</p>
                    {order.lastModifiedAt && <small>最近变更：{new Date(order.lastModifiedAt).toLocaleString()}</small>}
                  </div>
                  <div className="order-controls">
                    <div>
                      <p>状态：<OrderStatusBadge status={order.status} /></p>
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
                        <div className="order-head-actions">
                          <button type="button" className="ghost" onClick={() => startEditOrder(order)}>
                            {editingOrderId === order.id ? '完成编辑' : '编辑订单'}
                          </button>
                          <button type="button" className="ghost" onClick={() => toggleOrderLogs(order.id)}>
                            {orderLogsVisible[order.id] ? '隐藏变更日志' : '查看变更日志'}
                          </button>
                        </div>
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
                        <td><WarehouseTypeBadge type={item.productWarehouseType} /></td>
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
                          <PickingStatusBadge picked={item.picked} outOfStock={item.outOfStock} status={item.status} />
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
            {orderLogsVisible[order.id] && (
              <div className="order-change-logs">
                <h4>变更日志</h4>
                {orderLogsLoading[order.id] && <p>加载日志…</p>}
                {orderLogsError[order.id] && <p className="error-text">{orderLogsError[order.id]}</p>}
                {!orderLogsLoading[order.id] && !orderLogsError[order.id] && (
                  orderLogs[order.id]?.length ? (
                    <ul>
                      {orderLogs[order.id].map((log) => (
                        <li key={log.id}>
                          <div>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                            <p>{describeOrderChange(log)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">暂无日志记录。</p>
                  )
                )}
              </div>
            )}
          </div>
          ))}
        </div>
      )}
      {adminMessage && <p className="hint">{adminMessage}</p>}
    </div>
  )
}
