import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addOrderItem,
  acknowledgeOrderChange,
  deleteOrder,
  deleteOrderItem,
  getCustomers,
  getOrderChangeLogs,
  getOrders,
  getPendingOrderChanges,
  getProducts,
  updateOrderItemFields,
  updateOrderStatus,
  updateOrderTrip,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Customer, Order, OrderChangeLog, OrderItem, PendingOrderSummary, Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'
import { describeOrderChange } from '../utils/orderChanges'
import { OrderStatusBadge, WarehouseTypeBadge, PickingStatusBadge } from '../components/Badge'

const STATUSES = ['created', 'confirmed', 'shipped', 'completed', 'cancelled']
const STATUS_LABELS: Record<string, string> = {
  created: '已创建',
  confirmed: '已确认',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}
const RISKY_STATUSES = new Set(['shipped', 'completed', 'cancelled'])

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

const toDateStr = (value?: string | null) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const getLineTotals = (item: OrderItem) => {
  const qty = Number(item.qtyOrdered) || 0
  const unitPrice = Number(item.unitPrice ?? item.productPrice ?? 0)
  const lineTotal = Math.round(qty * unitPrice * 100) / 100
  return { unitPrice, lineTotal }
}

const computeOrderTotal = (items?: OrderItem[]) =>
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

  // Bulk operations
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set())
  const [bulkTripInput, setBulkTripInput] = useState('')
  const [bulkStatusInput, setBulkStatusInput] = useState('')
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkConfirmStatus, setBulkConfirmStatus] = useState<string | null>(null)

  // Customers
  const [customers, setCustomers] = useState<Customer[]>([])

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterTrip, setFilterTrip] = useState('')

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    orderId: number
    fromStatus: string
    toStatus: string
  } | null>(null)

  // Delete order confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ orderId: number; customerName: string } | null>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

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

  // Auto-refresh when page regains focus (e.g. switching tabs or navigating back)
  useEffect(() => {
    const handleFocus = () => {
      fetchOrders()
      if (isAdmin) fetchPendingOrders()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin])

  // Load customers for name mapping
  useEffect(() => {
    if (token && isAdmin) {
      getCustomers(token).then((d) => setCustomers(d.items || [])).catch(() => {})
    }
  }, [token, isAdmin])

  useEffect(() => {
    if (editingOrderId && isAdmin) {
      loadProducts()
    }
  }, [editingOrderId, isAdmin, loadProducts])

  // Client-side filtering
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filterStatus && order.status !== filterStatus) return false
      if (filterCustomer && String(order.customerId) !== filterCustomer.trim()) return false
      if (filterTrip) {
        const trip = (order.tripNumber ?? '').toLowerCase()
        if (!trip.includes(filterTrip.trim().toLowerCase())) return false
      }
      const orderDate = toDateStr(order.deliveryDate)
      if (filterDateFrom && orderDate < filterDateFrom) return false
      if (filterDateTo && orderDate > filterDateTo) return false
      return true
    })
  }, [orders, filterStatus, filterCustomer, filterTrip, filterDateFrom, filterDateTo])

  const customerMap = useMemo(() => {
    const map = new Map<number, string>()
    customers.forEach((c) => map.set(c.id, c.name))
    return map
  }, [customers])

  const getCustomerDisplay = (order: Order) =>
    order.customerName || customerMap.get(order.customerId) || `客户 #${order.customerId}`

  const hasActiveFilters = filterStatus || filterCustomer || filterDateFrom || filterDateTo || filterTrip

  const resetFilters = () => {
    setFilterStatus('')
    setFilterCustomer('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterTrip('')
  }

  // Unique trip numbers for reference
  const tripNumbers = useMemo(() => {
    const trips = new Set<string>()
    orders.forEach((o) => { if (o.tripNumber) trips.add(o.tripNumber) })
    return [...trips].sort()
  }, [orders])

  const handleStatusChange = (orderId: number, newStatus: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order || order.status === newStatus) return
    if (RISKY_STATUSES.has(newStatus)) {
      setConfirmDialog({ orderId, fromStatus: order.status, toStatus: newStatus })
    } else {
      doStatusChange(orderId, newStatus)
    }
  }

  const doStatusChange = async (orderId: number, status: string) => {
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

  const confirmStatusChange = () => {
    if (!confirmDialog) return
    doStatusChange(confirmDialog.orderId, confirmDialog.toStatus)
    setConfirmDialog(null)
  }

  const handleDeleteOrder = async () => {
    if (!token || !deleteConfirm) return
    try {
      await deleteOrder(deleteConfirm.orderId, token)
      setMessage(`订单 #${deleteConfirm.orderId} 已删除`)
      setDeleteConfirm(null)
      await Promise.all([fetchOrders(), fetchPendingOrders()])
    } catch (err) {
      setMessage((err as Error).message)
      setDeleteConfirm(null)
    }
  }

  // Generate delivery note via browser print (supports Chinese natively)
  const generateDeliveryNote = (tripNumber: string) => {
    const tripOrders = filteredOrders.filter((o) => o.tripNumber === tripNumber)
    if (tripOrders.length === 0) {
      setMessage('该车次无订单')
      return
    }
    const now = new Date().toLocaleString('zh-CN')

    const ordersHtml = tripOrders.map((order) => {
      const custName = order.customerName || customerMap.get(order.customerId) || `客户 #${order.customerId}`
      const rows = (order.items || []).map((item) => {
        const { unitPrice, lineTotal } = getLineTotals(item)
        return `<tr>
          <td>${item.productName ?? item.productId}</td>
          <td>${item.productUnit ?? ''}</td>
          <td>${item.qtyOrdered}</td>
          <td style="text-align:right">${unitPrice.toFixed(2)}</td>
          <td style="text-align:right">${lineTotal.toFixed(2)}</td>
        </tr>`
      }).join('')
      const total = computeOrderTotal(order.items)
      return `
        <div class="order-block">
          <p class="order-info">订单 #${order.id} &nbsp;|&nbsp; 客户: <strong>${custName}</strong> &nbsp;|&nbsp; 送达: ${formatDeliveryDate(order.deliveryDate)}</p>
          <table>
            <thead><tr><th>商品</th><th>单位</th><th>数量</th><th style="text-align:right">单价</th><th style="text-align:right">小计</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="order-total">小计：${total.toFixed(2)} 元</p>
          <p class="sign-line">签收人：________________ &nbsp;&nbsp; 日期：________________</p>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>配送单 - ${tripNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; font-size: 12px; color: #333; padding: 15mm; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .print-time { font-size: 10px; color: #666; margin-bottom: 16px; }
  .order-block { margin-bottom: 20px; page-break-inside: avoid; }
  .order-info { font-size: 12px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 11px; text-align: left; }
  th { background: #2d7a4f; color: #fff; font-weight: 600; }
  .order-total { text-align: right; font-weight: 600; font-size: 12px; margin-bottom: 8px; }
  .sign-line { font-size: 10px; color: #666; margin-top: 6px; }
  @media print {
    body { padding: 0; }
    .order-block { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>配送单 - ${tripNumber}</h1>
  <p class="print-time">打印时间：${now}</p>
  ${ordersHtml}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setMessage(`配送单已打开：${tripNumber}（在弹出窗口中打印或存为PDF）`)
    } else {
      setMessage('弹出窗口被拦截，请允许弹出窗口后重试')
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

  const handleSaveItem = async (item: OrderItem) => {
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

  const handleDeleteItem = async (item: OrderItem) => {
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

  const allFilteredSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.has(o.id))

  const toggleSelectOrder = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev)
        filteredOrders.forEach((o) => next.delete(o.id))
        return next
      })
    } else {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev)
        filteredOrders.forEach((o) => next.add(o.id))
        return next
      })
    }
  }

  const handleBulkTripSave = async () => {
    if (selectedOrderIds.size === 0 || !token) return
    try {
      setBulkProcessing(true)
      await Promise.all(
        Array.from(selectedOrderIds).map((id) =>
          updateOrderTrip(id, bulkTripInput.trim() || null, token)
        )
      )
      setMessage(`已为 ${selectedOrderIds.size} 个订单设置车次`)
      setBulkTripInput('')
      fetchOrders()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleBulkStatusChange = async (targetStatus: string) => {
    if (selectedOrderIds.size === 0 || !token) return
    try {
      setBulkProcessing(true)
      await Promise.all(
        Array.from(selectedOrderIds).map((id) => updateOrderStatus(id, targetStatus, token))
      )
      setMessage(`已将 ${selectedOrderIds.size} 个订单状态改为「${STATUS_LABELS[targetStatus] || targetStatus}」`)
      setBulkConfirmStatus(null)
      setBulkStatusInput('')
      window.dispatchEvent(new CustomEvent(INVENTORY_REFRESH_EVENT))
      fetchOrders()
    } catch (err) {
      setMessage((err as Error).message)
      setBulkConfirmStatus(null)
    } finally {
      setBulkProcessing(false)
    }
  }

  return (
    <div className="page-content">
      <div className="orders-header">
        <div className="page-header">
          <h1>订单列表</h1>
          <p>查看和管理所有订单（共 {orders.length} 单{hasActiveFilters ? `，筛选后 ${filteredOrders.length} 单` : ''}）</p>
        </div>
        <button onClick={fetchOrders}>刷新</button>
      </div>
      {loading && <p>加载中…</p>}
      {error && <p className="error-text">{error}</p>}
      {message && <p className="hint">{message}</p>}

      {/* Filters */}
      {isAdmin && (
        <div className="order-filters">
          <div className="order-filters-row">
            <label className="filter-item">
              <span>状态</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">全部状态</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                ))}
              </select>
            </label>
            <label className="filter-item">
              <span>客户</span>
              <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
                <option value="">全部客户</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="filter-item">
              <span>配送日期从</span>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </label>
            <label className="filter-item">
              <span>配送日期至</span>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </label>
            <label className="filter-item">
              <span>车次</span>
              <select value={filterTrip} onChange={(e) => setFilterTrip(e.target.value)}>
                <option value="">全部车次</option>
                {tripNumbers.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            {hasActiveFilters && (
              <button type="button" className="ghost filter-reset-btn" onClick={resetFilters}>
                重置筛选
              </button>
            )}
            {filterTrip && (
              <button type="button" onClick={() => generateDeliveryNote(filterTrip)}>
                打印配送单
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>确认状态变更</h3>
            <p>
              确定将订单 <strong>#{confirmDialog.orderId}</strong> 的状态从
              <span className={`badge badge-${confirmDialog.fromStatus}`} style={{ margin: '0 0.4rem' }}>
                {STATUS_LABELS[confirmDialog.fromStatus] || confirmDialog.fromStatus}
              </span>
              变更为
              <span className={`badge badge-${confirmDialog.toStatus}`} style={{ margin: '0 0.4rem' }}>
                {STATUS_LABELS[confirmDialog.toStatus] || confirmDialog.toStatus}
              </span>
              ？
            </p>
            {confirmDialog.toStatus === 'shipped' && (
              <p className="modal-warning">发货后将扣减库存，且订单将无法编辑。</p>
            )}
            {confirmDialog.toStatus === 'completed' && (
              <p className="modal-warning">完成后订单将关闭，且库存将被扣减（如未扣减）。</p>
            )}
            {confirmDialog.toStatus === 'cancelled' && (
              <p className="modal-warning">取消后订单将无法恢复。</p>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmDialog(null)}>取消</button>
              <button
                type="button"
                className={confirmDialog.toStatus === 'cancelled' ? 'danger' : ''}
                onClick={confirmStatusChange}
              >
                确认变更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk status confirmation dialog */}
      {bulkConfirmStatus && (
        <div className="modal-overlay" onClick={() => setBulkConfirmStatus(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>确认批量变更状态</h3>
            <p>
              确定将选中的 <strong>{selectedOrderIds.size}</strong> 个订单状态改为
              <span className={`badge badge-${bulkConfirmStatus}`} style={{ margin: '0 0.4rem' }}>
                {STATUS_LABELS[bulkConfirmStatus] || bulkConfirmStatus}
              </span>
              ？
            </p>
            {bulkConfirmStatus === 'shipped' && (
              <p className="modal-warning">发货后将扣减库存，且订单将无法编辑。</p>
            )}
            {bulkConfirmStatus === 'completed' && (
              <p className="modal-warning">完成后订单将关闭，且库存将被扣减（如未扣减）。</p>
            )}
            {bulkConfirmStatus === 'cancelled' && (
              <p className="modal-warning">取消后订单将无法恢复。</p>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setBulkConfirmStatus(null)}>取消</button>
              <button
                type="button"
                className={bulkConfirmStatus === 'cancelled' ? 'danger' : ''}
                disabled={bulkProcessing}
                onClick={() => handleBulkStatusChange(bulkConfirmStatus)}
              >
                {bulkProcessing ? '处理中…' : '确认变更'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete order confirmation dialog */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除订单</h3>
            <p>
              确定要删除订单 <strong>#{deleteConfirm.orderId}</strong>（{deleteConfirm.customerName}）吗？
            </p>
            <p className="modal-warning">删除后订单及其所有商品明细将被永久移除，无法恢复。</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button type="button" className="danger" onClick={handleDeleteOrder}>确认删除</button>
            </div>
          </div>
        </div>
      )}

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
                        订单 #{pending.id} · {pending.customerName || customerMap.get(pending.customerId) || `客户 #${pending.customerId}`} · 送达 {formatDeliveryDate(pending.deliveryDate)}
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

      {/* Bulk action bar */}
      {isAdmin && filteredOrders.length > 0 && (
        <div className="bulk-action-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', marginBottom: '0.75rem', background: selectedOrderIds.size > 0 ? '#eff6ff' : '#f9fafb', border: `1px solid ${selectedOrderIds.size > 0 ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} style={{ width: 15, height: 15 }} />
            {allFilteredSelected ? '取消全选' : `全选 ${filteredOrders.length} 单`}
          </label>
          {selectedOrderIds.size > 0 && (
            <>
              <span style={{ fontSize: '0.875rem', color: '#1d4ed8', fontWeight: 600 }}>已选 {selectedOrderIds.size} 单</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="text"
                  placeholder="车次号（留空清除）"
                  value={bulkTripInput}
                  onChange={(e) => setBulkTripInput(e.target.value)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', width: 140 }}
                />
                <button type="button" disabled={bulkProcessing} onClick={handleBulkTripSave} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
                  {bulkProcessing ? '处理中…' : '批量设置车次'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <select
                  value={bulkStatusInput}
                  onChange={(e) => setBulkStatusInput(e.target.value)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                >
                  <option value="">选择目标状态</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bulkStatusInput || bulkProcessing}
                  className={bulkStatusInput === 'cancelled' ? 'danger' : ''}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    if (!bulkStatusInput) return
                    if (RISKY_STATUSES.has(bulkStatusInput)) {
                      setBulkConfirmStatus(bulkStatusInput)
                    } else {
                      handleBulkStatusChange(bulkStatusInput)
                    }
                  }}
                >
                  批量改状态
                </button>
              </div>
              <button type="button" className="ghost" style={{ fontSize: '0.8rem', marginLeft: 'auto' }} onClick={() => setSelectedOrderIds(new Set())}>
                取消选择
              </button>
            </>
          )}
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <p>{hasActiveFilters ? '没有符合筛选条件的订单。' : '暂无订单。'}</p>
      ) : (
        <div className="orders">
          {filteredOrders.map((order) => (
            <div key={order.id}>
              <div className="order-card">
                <div className="order-head">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={() => toggleSelectOrder(order.id)}
                      style={{ width: 16, height: 16, marginRight: '0.5rem', marginTop: '0.2rem', flexShrink: 0, cursor: 'pointer' }}
                    />
                  )}
                  <div>
                    <strong>订单 #{order.id}</strong>
                    {order.pendingReview ? <span className="badge warning">待确认变更</span> : null}
                    <p>客户: {getCustomerDisplay(order)}</p>
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
                          {!['shipped', 'completed', 'cancelled'].includes(order.status) && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setDeleteConfirm({ orderId: order.id, customerName: getCustomerDisplay(order) })}
                            >
                              删除订单
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>单位</th>
                    <th>数量</th>
                    <th className="hide-mobile">仓储</th>
                    <th>单价</th>
                    <th>小计</th>
                    <th className="hide-mobile">拣货状态</th>
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
                              min={item.productUnit === 'kg' || item.productUnit === 'lb' ? 0.001 : 1}
                              step={item.productUnit === 'kg' || item.productUnit === 'lb' ? 0.001 : 1}
                            />
                          ) : (
                            item.qtyOrdered
                          )}
                        </td>
                        <td className="hide-mobile"><WarehouseTypeBadge type={item.productWarehouseType} /></td>
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
                        <td className="hide-mobile">
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
              </div>
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
