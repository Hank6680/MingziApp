import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerTags, setCustomerTags } from '../api/client'
import type { Customer } from '../types'

export default function CustomersPage() {
  const { token } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', notes: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [customerTags, setCustomerTagsState] = useState<Record<number, string[]>>({})
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState<Record<number, string>>({})
  const [tagEditingId, setTagEditingId] = useState<number | null>(null)

  const loadCustomers = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const data = await getCustomers(token)
      setCustomers(data.items || [])
    } catch (err: any) {
      showMessage('error', err.message || '加载客户失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadTags = useCallback(async () => {
    if (!token) return
    try {
      // Load all unique tags
      const tagData = await getCustomerTags(token)
      setAllTags(tagData.tags || [])

      // Load tags for each customer via the grouped endpoint
      const { getCustomersGrouped } = await import('../api/client')
      const grouped = await getCustomersGrouped(token)
      const tagMap: Record<number, string[]> = {}
      for (const c of grouped.customers) {
        tagMap[c.id] = c.tags || []
      }
      setCustomerTagsState(tagMap)
    } catch { /* non-critical */ }
  }, [token])

  useEffect(() => {
    loadCustomers()
    loadTags()
  }, [loadCustomers, loadTags])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !form.name.trim()) return

    try {
      await createCustomer({ ...form, name: form.name.trim() }, token)
      showMessage('success', '客户添加成功')
      setForm({ name: '', contact: '', phone: '', address: '', notes: '' })
      setShowAddForm(false)
      loadCustomers()
    } catch (err: any) {
      showMessage('error', err.message || '添加客户失败')
    }
  }

  const handleUpdate = async (id: number) => {
    if (!token || !form.name.trim()) return

    try {
      await updateCustomer(id, { ...form, name: form.name.trim() }, token)
      showMessage('success', '客户更新成功')
      setEditingId(null)
      setForm({ name: '', contact: '', phone: '', address: '', notes: '' })
      loadCustomers()
    } catch (err: any) {
      showMessage('error', err.message || '更新客户失败')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!token || !confirm(`确定删除客户 "${name}" 吗？`)) return

    try {
      await deleteCustomer(id, token)
      showMessage('success', '客户删除成功')
      loadCustomers()
    } catch (err: any) {
      showMessage('error', err.message || '删除客户失败')
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id)
    setForm({
      name: customer.name || '',
      contact: customer.contact || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || '',
    })
    setShowAddForm(false)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm({ name: '', contact: '', phone: '', address: '', notes: '' })
  }

  const handleAddTag = async (customerId: number) => {
    const newTag = (tagInput[customerId] || '').trim()
    if (!newTag || !token) return
    const currentTags = customerTags[customerId] || []
    if (currentTags.includes(newTag)) {
      setTagInput((prev) => ({ ...prev, [customerId]: '' }))
      return
    }
    try {
      const result = await setCustomerTags(customerId, [...currentTags, newTag], token)
      setCustomerTagsState((prev) => ({ ...prev, [customerId]: result.tags }))
      setTagInput((prev) => ({ ...prev, [customerId]: '' }))
      if (!allTags.includes(newTag)) setAllTags((prev) => [...prev, newTag].sort())
    } catch (err: any) {
      showMessage('error', err.message || '添加标签失败')
    }
  }

  const handleRemoveTag = async (customerId: number, tag: string) => {
    if (!token) return
    const currentTags = customerTags[customerId] || []
    try {
      const result = await setCustomerTags(customerId, currentTags.filter((t) => t !== tag), token)
      setCustomerTagsState((prev) => ({ ...prev, [customerId]: result.tags }))
    } catch (err: any) {
      showMessage('error', err.message || '删除标签失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">客户管理</h1>
            <p className="mt-2 text-sm text-gray-600">管理所有客户（餐馆）信息</p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingId(null)
              setForm({ name: '', contact: '', phone: '', address: '', notes: '' })
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 添加客户
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingId ? '编辑客户' : '添加客户'}
            </h2>
            <form onSubmit={editingId ? (e) => { e.preventDefault(); handleUpdate(editingId); } : handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    客户名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingId ? '保存' : '添加'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    handleCancelEdit()
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Customers List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">暂无客户</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {customers.map((customer) => (
              <div key={customer.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{customer.name}</h3>
                    {customer.contact && (
                      <p className="text-sm text-gray-600 mt-1">联系人: {customer.contact}</p>
                    )}
                    {customer.phone && (
                      <p className="text-sm text-gray-600">电话: {customer.phone}</p>
                    )}
                    {customer.address && (
                      <p className="text-sm text-gray-600">地址: {customer.address}</p>
                    )}
                    {customer.notes && (
                      <p className="text-sm text-gray-500 mt-2">{customer.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(customer)}
                      className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(customer.id, customer.name)}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  {(customerTags[customer.id] || []).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 999,
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        background: '#dbeafe',
                        color: '#1e40af',
                      }}
                    >
                      {tag}
                      <span
                        onClick={() => handleRemoveTag(customer.id, tag)}
                        style={{ cursor: 'pointer', fontWeight: 700, marginLeft: '0.15rem' }}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                  {tagEditingId === customer.id ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={tagInput[customer.id] || ''}
                        onChange={(e) => setTagInput((prev) => ({ ...prev, [customer.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag(customer.id)
                          if (e.key === 'Escape') setTagEditingId(null)
                        }}
                        placeholder="输入标签"
                        list={`taglist-${customer.id}`}
                        style={{ width: 90, padding: '0.15rem 0.4rem', fontSize: '0.78rem' }}
                        autoFocus
                      />
                      <datalist id={`taglist-${customer.id}`}>
                        {allTags.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                      <button
                        onClick={() => handleAddTag(customer.id)}
                        style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                      >
                        +
                      </button>
                      <button
                        className="ghost"
                        onClick={() => setTagEditingId(null)}
                        style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <button
                      className="ghost"
                      onClick={() => setTagEditingId(customer.id)}
                      style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem', borderRadius: 999 }}
                    >
                      + 标签
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
