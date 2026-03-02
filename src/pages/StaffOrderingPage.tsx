import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  getCustomersGrouped,
  getProducts,
  getCustomerFrequentProducts,
  createOrdersBatch,
  createCustomer,
} from '../api/client'
import type { FrequentProduct } from '../api/client'
import type { CartItem, Customer, CustomerCart, Product } from '../types'

type MobileTab = 'customers' | 'products' | 'cart'

export default function StaffOrderingPage() {
  const { token } = useAuth()
  const {
    carts,
    addToCart,
    removeFromCart,
    updateQty,
    updatePrice,
    setDeliveryDate,
    clearCart,
    clearAll,
    totalCustomers,
    totalItems,
  } = useCart()
  const isMobile = useIsMobile()

  // --- Mobile tab ---
  const [mobileTab, setMobileTab] = useState<MobileTab>('customers')

  // --- Customer data ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [grouped, setGrouped] = useState<Record<string, Customer[]>>({})
  const [tags, setTags] = useState<string[]>([])
  const [untagged, setUntagged] = useState<Customer[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)

  // --- Products data ---
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productPage, setProductPage] = useState(0)
  const [productTotal, setProductTotal] = useState(0)
  const PAGE_SIZE = 50

  // --- Frequent products ---
  const [frequentProducts, setFrequentProducts] = useState<FrequentProduct[]>([])
  const [frequentLoading, setFrequentLoading] = useState(false)

  // --- Search dropdown ---
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // --- Quick add customer ---
  const [newCustomerName, setNewCustomerName] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)

  // --- UI state ---
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [expandedCarts, setExpandedCarts] = useState<Set<number>>(new Set())

  // --- Price overrides ---
  const [priceOverrides, setPriceOverrides] = useState<Record<number, string>>({})

  // Load customers
  const loadCustomers = useCallback(async () => {
    if (!token) return
    try {
      const data = await getCustomersGrouped(token)
      setCustomers(data.customers)
      setGrouped(data.grouped)
      setTags(data.tags)
      setUntagged(data.untagged)
    } catch (err: any) {
      showMsg('error', err.message || '加载客户失败')
    }
  }, [token])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Load products
  const loadProducts = useCallback(async () => {
    if (!token) return
    try {
      const data = await getProducts(
        { q: productSearch || undefined, available: '1', limit: PAGE_SIZE, offset: productPage * PAGE_SIZE },
        token
      )
      setProducts(data.items)
      setProductTotal(data.total)
    } catch (err: any) {
      showMsg('error', err.message || '加载商品失败')
    }
  }, [token, productSearch, productPage])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Load frequent products
  const loadFrequentProducts = useCallback(async () => {
    if (!token || !selectedCustomerId) {
      setFrequentProducts([])
      return
    }
    try {
      setFrequentLoading(true)
      const data = await getCustomerFrequentProducts(selectedCustomerId, token)
      setFrequentProducts(data.items)
    } catch {
      setFrequentProducts([])
    } finally {
      setFrequentLoading(false)
    }
  }, [token, selectedCustomerId])

  useEffect(() => {
    loadFrequentProducts()
  }, [loadFrequentProducts])

  // Auto-refresh when page regains focus
  useEffect(() => {
    const handleFocus = () => {
      loadProducts()
      loadFrequentProducts()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadProducts, loadFrequentProducts])

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Filtered customers by tag
  const visibleCustomers = useMemo(() => {
    if (selectedTag === null) return customers
    if (selectedTag === '__untagged__') return untagged
    return grouped[selectedTag] || []
  }, [selectedTag, customers, grouped, untagged])

  // Selected customer object
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  // Frequent product IDs set
  const frequentProductIds = useMemo(
    () => new Set(frequentProducts.map((fp) => fp.productId)),
    [frequentProducts]
  )

  // Search dropdown results (when searching, show dropdown with matches)
  const searchDropdownItems = useMemo(() => {
    if (!productSearch.trim()) return []
    return products.slice(0, 12)
  }, [products, productSearch])

  // --- Add item to cart ---
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({})

  const handleAddToCart = (product: { id: number; name: string; unit: string; price: number; warehouseType?: string }, fromDropdown?: boolean) => {
    if (!selectedCustomer) {
      showMsg('error', '请先选择一个客户')
      return
    }
    const rawQty = qtyInputs[product.id]
    const qty = Number(rawQty)
    if (!qty || qty <= 0) {
      if (fromDropdown) {
        // From dropdown quick-add, default qty = 1
        const defaultQty = product.unit === 'kg' ? 1 : 1
        const price = priceOverrides[product.id] != null ? Number(priceOverrides[product.id]) : product.price
        addToCart(selectedCustomer.id, selectedCustomer.name, {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          price: Number.isFinite(price) && price > 0 ? price : product.price,
          qty: defaultQty,
        })
        showMsg('success', `已添加 ${product.name} ×${defaultQty}`)
        return
      }
      showMsg('error', '请输入有效数量')
      return
    }
    const price = priceOverrides[product.id] != null ? Number(priceOverrides[product.id]) : product.price
    addToCart(selectedCustomer.id, selectedCustomer.name, {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      price: Number.isFinite(price) && price > 0 ? price : product.price,
      qty,
    })
    setQtyInputs((prev) => ({ ...prev, [product.id]: '' }))
    if (fromDropdown) {
      setSearchFocused(false)
      setProductSearch('')
    }
  }

  // --- Quick add customer ---
  const handleAddCustomer = async () => {
    const name = newCustomerName.trim()
    if (!name || !token) return
    try {
      setAddingCustomer(true)
      const result = await createCustomer({ name }, token)
      setNewCustomerName('')
      await loadCustomers()
      if (result.item?.id) setSelectedCustomerId(result.item.id)
      showMsg('success', `客户「${name}」已添加`)
    } catch (err: any) {
      showMsg('error', err.message || '添加客户失败')
    } finally {
      setAddingCustomer(false)
    }
  }

  // --- Select customer (with mobile auto-switch) ---
  const handleSelectCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId)
    if (isMobile) {
      setMobileTab('products')
    }
  }

  // --- Submit all ---
  const handleSubmitAll = async () => {
    const cartEntries = (Object.values(carts) as CustomerCart[]).filter((c) => c.items.length > 0)
    if (cartEntries.length === 0) {
      showMsg('error', '购物车为空')
      return
    }

    const batchOrders = cartEntries.map((cart) => ({
      customerId: cart.customerId,
      deliveryDate: cart.deliveryDate,
      items: cart.items.map((item: CartItem) => ({
        productId: item.productId,
        qtyOrdered: item.qty,
        unitPrice: item.price,
      })),
    }))

    try {
      setSubmitting(true)
      const result = await createOrdersBatch(batchOrders, token!)
      showMsg('success', `成功创建 ${result.count} 个订单！`)
      clearAll()
      // Reload frequent products since new orders just created
      loadFrequentProducts()
    } catch (err: any) {
      showMsg('error', err.message || '提交订单失败')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleCartExpand = (customerId: number) => {
    setExpandedCarts((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  // Render a product row (shared by frequent and full list)
  const renderProductRow = (p: { id: number; name: string; unit: string; warehouseType: string; price: number }, isFrequent: boolean) => (
    <tr key={`${isFrequent ? 'freq' : 'all'}-${p.id}`}>
      <td style={{ fontSize: '0.9rem' }}>
        {p.name}
        {p.warehouseType && (
          <span
            className={`badge ${p.warehouseType === '冻' ? 'badge-wh-frozen' : p.warehouseType === '鲜' ? 'badge-wh-fresh' : 'badge-wh-dry'}`}
            style={{ marginLeft: '0.4rem' }}
          >
            {p.warehouseType}
          </span>
        )}
        {isFrequent && (
          <span className="badge badge-confirmed" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>常购</span>
        )}
      </td>
      <td style={{ fontSize: '0.9rem' }}>{p.unit}</td>
      <td style={{ width: 90 }}>
        <input
          type="number"
          step="0.01"
          min="0"
          value={priceOverrides[p.id] ?? String(p.price)}
          onChange={(e) => setPriceOverrides((prev) => ({ ...prev, [p.id]: e.target.value }))}
          style={{ width: '100%', padding: '0.3rem 0.4rem', fontSize: '0.85rem', textAlign: 'right' }}
        />
      </td>
      <td>
        <input
          type="number"
          min="0"
          step={p.unit === 'kg' ? '0.1' : '1'}
          value={qtyInputs[p.id] || ''}
          onChange={(e) => setQtyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddToCart(p)
          }}
          style={{ width: '100%', padding: '0.3rem 0.4rem', fontSize: '0.85rem', textAlign: 'center' }}
          placeholder="0"
        />
      </td>
      <td>
        <button
          onClick={() => handleAddToCart(p)}
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
        >
          加入
        </button>
      </td>
    </tr>
  )

  // Products that are NOT in the frequent list (avoid duplication)
  const nonFrequentProducts = useMemo(
    () => products.filter((p) => !frequentProductIds.has(p.id)),
    [products, frequentProductIds]
  )

  // ===== Panel JSX =====

  const customerPanel = (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        ...(isMobile ? {} : { maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' as const }),
      }}
    >
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '0.9rem' }}>
        客户列表
      </div>
      {/* Quick add customer */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '0.3rem' }}>
        <input
          type="text"
          placeholder="餐馆名称..."
          value={newCustomerName}
          onChange={(e) => setNewCustomerName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomer() }}
          style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.8rem', minWidth: 0 }}
        />
        <button
          onClick={handleAddCustomer}
          disabled={addingCustomer || !newCustomerName.trim()}
          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
        >
          +
        </button>
      </div>
      {visibleCustomers.length === 0 ? (
        <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>无客户</div>
      ) : (
        visibleCustomers.map((c) => {
          const cartCount = carts[c.id]?.items.length || 0
          return (
            <div
              key={c.id}
              onClick={() => handleSelectCustomer(c.id)}
              style={{
                padding: '0.6rem 1rem',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-light)',
                background: selectedCustomerId === c.id ? 'var(--color-primary-light)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>{c.name}</span>
              {cartCount > 0 && (
                <span className="badge badge-created" style={{ fontSize: '0.75rem' }}>
                  {cartCount}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  const productPanel = (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          商品列表 {selectedCustomer ? `→ ${selectedCustomer.name}` : ''}
        </span>
        {/* Search with dropdown */}
        <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: isMobile ? undefined : 300 }}>
          <input
            type="text"
            placeholder="搜索商品..."
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value)
              setProductPage(0)
              setSearchFocused(true)
            }}
            onFocus={() => setSearchFocused(true)}
            style={{ width: '100%', padding: '0.35rem 0.6rem', fontSize: '0.9rem' }}
          />
          {/* Search dropdown */}
          {searchFocused && productSearch.trim() && searchDropdownItems.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 100,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderTop: 'none',
                borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {searchDropdownItems.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    {p.warehouseType && (
                      <span
                        className={`badge ${p.warehouseType === '冻' ? 'badge-wh-frozen' : p.warehouseType === '鲜' ? 'badge-wh-fresh' : 'badge-wh-dry'}`}
                        style={{ marginLeft: '0.3rem', fontSize: '0.7rem' }}
                      >
                        {p.warehouseType}
                      </span>
                    )}
                    {frequentProductIds.has(p.id) && (
                      <span className="badge badge-confirmed" style={{ marginLeft: '0.3rem', fontSize: '0.65rem' }}>常购</span>
                    )}
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                      ¥{p.price}/{p.unit}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                    <input
                      type="number"
                      min="0"
                      step={p.unit === 'kg' ? '0.1' : '1'}
                      value={qtyInputs[p.id] || ''}
                      onChange={(e) => setQtyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddToCart(p, true)
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder="数量"
                      style={{ width: 60, padding: '0.2rem 0.3rem', fontSize: '0.8rem', textAlign: 'center' }}
                    />
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleAddToCart(p, true)
                      }}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selectedCustomer ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          {isMobile ? '请先在「客户」标签选择一个客户' : '请先在左侧选择一个客户'}
        </div>
      ) : (
        <>
          {/* Delivery date picker */}
          <div
            style={{
              padding: '0.5rem 1rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              background: '#fffbeb',
            }}
          >
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>送达日期：</span>
            <input
              type="date"
              value={carts[selectedCustomer.id]?.deliveryDate || new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDeliveryDate(selectedCustomer.id, e.target.value, selectedCustomer.name)
              }}
              style={{ padding: '0.3rem 0.5rem', fontSize: '0.9rem' }}
            />
          </div>
          <div style={isMobile ? {} : { maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>单位</th>
                  <th style={{ width: 90, textAlign: 'right' }}>单价</th>
                  <th style={{ width: 100, textAlign: 'center' }}>数量</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {/* Frequent products section */}
                {!productSearch.trim() && frequentProducts.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          background: '#f0fdf4',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          color: '#166534',
                          padding: '0.4rem 0.75rem',
                        }}
                      >
                        常购商品（{frequentProducts.length}）
                      </td>
                    </tr>
                    {frequentProducts.filter(fp => fp.isAvailable).map((fp) =>
                      renderProductRow(
                        { id: fp.productId, name: fp.name, unit: fp.unit, warehouseType: fp.warehouseType, price: fp.price },
                        true
                      )
                    )}
                    {nonFrequentProducts.length > 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            background: 'var(--bg-table-header)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                            padding: '0.4rem 0.75rem',
                          }}
                        >
                          其他商品
                        </td>
                      </tr>
                    )}
                  </>
                )}
                {/* Remaining products (or all if searching) */}
                {(productSearch.trim() ? products : nonFrequentProducts).map((p) =>
                  renderProductRow(p, false)
                )}
                {frequentLoading && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.5rem' }}>
                      加载常购商品中…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {productTotal > PAGE_SIZE && (
            <div className="pagination">
              <button
                className="ghost"
                disabled={productPage === 0}
                onClick={() => setProductPage((p) => p - 1)}
              >
                上一页
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {productPage * PAGE_SIZE + 1}-{Math.min((productPage + 1) * PAGE_SIZE, productTotal)} / {productTotal}
              </span>
              <button
                className="ghost"
                disabled={(productPage + 1) * PAGE_SIZE >= productTotal}
                onClick={() => setProductPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  const cartPanel = (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        ...(isMobile ? {} : { maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' as const }),
      }}
    >
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-light)',
          fontWeight: 600,
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>购物车</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
          {totalCustomers} 客户, {totalItems} 件
        </span>
      </div>

      {totalCustomers === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          购物车为空
        </div>
      ) : (
        (Object.values(carts) as CustomerCart[]).filter((c) => c.items.length > 0).map((cart) => {
          const isExpanded = expandedCarts.has(cart.customerId)
          const subtotal = cart.items.reduce((s: number, i: CartItem) => s + i.qty * i.price, 0)
          return (
            <div
              key={cart.customerId}
              style={{ borderBottom: '1px solid var(--border-light)' }}
            >
              {/* Cart header */}
              <div
                onClick={() => toggleCartExpand(cart.customerId)}
                style={{
                  padding: '0.6rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-table-header)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {isExpanded ? '▾' : '▸'} {cart.customerName}
                  </span>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {cart.items.length} 件
                  </span>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  ¥{subtotal.toFixed(2)}
                </span>
              </div>

              {isExpanded && (
                <div style={{ padding: '0.5rem 1rem' }}>
                  {/* Delivery date */}
                  <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>送货日:</span>
                    <input
                      type="date"
                      value={cart.deliveryDate}
                      onChange={(e) => setDeliveryDate(cart.customerId, e.target.value)}
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                    />
                  </div>

                  {/* Items */}
                  {cart.items.map((item: CartItem) => (
                    <div
                      key={item.productId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.3rem 0',
                        fontSize: '0.85rem',
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.productName}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.price}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (v > 0) updatePrice(cart.customerId, item.productId, v)
                          }}
                          style={{ width: 55, padding: '0.15rem 0.3rem', fontSize: '0.75rem', textAlign: 'right' }}
                          title="单价"
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>×</span>
                        <input
                          type="number"
                          min="0.1"
                          step={item.unit === 'kg' ? '0.1' : '1'}
                          value={item.qty}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (v > 0) updateQty(cart.customerId, item.productId, v)
                          }}
                          style={{ width: 45, padding: '0.15rem 0.3rem', fontSize: '0.8rem', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.unit}</span>
                        <button
                          className="ghost"
                          onClick={() => removeFromCart(cart.customerId, item.productId)}
                          style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
                    <button
                      className="ghost"
                      onClick={() => clearCart(cart.customerId)}
                      style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', color: 'var(--color-danger)' }}
                    >
                      清空此客户
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Submit all */}
      {totalCustomers > 0 && (
        <div style={{ padding: '0.75rem 1rem' }}>
          <button
            onClick={handleSubmitAll}
            disabled={submitting}
            style={{ width: '100%', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 600 }}
          >
            {submitting ? '提交中...' : `提交全部订单 (${totalCustomers} 个客户)`}
          </button>
          <button
            className="ghost"
            onClick={clearAll}
            style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
          >
            清空全部
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="page-content" style={isMobile ? {} : { maxWidth: 1400 }}>
      <div className="page-header">
        <h1>代客下单</h1>
        <p>选择客户，添加商品，统一提交订单</p>
      </div>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Tag filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          className={selectedTag === null ? '' : 'ghost'}
          onClick={() => setSelectedTag(null)}
          style={{ borderRadius: 999, padding: '0.3rem 0.85rem', fontSize: '0.9rem' }}
        >
          全部 ({customers.length})
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            className={selectedTag === tag ? '' : 'ghost'}
            onClick={() => setSelectedTag(tag)}
            style={{ borderRadius: 999, padding: '0.3rem 0.85rem', fontSize: '0.9rem' }}
          >
            {tag} ({grouped[tag]?.length || 0})
          </button>
        ))}
        {untagged.length > 0 && (
          <button
            className={selectedTag === '__untagged__' ? '' : 'ghost'}
            onClick={() => setSelectedTag('__untagged__')}
            style={{ borderRadius: 999, padding: '0.3rem 0.85rem', fontSize: '0.9rem' }}
          >
            未标记 ({untagged.length})
          </button>
        )}
      </div>

      {/* Mobile: tab bar + single panel */}
      {isMobile ? (
        <>
          <div className="mobile-tab-bar">
            <button
              className={mobileTab === 'customers' ? 'active' : ''}
              onClick={() => setMobileTab('customers')}
            >
              客户
            </button>
            <button
              className={mobileTab === 'products' ? 'active' : ''}
              onClick={() => setMobileTab('products')}
            >
              商品
            </button>
            <button
              className={mobileTab === 'cart' ? 'active' : ''}
              onClick={() => setMobileTab('cart')}
            >
              购物车
              {totalItems > 0 && <span className="mobile-tab-badge">{totalItems}</span>}
            </button>
          </div>

          {mobileTab === 'customers' && customerPanel}
          {mobileTab === 'products' && productPanel}
          {mobileTab === 'cart' && cartPanel}

          {/* Floating cart button (when not on cart tab) */}
          {mobileTab !== 'cart' && totalItems > 0 && (
            <button className="cart-fab" onClick={() => setMobileTab('cart')}>
              🛒
              <span className="cart-fab-badge">{totalItems}</span>
            </button>
          )}
        </>
      ) : (
        /* Desktop: three-panel grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr 300px',
            gap: '1rem',
            alignItems: 'start',
          }}
        >
          {customerPanel}
          {productPanel}
          {cartPanel}
        </div>
      )}
    </div>
  )
}
