import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  bulkDeleteProducts,
  createOrder,
  deleteProduct,
  getProducts,
  updateProduct,
  updateProductAvailability,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Product } from '../types'
import { formatMoney } from '../utils/money'

interface OrderSummaryItem {
  productId: number
  name: string
  unit: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export default function ProductsPage() {
  const { token, user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [available, setAvailable] = useState<'all' | '1' | '0'>('all')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [updatingProductId, setUpdatingProductId] = useState<number | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: '', unit: '', warehouseType: '', price: '' })
  const [orderSummary, setOrderSummary] = useState<{ items: OrderSummaryItem[]; total: number } | null>(null)

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const unitOptions = ['kg', '箱', '袋', '件', '桶']
  const warehouseOptions = ['干', '鲜', '冻']

  const productMap = useMemo(() => {
    const map = new Map<number, Product>()
    products.forEach((product) => map.set(product.id, product))
    return map
  }, [products])

  const uniqueOptions = (current: string, base: string[]) => {
    const list = current ? [current, ...base] : base
    return Array.from(new Set(list)).filter(Boolean)
  }

  const fetchProducts = async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const data = await getProducts(
        {
          q: query.trim() || undefined,
          available: available === 'all' ? undefined : available,
          limit: 50,
          offset: 0,
        },
        token
      )
      setProducts(data.items)
      setSelectedIds((prev) => {
        const next = new Set<number>()
        data.items.forEach((item) => {
          if (prev.has(item.id)) next.add(item.id)
        })
        return next
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleSearch = (evt: FormEvent) => {
    evt.preventDefault()
    fetchProducts()
  }

  const handleQtyChange = (id: number, value: string) => {
    setQuantities((prev) => ({ ...prev, [id]: value }))
  }

  const selectedItems = Object.entries(quantities)
    .map(([id, val]) => ({ productId: Number(id), qty: Number(val) }))
    .filter((item) => !Number.isNaN(item.qty) && item.qty > 0)

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault()
    setOrderSummary(null)
    if (!deliveryDate) {
      setResult('请先选择送达日期')
      return
    }
    if (!selectedItems.length) {
      setResult('至少填写一个商品数量')
      return
    }
    try {
      setSubmitting(true)
      setResult(null)
      const response = await createOrder(
        {
          deliveryDate: deliveryDate,
          items: selectedItems.map((item) => ({ productId: item.productId, qtyOrdered: item.qty })),
        },
        token!
      )

      const summaryItems: OrderSummaryItem[] = selectedItems.map((item) => {
        const product = productMap.get(item.productId)
        const unitPrice = product?.price ?? 0
        const lineTotal = Math.round(item.qty * unitPrice * 100) / 100
        return {
          productId: item.productId,
          name: product?.name ?? `商品 #${item.productId}`,
          unit: product?.unit ?? '',
          qty: item.qty,
          unitPrice,
          lineTotal,
        }
      })
      const computedTotal = summaryItems.reduce((sum, item) => sum + item.lineTotal, 0)

      setOrderSummary({
        items: summaryItems,
        total: Math.round((response?.totalAmount ?? computedTotal) * 100) / 100,
      })
      setResult('下单成功，订单已创建！')
      setQuantities({})
    } catch (err) {
      setResult((err as Error).message)
      setOrderSummary(null)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelection = (productId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)))
    }
  }

  const handleEditProduct = (product: Product) => {
    setEditingProductId(product.id)
    setEditForm({
      name: product.name,
      unit: product.unit || '件',
      warehouseType: product.warehouseType || '干',
      price: product.price ? String(product.price) : '',
    })
  }

  const handleEditInputChange = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveEdit = async () => {
    if (!editingProductId || !token) return
    const payload: Record<string, unknown> = {}
    if (editForm.name.trim()) payload.name = editForm.name.trim()
    if (editForm.unit.trim()) payload.unit = editForm.unit.trim()
    if (editForm.warehouseType.trim()) payload.warehouseType = editForm.warehouseType.trim()
    const priceVal = Number(editForm.price)
    if (!Number.isNaN(priceVal)) payload.price = priceVal

    try {
      setResult(null)
      await updateProduct(editingProductId, payload, token)
      setResult('商品信息已更新')
      setEditingProductId(null)
      fetchProducts()
    } catch (err) {
      setResult((err as Error).message)
    }
  }

  const handleCancelEdit = () => {
    setEditingProductId(null)
  }

  const handleBulkDelete = async () => {
    if (!token || selectedIds.size === 0) return
    if (!window.confirm(`确认删除选中的 ${selectedIds.size} 个商品吗？`)) {
      return
    }
    try {
      setResult(null)
      await bulkDeleteProducts(Array.from(selectedIds), token)
      setSelectedIds(new Set())
      setResult('已批量删除所选商品')
      fetchProducts()
    } catch (err) {
      setResult((err as Error).message)
    }
  }

  const handleToggleAvailability = async (product: Product) => {
    if (!token) return
    const nextState = product.isAvailable ? '下架' : '上架'
    try {
      setUpdatingProductId(product.id)
      setResult(null)
      await updateProductAvailability(product.id, !product.isAvailable, token)
      setResult(`${product.name} 已${nextState}`)
      fetchProducts()
    } catch (err) {
      setResult((err as Error).message)
    } finally {
      setUpdatingProductId(null)
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    if (!token) return
    if (!window.confirm(`确认删除商品「${product.name}」吗？`)) {
      return
    }
    try {
      setDeletingProductId(product.id)
      setResult(null)
      await deleteProduct(product.id, token)
      setResult(`${product.name} 已删除`)
      fetchProducts()
    } catch (err) {
      setResult((err as Error).message)
    } finally {
      setDeletingProductId(null)
    }
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div>
      <h1>商品列表</h1>
      <form className="filters" onSubmit={handleSearch}>
        <input placeholder="搜索关键字" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={available} onChange={(e) => setAvailable(e.target.value as 'all' | '1' | '0')}>
          <option value="all">全部</option>
          <option value="1">只看在售</option>
          <option value="0">包含停用</option>
        </select>
        <button type="submit">刷新</button>
      </form>

      {loading && <p>加载中…</p>}
      {error && <p className="error-text">{error}</p>}
      {isAdmin && (
        <div className="admin-toolbar">
          <span>已选 {selectedIds.size} 个商品</span>
          <button type="button" className="danger" disabled={selectedIds.size === 0} onClick={handleBulkDelete}>
            批量删除
          </button>
          {editingProductId && (
            <span className="hint">正在编辑商品 #{editingProductId}</span>
          )}
        </div>
      )}

      <form className="products-form" onSubmit={handleSubmit}>
        <table>
          <thead>
            <tr>
              {isAdmin && (
                <th>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === products.length && products.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              <th>名称</th>
              <th>单位</th>
              <th>仓储</th>
              <th>价格</th>
              <th>可用</th>
              <th>下单数量</th>
              {isAdmin && <th>管理</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const step = product.unit === 'kg' ? 0.1 : 1
              const min = product.unit === 'kg' ? 0.1 : 1
              const isEditing = editingProductId === product.id

              return (
                <tr key={product.id} className={!product.isAvailable ? 'muted' : ''}>
                  {isAdmin && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelection(product.id)}
                      />
                    </td>
                  )}
                  <td>
                    {isAdmin && isEditing ? (
                      <input value={editForm.name} onChange={(e) => handleEditInputChange('name', e.target.value)} />
                    ) : (
                      product.name
                    )}
                  </td>
                  <td>
                    {isAdmin && isEditing ? (
                      <select value={editForm.unit} onChange={(e) => handleEditInputChange('unit', e.target.value)}>
                        {uniqueOptions(editForm.unit, unitOptions).map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    ) : (
                      product.unit
                    )}
                  </td>
                  <td>
                    {isAdmin && isEditing ? (
                      <select
                        value={editForm.warehouseType}
                        onChange={(e) => handleEditInputChange('warehouseType', e.target.value)}
                      >
                        {uniqueOptions(editForm.warehouseType, warehouseOptions).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      product.warehouseType
                    )}
                  </td>
                  <td>
                    {isAdmin && isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.price}
                        onChange={(e) => handleEditInputChange('price', e.target.value)}
                      />
                    ) : (
                      <>{formatMoney(product.price)}</>
                    )}
                  </td>
                  <td>{product.isAvailable ? '在售' : '暂停'}</td>
                  <td>
                    <input
                      type="number"
                      step={step}
                      min={min}
                      value={quantities[product.id] ?? ''}
                      disabled={!product.isAvailable}
                      placeholder={product.unit === 'kg' ? '0.5' : '1'}
                      onChange={(e) => handleQtyChange(product.id, e.target.value)}
                    />
                  </td>
                  {isAdmin && (
                    <td className="admin-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleToggleAvailability(product)}
                        disabled={updatingProductId === product.id}
                      >
                        {product.isAvailable ? '下架' : '上架'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleDeleteProduct(product)}
                        disabled={deletingProductId === product.id}
                      >
                        删除
                      </button>
                      {isEditing ? (
                        <>
                          <button type="button" onClick={handleSaveEdit}>
                            保存
                          </button>
                          <button type="button" className="ghost" onClick={handleCancelEdit}>
                            取消
                          </button>
                        </>
                      ) : (
                        <button type="button" className="ghost" onClick={() => handleEditProduct(product)}>
                          编辑
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="submit-bar">
          <label>
            送达日期
            <input type="date" min={minDate} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? '提交中…' : '提交订单'}
          </button>
        </div>
        {result && <p className="hint">{result}</p>}
      </form>

      {orderSummary && (
        <div className="order-summary">
          <h2>价格明细</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>数量</th>
                  <th>单价</th>
                  <th>小计</th>
                </tr>
              </thead>
              <tbody>
                {orderSummary.items.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.name}</td>
                    <td>
                      {item.qty} {item.unit}
                    </td>
                    <td>{formatMoney(item.unitPrice)}</td>
                    <td>{formatMoney(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="order-summary-total">总价：{formatMoney(orderSummary.total)}</div>
        </div>
      )}
    </div>
  )
}
