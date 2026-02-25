import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { acknowledgeOrderChange, getPendingOrderChanges, getPickingItems, updateOrderItemStatus } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { PendingOrderSummary, PickingItem } from '../types'
import { describeOrderChange } from '../utils/orderChanges'

const warehouseOptions = ['全部', '干', '鲜', '冻']


export default function PickingPage() {
  const { token } = useAuth()
  const [trip, setTrip] = useState('')
  const [warehouse, setWarehouse] = useState('全部')
  const [items, setItems] = useState<PickingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingOrders, setPendingOrders] = useState<PendingOrderSummary[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const lastLoadedAt = useRef<Date | null>(null)
  const printAreaRef = useRef<HTMLDivElement | null>(null)

  const fetchItems = async () => {
    if (!trip.trim()) {
      setMessage('请输入车次编号')
      return
    }
    if (!token) return
    try {
      setLoading(true)
      setMessage(null)
      const data = await getPickingItems({ trip: trip.trim(), warehouseType: warehouse }, token)
      setItems(data)
      if (data.length === 0) {
        setMessage('该车次暂无匹配的拣货项')
      }
      lastLoadedAt.current = new Date()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleMark = async (item: PickingItem, type: 'picked' | 'outOfStock') => {
    if (!token) return
    try {
      setMessage(null)
      const payload =
        type === 'picked'
          ? { picked: item.picked ? false : true, outOfStock: false }
          : { outOfStock: item.outOfStock ? false : true, picked: false }
      const updated = await updateOrderItemStatus(item.itemId, payload, token)
      setItems((prev) => prev.map((it) => (it.itemId === item.itemId ? { ...it, ...updated } : it)))
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleExportPdf = async () => {
    if (items.length === 0) {
      setMessage('没有可导出的拣货项')
      return
    }
    if (!printAreaRef.current) {
      setMessage('无法获取拣货内容')
      return
    }

    try {
      const canvas = await html2canvas(printAreaRef.current, { scale: 2 })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgProps = pdf.getImageProperties(imgData)
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width

      const title = `拣货任务 - ${trip || '未分配'}${warehouse !== '全部' ? ` - ${warehouse}` : ''}`
      pdf.setFontSize(16)
      pdf.text(title, 14, 16)
      if (lastLoadedAt.current) {
        pdf.setFontSize(10)
        pdf.text(`导出时间：${lastLoadedAt.current.toLocaleString()}`, 14, 24)
      }

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      const fileName = `picking_${trip || 'unassigned'}_${warehouse}_${Date.now()}.pdf`
      pdf.save(fileName)
    } catch (err) {
      setMessage(`导出失败：${(err as Error).message}`)
    }
  }

  const fetchPendingOrders = async () => {
    if (!token) return
    try {
      setPendingLoading(true)
      const data = await getPendingOrderChanges(token)
      setPendingOrders(data.items || [])
    } catch (err) {
      console.error(err)
    } finally {
      setPendingLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingOrders()
  }, [token])

  const handleAcknowledge = async (orderId: number) => {
    if (!token) return
    try {
      await acknowledgeOrderChange(orderId, token)
      setPendingOrders((prev) => prev.filter((order) => order.id !== orderId))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <h1>拣货任务</h1>
      {pendingOrders.length > 0 && (
        <div className="pending-changes">
          <div className="pending-header">
            <strong>有 {pendingOrders.length} 张订单新增/调整待确认</strong>
            <button type="button" className="ghost" onClick={fetchPendingOrders} disabled={pendingLoading}>
              {pendingLoading ? '刷新中…' : '刷新'}
            </button>
          </div>
          <ul>
            {pendingOrders.map((order) => (
              <li key={order.id}>
                <div>
                  <span>
                    订单 #{order.id} · 客户 {order.customerId ?? '-'} · 送达 {order.deliveryDate}
                  </span>
                  <small>最近变更：{order.lastModifiedAt ? new Date(order.lastModifiedAt).toLocaleString() : '-'}</small>
                </div>
                {order.changes && order.changes.length > 0 && (
                  <ul className="pending-change-details">
                    {order.changes.map((change) => (
                      <li key={change.id}>
                        <div>
                          <span>{new Date(change.createdAt).toLocaleString()}</span>
                          <p>{describeOrderChange(change)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => handleAcknowledge(order.id)}>
                  确认处理
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="filters">
        <input placeholder="车次（如 第1车）" value={trip} onChange={(e) => setTrip(e.target.value)} />
        <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          {warehouseOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button type="button" onClick={fetchItems}>
          加载拣货单
        </button>
        <button type="button" className="ghost" onClick={handleExportPdf} disabled={items.length === 0}>
          导出 PDF
        </button>
      </div>
      {loading && <p>加载中…</p>}
      {message && <p className="hint">{message}</p>}

      {items.length > 0 && (
        <div ref={printAreaRef} className="picking-print-area">
          <div className="print-header">
            <h2>{`拣货任务 - ${trip || '未分配'}`}{warehouse !== '全部' ? `（${warehouse}）` : ''}</h2>
            {lastLoadedAt.current && <p>导出时间：{lastLoadedAt.current.toLocaleString()}</p>}
          </div>
          <div className="picking-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>订单</th>
                  <th>客户ID</th>
                  <th>商品</th>
                  <th>仓储</th>
                  <th>数量</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.itemId} className={item.outOfStock ? 'muted' : ''}>
                    <td>#{item.orderId}</td>
                    <td>{item.customerId ?? '-'}</td>
                    <td>{item.productName}</td>
                    <td>{item.warehouseType}</td>
                    <td>
                      {item.qtyOrdered} {item.productUnit}
                    </td>
                    <td>
                      {item.outOfStock
                        ? '缺货'
                        : item.picked
                          ? '已拣'
                          : item.status === 'created'
                            ? '待拣'
                            : item.status}
                    </td>
                    <td className="admin-actions">
                      <button type="button" onClick={() => handleMark(item, 'picked')}>
                        {item.picked ? '取消拣货' : '标记已拣'}
                      </button>
                      <button type="button" className="danger" onClick={() => handleMark(item, 'outOfStock')}>
                        {item.outOfStock ? '恢复库存' : '标记缺货'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
