import { useEffect, useState } from 'react'
import { getOrders, updateOrderStatus, updateOrderTrip } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Order } from '../types'

const STATUSES = ['created', 'confirmed', 'shipped', 'completed', 'cancelled']

export default function OrdersPage() {
  const { token, user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tripInputs, setTripInputs] = useState<Record<number, string>>({})

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

  const handleStatusChange = async (orderId: number, status: string) => {
    if (!token) return
    try {
      await updateOrderStatus(orderId, status, token)
      setMessage('状态已更新')
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
            <div key={order.id} className="order-card">
              <div className="order-head">
                <div>
                  <strong>订单 #{order.id}</strong>
                  <p>客户 ID: {order.customerId ?? '未知'}</p>
                  <p>送达日期: {new Date(order.deliveryDate).toLocaleDateString()}</p>
                </div>
                <div className="order-controls">
                  <div>
                    <p>状态：{order.status}</p>
                    {user?.role === 'admin' && (
                      <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)}>
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {user?.role === 'admin' && (
                    <div className="trip-input">
                      <label>
                        车次
                        <input value={tripInputs[order.id] ?? ''} onChange={(e) => handleTripChange(order.id, e.target.value)} />
                      </label>
                      <button type="button" onClick={() => handleTripSave(order.id)}>
                        保存
                      </button>
                    </div>
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
                    <th>拣货状态</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item) => (
                    <tr key={`${order.id}-${item.productId}`}>
                      <td>{item.productName ?? item.productId}</td>
                      <td>{item.productUnit}</td>
                      <td>{item.qtyOrdered}</td>
                      <td>{item.productWarehouseType}</td>
                      <td>
                        {item.outOfStock
                          ? '缺货'
                          : item.picked
                            ? '已拣'
                            : item.status === 'picked'
                              ? '已拣'
                              : '待拣'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
