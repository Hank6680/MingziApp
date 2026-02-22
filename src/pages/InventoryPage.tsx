import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  createDamageRecord,
  createInboundRecord,
  createReturnRecord,
  getInventoryLogs,
  getInventorySummary,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'

const createInboundForm = () => ({
  productId: '',
  quantity: '',
  logDate: '',
  remark: '',
})

const createReturnForm = () => ({
  productId: '',
  quantity: '',
  partnerName: '',
  reason: '',
  logDate: '',
})

const createDamageForm = () => ({
  productId: '',
  quantity: '',
  reason: '',
  logDate: '',
})

interface InventoryLogEntry {
  id: number
  productName?: string
  quantity: number
  type: string
  logDate: string
  partnerName?: string
  reason?: string
}

export default function InventoryPage() {
  const { token } = useAuth()
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState(createInboundForm)
  const [returnForm, setReturnForm] = useState(createReturnForm)
  const [damageForm, setDamageForm] = useState(createDamageForm)
  const [submitting, setSubmitting] = useState(false)
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [damageSubmitting, setDamageSubmitting] = useState(false)
  const [logs, setLogs] = useState<InventoryLogEntry[]>([])
  const [logsType, setLogsType] = useState<'return' | 'damage'>('return')
  const [logsLoading, setLogsLoading] = useState(false)

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

  const fetchLogs = useCallback(async () => {
    if (!token) return
    try {
      setLogsLoading(true)
      const data = await getInventoryLogs({ type: logsType, limit: 20 }, token)
      setLogs((data.items as InventoryLogEntry[]) ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLogsLoading(false)
    }
  }, [logsType, token])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const handler = () => {
      fetchInventory()
      fetchLogs()
    }
    window.addEventListener(INVENTORY_REFRESH_EVENT, handler)
    return () => window.removeEventListener(INVENTORY_REFRESH_EVENT, handler)
  }, [fetchInventory, fetchLogs])

  const selectableProducts = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name)), [items])

  const createChangeHandler = (
    setter: Dispatch<SetStateAction<Record<string, string>>>
  ) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setter((prev) => ({ ...prev, [name]: value }))
  }

  const handleChange = createChangeHandler(setForm)
  const handleReturnChange = createChangeHandler(setReturnForm)
  const handleDamageChange = createChangeHandler(setDamageForm)

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
      setForm(createInboundForm())
      await Promise.all([fetchInventory(), fetchLogs()])
      setMessage('入库成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReturnSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return

    const productId = Number(returnForm.productId)
    const quantity = Number(returnForm.quantity)
    if (!Number.isInteger(productId) || productId <= 0) {
      setMessage('请选择有效品名')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage('数量必须为正整数')
      return
    }
    if (!returnForm.partnerName.trim()) {
      setMessage('请输入商家信息')
      return
    }

    try {
      setReturnSubmitting(true)
      setMessage(null)
      await createReturnRecord(
        {
          productId,
          quantity,
          partnerName: returnForm.partnerName.trim(),
          reason: returnForm.reason.trim() || undefined,
          logDate: returnForm.logDate ? new Date(returnForm.logDate).toISOString() : undefined,
        },
        token
      )
      setReturnForm(createReturnForm())
      await Promise.all([fetchInventory(), fetchLogs()])
      setMessage('退货入库成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setReturnSubmitting(false)
    }
  }

  const handleDamageSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return

    const productId = Number(damageForm.productId)
    const quantity = Number(damageForm.quantity)
    if (!Number.isInteger(productId) || productId <= 0) {
      setMessage('请选择有效品名')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage('数量必须为正整数')
      return
    }

    try {
      setDamageSubmitting(true)
      setMessage(null)
      await createDamageRecord(
        {
          productId,
          quantity,
          reason: damageForm.reason.trim() || undefined,
          logDate: damageForm.logDate ? new Date(damageForm.logDate).toISOString() : undefined,
        },
        token
      )
      setDamageForm(createDamageForm())
      await Promise.all([fetchInventory(), fetchLogs()])
      setMessage('货损记录成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDamageSubmitting(false)
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

      <div className="inventory-grid">
        <section className="inventory-card">
          <h2>退货入库</h2>
          <form className="inventory-form" onSubmit={handleReturnSubmit}>
            <label>
              品名
              <select name="productId" value={returnForm.productId} onChange={handleReturnChange}>
                <option value="">请选择商品</option>
                {selectableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              数量
              <input name="quantity" type="number" min={1} step={1} value={returnForm.quantity} onChange={handleReturnChange} />
            </label>
            <label>
              商家信息
              <input name="partnerName" value={returnForm.partnerName} onChange={handleReturnChange} placeholder="门店/客户" />
            </label>
            <label>
              退货原因
              <textarea name="reason" rows={3} value={returnForm.reason} onChange={handleReturnChange} />
            </label>
            <label>
              退货日期
              <input name="logDate" type="date" value={returnForm.logDate} onChange={handleReturnChange} />
            </label>
            <button type="submit" disabled={returnSubmitting}>
              {returnSubmitting ? '提交中…' : '确认退货入库'}
            </button>
          </form>
        </section>
        <section className="inventory-card">
          <h2>货损统计</h2>
          <form className="inventory-form" onSubmit={handleDamageSubmit}>
            <label>
              品名
              <select name="productId" value={damageForm.productId} onChange={handleDamageChange}>
                <option value="">请选择商品</option>
                {selectableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              数量
              <input name="quantity" type="number" min={1} step={1} value={damageForm.quantity} onChange={handleDamageChange} />
            </label>
            <label>
              货损原因
              <textarea name="reason" rows={3} value={damageForm.reason} onChange={handleDamageChange} />
            </label>
            <label>
              记录日期
              <input name="logDate" type="date" value={damageForm.logDate} onChange={handleDamageChange} />
            </label>
            <button type="submit" disabled={damageSubmitting}>
              {damageSubmitting ? '提交中…' : '记录货损'}
            </button>
          </form>
          <div className="inventory-log-header">
            <div className="log-tabs">
              <button
                type="button"
                className={logsType === 'return' ? 'active' : ''}
                onClick={() => setLogsType('return')}
              >
                退货记录
              </button>
              <button
                type="button"
                className={logsType === 'damage' ? 'active' : ''}
                onClick={() => setLogsType('damage')}
              >
                货损记录
              </button>
            </div>
            <button type="button" className="ghost" onClick={fetchLogs} disabled={logsLoading}>
              {logsLoading ? '刷新中…' : '刷新记录'}
            </button>
          </div>
          <div className="table-wrapper">
            {logs.length === 0 ? (
              <p>暂无记录。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>商品</th>
                    <th>数量</th>
                    {logsType === 'return' && <th>商家</th>}
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.logDate).toLocaleString()}</td>
                      <td>{log.productName ?? '-'}</td>
                      <td>{log.quantity}</td>
                      {logsType === 'return' && <td>{log.partnerName ?? '-'}</td>}
                      <td>{log.reason ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
