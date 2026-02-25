import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react'
import {
  createDamageRecord,
  createInboundRecord,
  createReturnRecord,
  getInventoryLogs,
  getInventorySummary,
  getProductNames,
  updateInventoryStock,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Product } from '../types'
import { INVENTORY_REFRESH_EVENT } from '../constants/events'
import { formatMoney } from '../utils/money'
import SearchableSelect from '../components/SearchableSelect'
import type { SelectOption } from '../components/SearchableSelect'
import Pagination from '../components/Pagination'
import SearchableFilter from '../components/SearchableFilter'
import { WarehouseTypeBadge } from '../components/Badge'

const PAGE_SIZE = 50

type TabKey = 'summary' | 'inbound' | 'return' | 'damage'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: '库存统计' },
  { key: 'inbound', label: '货品入库' },
  { key: 'return', label: '退货入库' },
  { key: 'damage', label: '货损' },
]

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
  remark?: string
}

export default function InventoryPage() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
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
  const [logsType, setLogsType] = useState<'return' | 'damage' | 'in'>('return')
  const [logsLoading, setLogsLoading] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [productNames, setProductNames] = useState<string[]>([])

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editStock, setEditStock] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Summary filters & pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('全部')
  const [summaryPage, setSummaryPage] = useState(0)
  const [summaryTotal, setSummaryTotal] = useState(0)

  const summaryTotalPages = Math.ceil(summaryTotal / PAGE_SIZE)

  const searchQueryRef = useRef(searchQuery)
  searchQueryRef.current = searchQuery

  const warehouseFilterRef = useRef(warehouseFilter)
  warehouseFilterRef.current = warehouseFilter

  const summaryPageRef = useRef(summaryPage)
  summaryPageRef.current = summaryPage

  const fetchInventory = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const params: { limit: number; offset: number; q?: string; warehouseType?: string } = {
        limit: PAGE_SIZE,
        offset: summaryPageRef.current * PAGE_SIZE,
      }
      if (searchQueryRef.current.trim()) params.q = searchQueryRef.current.trim()
      if (warehouseFilterRef.current !== '全部') params.warehouseType = warehouseFilterRef.current
      const data = await getInventorySummary(params, token)
      setItems(data.items ?? [])
      setSummaryTotal(data.total)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, summaryPage, warehouseFilter])

  const fetchLogs = useCallback(async () => {
    if (!token) return
    try {
      setLogsLoading(true)
      const data = await getInventoryLogs({ type: logsType, limit: 50 }, token)
      setLogs((data.items as unknown as InventoryLogEntry[]) ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLogsLoading(false)
    }
  }, [logsType, token])

  const fetchAllProducts = useCallback(async () => {
    if (!token) return
    try {
      const data = await getInventorySummary({ limit: 500, offset: 0 }, token)
      setAllProducts(data.items ?? [])
      // fetch remaining if any
      if (data.total > 500) {
        const rest = await getInventorySummary({ limit: data.total, offset: 0 }, token)
        setAllProducts(rest.items ?? [])
      }
    } catch {
      // dropdown data is best-effort
    }
  }, [token])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  useEffect(() => {
    fetchAllProducts()
    if (token) getProductNames(token).then((d) => setProductNames(d.names)).catch(() => {})
  }, [fetchAllProducts, token])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const handler = () => {
      fetchInventory()
      fetchAllProducts()
      fetchLogs()
    }
    window.addEventListener(INVENTORY_REFRESH_EVENT, handler)
    return () => window.removeEventListener(INVENTORY_REFRESH_EVENT, handler)
  }, [fetchInventory, fetchAllProducts, fetchLogs])

  const selectableProducts = useMemo(() => allProducts.slice().sort((a, b) => a.name.localeCompare(b.name)), [allProducts])

  const productOptions: SelectOption[] = useMemo(
    () =>
      selectableProducts.map((p) => ({
        value: String(p.id),
        label: `${p.name} (${formatMoney(p.price)}/${p.unit})`,
        searchText: `${p.name} ${p.price} ${p.unit} ${p.warehouseType}`.toLowerCase(),
      })),
    [selectableProducts]
  )

  const warehouseTypes = ['全部', '干', '鲜', '冻']

  const createChangeHandler =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setter: Dispatch<SetStateAction<any>>) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target
      setter((prev: Record<string, string>) => ({ ...prev, [name]: value }))
    }

  const handleChange = createChangeHandler(setForm)
  const handleReturnChange = createChangeHandler(setReturnForm)
  const handleDamageChange = createChangeHandler(setDamageForm)

  // Inline edit handlers
  const startEditing = (product: Product) => {
    setEditingId(product.id)
    setEditStock(String(product.stock ?? 0))
    setEditNotes(product.notes ?? '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditStock('')
    setEditNotes('')
  }

  const saveEditing = async () => {
    if (!token || editingId == null) return
    const stockVal = Number(editStock)
    if (!Number.isFinite(stockVal) || stockVal < 0) {
      setMessage('库存必须为非负数')
      return
    }
    try {
      setEditSaving(true)
      setMessage(null)
      await updateInventoryStock(editingId, { stock: stockVal, notes: editNotes.trim() || null }, token)
      setEditingId(null)
      await fetchInventory()
      setMessage('库存更新成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setEditSaving(false)
    }
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
      setForm(createInboundForm())
      await Promise.all([fetchInventory(), fetchAllProducts(), fetchLogs()])
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
      await Promise.all([fetchInventory(), fetchAllProducts(), fetchLogs()])
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
      await Promise.all([fetchInventory(), fetchAllProducts(), fetchLogs()])
      setMessage('货损记录成功')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDamageSubmitting(false)
    }
  }

  const handleSummarySearch = () => {
    if (summaryPage === 0) {
      // page is already 0, effect won't trigger, so fetch manually
      fetchInventory()
    } else {
      setSummaryPage(0)
      // effect will auto-fetch when page changes
    }
  }

  const handleSummaryPageChange = (p: number) => {
    setSummaryPage(p)
  }

  const renderSummaryTab = () => (
    <>
      <div className="filters">
        <SearchableFilter names={productNames} value={searchQuery} onChange={setSearchQuery} placeholder="搜索商品名..." />
        <select value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setSummaryPage(0) }}>
          {warehouseTypes.map((t) => (
            <option key={t} value={t}>
              {t === '全部' ? '全部仓储' : t}
            </option>
          ))}
        </select>
        <button type="button" className="ghost" onClick={handleSummarySearch} disabled={loading}>
          {loading ? '刷新中…' : '搜索'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {items.length === 0 && !loading ? (
        <p className="muted">暂无匹配的库存数据。</p>
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
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td><WarehouseTypeBadge type={item.warehouseType} /></td>
                  <td>{formatMoney(item.price ?? 0)}</td>
                  {editingId === item.id ? (
                    <>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editStock}
                          onChange={(e) => setEditStock(e.target.value)}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="备注"
                          style={{ width: 120 }}
                        />
                      </td>
                      <td>
                        <div className="admin-actions">
                          <button type="button" onClick={saveEditing} disabled={editSaving}>
                            {editSaving ? '保存中…' : '保存'}
                          </button>
                          <button type="button" className="ghost" onClick={cancelEditing}>
                            取消
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.stock ?? 0}</td>
                      <td className="muted">{item.notes || '-'}</td>
                      <td>
                        <button type="button" className="ghost" onClick={() => startEditing(item)}>
                          编辑
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={summaryPage} totalPages={summaryTotalPages} onPageChange={handleSummaryPageChange} />
    </>
  )

  const renderInboundTab = () => (
    <div className="inventory-grid">
      <section className="inventory-card">
        <h2>货品入库</h2>
        <form className="inventory-form" onSubmit={handleSubmit}>
          <label>
            品名
            <SearchableSelect
              options={productOptions}
              value={form.productId}
              onChange={(val) => setForm((prev) => ({ ...prev, productId: val }))}
              placeholder="搜索商品名/价格..."
            />
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
        </form>
      </section>
      <section className="inventory-card">
        <div className="inventory-log-header">
          <h3>入库记录</h3>
          <button type="button" className="ghost" onClick={() => { setLogsType('in'); fetchLogs() }} disabled={logsLoading}>
            {logsLoading ? '刷新中…' : '刷新'}
          </button>
        </div>
        <div className="table-wrapper">
          {logs.length === 0 ? (
            <p className="muted">暂无入库记录。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>商品</th>
                  <th>数量</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.logDate).toLocaleString()}</td>
                      <td>{log.productName ?? '-'}</td>
                      <td>{log.quantity}</td>
                      <td>{log.remark ?? '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )

  const renderReturnTab = () => (
    <div className="inventory-grid">
      <section className="inventory-card">
        <h2>退货入库</h2>
        <form className="inventory-form" onSubmit={handleReturnSubmit}>
          <label>
            品名
            <SearchableSelect
              options={productOptions}
              value={returnForm.productId}
              onChange={(val) => setReturnForm((prev) => ({ ...prev, productId: val }))}
              placeholder="搜索商品名/价格..."
            />
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
        <div className="inventory-log-header">
          <h3>退货记录</h3>
          <button type="button" className="ghost" onClick={() => { setLogsType('return'); fetchLogs() }} disabled={logsLoading}>
            {logsLoading ? '刷新中…' : '刷新'}
          </button>
        </div>
        <div className="table-wrapper">
          {logs.length === 0 ? (
            <p className="muted">暂无退货记录。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>商品</th>
                  <th>数量</th>
                  <th>商家</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.logDate).toLocaleString()}</td>
                      <td>{log.productName ?? '-'}</td>
                      <td>{log.quantity}</td>
                      <td>{log.partnerName ?? '-'}</td>
                      <td>{log.reason ?? '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )

  const renderDamageTab = () => (
    <div className="inventory-grid">
      <section className="inventory-card">
        <h2>货损记录</h2>
        <form className="inventory-form" onSubmit={handleDamageSubmit}>
          <label>
            品名
            <SearchableSelect
              options={productOptions}
              value={damageForm.productId}
              onChange={(val) => setDamageForm((prev) => ({ ...prev, productId: val }))}
              placeholder="搜索商品名/价格..."
            />
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
      </section>
      <section className="inventory-card">
        <div className="inventory-log-header">
          <h3>货损记录</h3>
          <button type="button" className="ghost" onClick={() => { setLogsType('damage'); fetchLogs() }} disabled={logsLoading}>
            {logsLoading ? '刷新中…' : '刷新'}
          </button>
        </div>
        <div className="table-wrapper">
          {logs.length === 0 ? (
            <p className="muted">暂无货损记录。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>商品</th>
                  <th>数量</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.logDate).toLocaleString()}</td>
                      <td>{log.productName ?? '-'}</td>
                      <td>{log.quantity}</td>
                      <td>{log.reason ?? '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>库存管理</h1>
        <p>管理库存、入库、退货和货损</p>
      </div>
      {message && <p className="hint">{message}</p>}

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => {
              setActiveTab(tab.key)
              setMessage(null)
              const typeMap: Record<TabKey, 'in' | 'return' | 'damage' | null> = {
                summary: null,
                inbound: 'in',
                return: 'return',
                damage: 'damage',
              }
              const mapped = typeMap[tab.key]
              if (mapped) setLogsType(mapped)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && renderSummaryTab()}
      {activeTab === 'inbound' && renderInboundTab()}
      {activeTab === 'return' && renderReturnTab()}
      {activeTab === 'damage' && renderDamageTab()}
    </div>
  )
}
