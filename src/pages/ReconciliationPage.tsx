import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import * as XLSX from 'xlsx'
import {
  confirmInvoice,
  getSupplierInvoice,
  getSupplierInvoices,
  getSuppliers,
  importSupplierInvoice,
  updateInvoiceItem,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Supplier, SupplierInvoice, SupplierInvoiceItem } from '../types'
import { MatchStatusBadge } from '../components/Badge'
import SuppliersModal from '../components/SuppliersModal'

type TabKey = 'upload' | 'list' | 'detail'

export default function ReconciliationPage() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('upload')
  const [message, setMessage] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false)

  // Upload tab
  const [uploadSupplierId, setUploadSupplierId] = useState('')
  const [uploadInvoiceNo, setUploadInvoiceNo] = useState('')
  const [uploadPeriodStart, setUploadPeriodStart] = useState('')
  const [uploadPeriodEnd, setUploadPeriodEnd] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({ productName: '', quantity: '', unitPrice: '', amount: '' })
  const [uploading, setUploading] = useState(false)

  // List tab
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  // Detail tab
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null)
  const [detailItems, setDetailItems] = useState<SupplierInvoiceItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    if (!token) return
    try {
      const data = await getSuppliers(token)
      setSuppliers(data.items)
    } catch { /* */ }
  }, [token])

  const fetchInvoices = useCallback(async () => {
    if (!token) return
    try {
      setInvoicesLoading(true)
      const data = await getSupplierInvoices({}, token)
      setInvoices(data.items)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setInvoicesLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  useEffect(() => {
    if (activeTab === 'list') fetchInvoices()
  }, [activeTab, fetchInvoices])

  // Handle Excel file selection — parse headers for column mapping
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setExcelHeaders([])
    setColumnMap({ productName: '', quantity: '', unitPrice: '', amount: '' })

    if (selectedFile) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          if (ws) {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1 })
            if (rows.length > 0) {
              const headers = (rows[0] as unknown as unknown[]).map(String).filter(Boolean)
              setExcelHeaders(headers)
              // Auto-guess column mapping
              const guessed: Record<string, string> = { productName: '', quantity: '', unitPrice: '', amount: '' }
              for (const h of headers) {
                const lower = h.toLowerCase()
                if (!guessed.productName && (lower.includes('品名') || lower.includes('商品') || lower.includes('product') || lower.includes('item') || lower.includes('名称'))) {
                  guessed.productName = h
                }
                if (!guessed.quantity && (lower.includes('数量') || lower.includes('qty') || lower.includes('quantity'))) {
                  guessed.quantity = h
                }
                if (!guessed.unitPrice && (lower.includes('单价') || lower.includes('price') || lower.includes('unit'))) {
                  guessed.unitPrice = h
                }
                if (!guessed.amount && (lower.includes('金额') || lower.includes('amount') || lower.includes('total') || lower.includes('小计'))) {
                  guessed.amount = h
                }
              }
              setColumnMap(guessed)
            }
          }
        } catch {
          setMessage('无法解析 Excel 文件')
        }
      }
      reader.readAsArrayBuffer(selectedFile)
    }
  }

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !file) return
    if (!uploadSupplierId) { setMessage('请选择供应商'); return }
    if (!columnMap.productName) { setMessage('请映射品名列'); return }

    try {
      setUploading(true)
      setMessage(null)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('supplierId', uploadSupplierId)
      if (uploadInvoiceNo) formData.append('invoiceNo', uploadInvoiceNo)
      if (uploadPeriodStart) formData.append('periodStart', uploadPeriodStart)
      if (uploadPeriodEnd) formData.append('periodEnd', uploadPeriodEnd)
      formData.append('columnMap', JSON.stringify(columnMap))

      const result = await importSupplierInvoice(formData, token)

      setMessage(
        `上传成功！共 ${result.summary.total} 项：` +
        `自动匹配 ${result.summary.autoConfirmed}，` +
        `待复核 ${result.summary.needReview}，` +
        `未匹配 ${result.summary.unmatched}`
      )

      // Navigate to detail view
      setSelectedInvoice(result.invoice)
      setDetailItems(result.items)
      setActiveTab('detail')

      // Reset form
      setFile(null)
      setExcelHeaders([])
      setUploadInvoiceNo('')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const viewInvoiceDetail = async (invoice: SupplierInvoice) => {
    if (!token) return
    try {
      setDetailLoading(true)
      setMessage(null)
      const data = await getSupplierInvoice(invoice.id, token)
      setSelectedInvoice(data.invoice)
      setDetailItems(data.invoice.items ?? [])
      setActiveTab('detail')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleUpdateItem = async (itemId: number, payload: { matchStatus?: string; discrepancyNotes?: string }) => {
    if (!token || !selectedInvoice) return
    try {
      const result = await updateInvoiceItem(selectedInvoice.id, itemId, payload, token)
      setDetailItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...result.item } : i)))
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleConfirmAll = async () => {
    if (!token || !selectedInvoice) return
    try {
      setConfirming(true)
      setMessage(null)
      await confirmInvoice(selectedInvoice.id, token)
      // Refresh detail
      const data = await getSupplierInvoice(selectedInvoice.id, token)
      setSelectedInvoice(data.invoice)
      setDetailItems(data.invoice.items ?? [])
      setMessage('批量确认完成')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  const renderUploadTab = () => (
    <div className="inventory-grid">
      <section className="inventory-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>上传供应商账单</h2>
          <button type="button" className="ghost" onClick={() => setSuppliersModalOpen(true)}>管理供应商</button>
        </div>
        <form className="inventory-form" onSubmit={handleUpload}>
          <label>
            供应商
            <select value={uploadSupplierId} onChange={(e) => setUploadSupplierId(e.target.value)} required>
              <option value="">请选择供应商</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            账单编号（选填）
            <input value={uploadInvoiceNo} onChange={(e) => setUploadInvoiceNo(e.target.value)} placeholder="INV-001" />
          </label>
          <div className="column-map-grid">
            <label>
              对账开始日期
              <input type="date" value={uploadPeriodStart} onChange={(e) => setUploadPeriodStart(e.target.value)} />
            </label>
            <label>
              对账结束日期
              <input type="date" value={uploadPeriodEnd} onChange={(e) => setUploadPeriodEnd(e.target.value)} />
            </label>
          </div>
          <label>
            Excel 文件
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
          </label>

          {excelHeaders.length > 0 && (
            <>
              <p className="muted">请映射 Excel 列到系统字段：</p>
              <div className="column-map-grid">
                <label>
                  品名列 *
                  <select value={columnMap.productName} onChange={(e) => setColumnMap((m) => ({ ...m, productName: e.target.value }))}>
                    <option value="">请选择</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label>
                  数量列
                  <select value={columnMap.quantity} onChange={(e) => setColumnMap((m) => ({ ...m, quantity: e.target.value }))}>
                    <option value="">请选择</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label>
                  单价列
                  <select value={columnMap.unitPrice} onChange={(e) => setColumnMap((m) => ({ ...m, unitPrice: e.target.value }))}>
                    <option value="">请选择</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label>
                  金额列
                  <select value={columnMap.amount} onChange={(e) => setColumnMap((m) => ({ ...m, amount: e.target.value }))}>
                    <option value="">请选择</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          <button type="submit" disabled={uploading || !file}>
            {uploading ? '上传对账中…' : '上传并对账'}
          </button>
        </form>
      </section>
    </div>
  )

  const renderListTab = () => (
    <div>
      {invoicesLoading ? (
        <p className="muted">加载中...</p>
      ) : invoices.length === 0 ? (
        <p className="muted">暂无账单记录。</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>账单编号</th>
                <th>供应商</th>
                <th>对账周期</th>
                <th>总金额</th>
                <th>明细数</th>
                <th>自动匹配</th>
                <th>待复核</th>
                <th>未匹配</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNo || '-'}</td>
                  <td>{inv.supplierName ?? '-'}</td>
                  <td>
                    {inv.periodStart?.slice(0, 10) || '?'} ~ {inv.periodEnd?.slice(0, 10) || '?'}
                  </td>
                  <td>{inv.totalAmount != null ? `¥${inv.totalAmount.toFixed(2)}` : '-'}</td>
                  <td>{inv.itemCount ?? 0}</td>
                  <td style={{ color: '#166534' }}>{inv.autoConfirmedCount ?? 0}</td>
                  <td style={{ color: '#9a3412' }}>{inv.needReviewCount ?? 0}</td>
                  <td style={{ color: '#991b1b' }}>{inv.unmatchedCount ?? 0}</td>
                  <td>
                    <MatchStatusBadge status={inv.status === 'confirmed' ? 'manual_confirmed' : inv.status === 'partial' ? 'need_review' : 'unmatched'} />
                  </td>
                  <td>
                    <button type="button" className="ghost" onClick={() => viewInvoiceDetail(inv)}>
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const groupedItems = {
    auto_confirmed: detailItems.filter((i) => i.matchStatus === 'auto_confirmed'),
    manual_confirmed: detailItems.filter((i) => i.matchStatus === 'manual_confirmed'),
    need_review: detailItems.filter((i) => i.matchStatus === 'need_review'),
    unmatched: detailItems.filter((i) => i.matchStatus === 'unmatched'),
    ignored: detailItems.filter((i) => i.matchStatus === 'ignored'),
  }

  const renderItemRow = (item: SupplierInvoiceItem) => (
    <tr key={item.id}>
      <td>{item.productName}</td>
      <td>{item.quantity}</td>
      <td>{item.matchedQty != null ? item.matchedQty : '-'}</td>
      <td>{item.unitPrice ? `¥${item.unitPrice.toFixed(2)}` : '-'}</td>
      <td>{item.amount ? `¥${item.amount.toFixed(2)}` : '-'}</td>
      <td><MatchStatusBadge status={item.matchStatus} /></td>
      <td>
        <div className="admin-actions">
          {item.matchStatus !== 'manual_confirmed' && item.matchStatus !== 'ignored' && (
            <>
              <button type="button" className="ghost" onClick={() => handleUpdateItem(item.id, { matchStatus: 'manual_confirmed' })}>
                确认
              </button>
              <button type="button" className="ghost" onClick={() => handleUpdateItem(item.id, { matchStatus: 'ignored' })}>
                忽略
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )

  const renderMatchGroup = (title: string, items: SupplierInvoiceItem[], groupClass: string) => {
    if (items.length === 0) return null
    return (
      <div className={`match-group ${groupClass}`}>
        <h4>{title} ({items.length})</h4>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>品名</th>
                <th>账单数量</th>
                <th>收货数量</th>
                <th>单价</th>
                <th>金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>{items.map(renderItemRow)}</tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderDetailTab = () => {
    if (detailLoading) return <p className="muted">加载中...</p>
    if (!selectedInvoice) return <p className="muted">请从账单列表选择一张账单查看详情。</p>

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>
              账单详情 — {selectedInvoice.invoiceNo || `#${selectedInvoice.id}`}
            </h2>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {selectedInvoice.supplierName} | {selectedInvoice.periodStart?.slice(0, 10) || '?'} ~ {selectedInvoice.periodEnd?.slice(0, 10) || '?'}
              {selectedInvoice.totalAmount != null && ` | 总金额 ¥${selectedInvoice.totalAmount.toFixed(2)}`}
            </p>
          </div>
          <div className="admin-actions">
            <button type="button" onClick={handleConfirmAll} disabled={confirming}>
              {confirming ? '确认中…' : '批量确认'}
            </button>
            <button type="button" className="ghost" onClick={() => setActiveTab('list')}>返回列表</button>
          </div>
        </div>

        {renderMatchGroup('自动匹配（品名+数量一致）', groupedItems.auto_confirmed, 'match-auto')}
        {renderMatchGroup('待复核（数量有差异）', groupedItems.need_review, 'match-review')}
        {renderMatchGroup('未匹配（找不到对应商品）', groupedItems.unmatched, 'match-unmatched')}
        {renderMatchGroup('已手动确认', groupedItems.manual_confirmed, 'match-confirmed')}
        {renderMatchGroup('已忽略', groupedItems.ignored, 'match-ignored')}

        {detailItems.length === 0 && <p className="muted">该账单无明细数据。</p>}
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>供应商对账</h1>
        <p>上传供应商账单 Excel，自动匹配收货批次进行对账</p>
      </div>
      {message && <p className="hint">{message}</p>}

      <div className="tab-bar">
        {([
          { key: 'upload' as TabKey, label: '上传账单' },
          { key: 'list' as TabKey, label: '账单列表' },
          { key: 'detail' as TabKey, label: '对账详情' },
        ]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => { setActiveTab(tab.key); setMessage(null) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && renderUploadTab()}
      {activeTab === 'list' && renderListTab()}
      {activeTab === 'detail' && renderDetailTab()}

      <SuppliersModal open={suppliersModalOpen} onClose={() => setSuppliersModalOpen(false)} onSuppliersChange={fetchSuppliers} />
    </div>
  )
}
