import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createInboundRecord, getInventorySummary } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'

const createDefaultForm = () => ({
  productId: '',
  quantity: '',
  logDate: '',
  remark: '',
})

export default function InventoryPage() {
  const { token } = useAuth()
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState(createDefaultForm)
  const [submitting, setSubmitting] = useState(false)

  const fetchInventory = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const data = await getInventorySummary(token)
      setItems(data.items ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  useEffect(() => {
    const handler = () => {
      fetchInventory()
    }
    window.addEventListener(INVENTORY_REFRESH_EVENT, handler)
    return () => window.removeEventListener(INVENTORY_REFRESH_EVENT, handler)
  }, [fetchInventory])

  const selectableProducts = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name)), [items])

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return

    const productId = Number(form.productId)
    const quantity = Number(form.quantity)
    if (!Number.isInteger(productId) || productId <= 0) {
      setMessage('请选择有效品名')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage('数量必须为正整数')
      return
    }

    try {
      setSubmitting(true)
      setMessage(null)
      await createInboundRecord(
        {
          productId,
          quantity,
          logDate: form.logDate ? new Date(form.logDate).toISOString() : undefined,
          remark: form.remark?.trim() || undefined,
        },
        token
      )
      setForm(createDefaultForm())
      await fetchInventory()
      setMessage('入库成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>仓库存储统计</h1>
      <div className="inventory-grid">
        <section className="inventory-card">
          <h2>手动入库</h2>
          <form className="inventory-form" onSubmit={handleSubmit}>
            <label>
              品名
              <select name="productId" value={form.productId} onChange={handleChange}>
                <option value="">请选择商品</option>
                {selectableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              数量（件）
              <input name="quantity" type="number" min={1} step={1} value={form.quantity} onChange={handleChange} />
            </label>
            <label>
              入库日期
              <input name="logDate" type="date" value={form.logDate} onChange={handleChange} />
            </label>
            <label>
              备注
              <textarea name="remark" rows={3} value={form.remark} onChange={handleChange} />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? '提交中…' : '确认入库'}
            </button>
            {message && <p className="hint">{message}</p>}
          </form>
        </section>
        <section className="inventory-card">
          <div className="inventory-header">
            <h2>库存列表</h2>
            <button type="button" className="ghost" onClick={fetchInventory} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          {items.length === 0 && !loading ? (
            <p>暂无库存数据。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>品名</th>
                    <th>单位</th>
                    <th>仓储</th>
                    <th>单价</th>
                    <th>库存</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td>{item.warehouseType}</td>
                      <td>{formatMoney(item.price ?? 0)}</td>
                      <td>{item.stock ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
