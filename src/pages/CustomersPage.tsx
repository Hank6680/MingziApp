import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerTags,
  setCustomerTags,
  getCustomersGrouped,
} from '../api/client'
import type { Customer } from '../types'

const EMPTY_FORM = { name: '', contact: '', phone: '', address: '', notes: '' }

export default function CustomersPage() {
  const { token } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [customerTags, setCustomerTagsState] = useState<Record<number, string[]>>({})
  const [allTags, setAllTags] = useState<string[]>([])

  // Filter state
  const [search, setSearch] = useState('')
  const [filterTags, setFilterTags] = useState<string[]>([])

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      const tagData = await getCustomerTags(token)
      setAllTags(tagData.tags || [])
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

  const openAddModal = () => {
    setEditingCustomer(null)
    setForm(EMPTY_FORM)
    setTagInput('')
    setModalOpen(true)
  }

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name || '',
      contact: customer.contact || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || '',
    })
    setTagInput('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingCustomer(null)
    setForm(EMPTY_FORM)
    setTagInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !form.name.trim()) return
    try {
      setSubmitting(true)
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, { ...form, name: form.name.trim() }, token)
        showMessage('success', '客户更新成功')
      } else {
        await createCustomer({ ...form, name: form.name.trim() }, token)
        showMessage('success', '客户添加成功')
      }
      closeModal()
      loadCustomers()
      loadTags()
    } catch (err: any) {
      showMessage('error', err.message || '操作失败')
    } finally {
      setSubmitting(false)
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

  const handleAddTag = async (customerId: number) => {
    const newTag = tagInput.trim()
    if (!newTag || !token) return
    const currentTags = customerTags[customerId] || []
    if (currentTags.includes(newTag)) {
      setTagInput('')
      return
    }
    try {
      const result = await setCustomerTags(customerId, [...currentTags, newTag], token)
      setCustomerTagsState((prev) => ({ ...prev, [customerId]: result.tags }))
      setTagInput('')
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

  const modalTags = editingCustomer ? (customerTags[editingCustomer.id] || []) : []

  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    const tags = customerTags[c.id] || []
    const matchesTags = filterTags.length === 0 || filterTags.every((t) => tags.includes(t))
    return matchesSearch && matchesTags
  })

  const toggleFilterTag = (tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const allFilteredSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedIds.has(c.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredCustomers.forEach((c) => next.delete(c.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredCustomers.forEach((c) => next.add(c.id))
        return next
      })
    }
  }

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !token) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个客户吗？此操作不可撤销。`)) return
    try {
      setBulkDeleting(true)
      await Promise.all(Array.from(selectedIds).map((id) => deleteCustomer(id, token)))
      showMessage('success', `已删除 ${selectedIds.size} 个客户`)
      setSelectedIds(new Set())
      loadCustomers()
      loadTags()
    } catch (err: any) {
      showMessage('error', err.message || '批量删除失败')
    } finally {
      setBulkDeleting(false)
    }
  }

  const exportCsv = () => {
    const rows = [
      ['客户名称', '联系人', '电话', '地址', '标签', '备注'],
      ...filteredCustomers.map((c) => [
        c.name,
        c.contact || '',
        c.phone || '',
        c.address || '',
        (customerTags[c.id] || []).join('|'),
        c.notes || '',
      ]),
    ]
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `客户列表_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">客户管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              共 {customers.length} 个客户{filteredCustomers.length !== customers.length && `，当前筛选 ${filteredCustomers.length} 个`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              disabled={filteredCustomers.length === 0}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors text-sm font-medium"
            >
              导出 CSV
            </button>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              + 添加客户
            </button>
          </div>
        </div>

        {/* Search & Tag Filter */}
        <div className="mb-4 flex flex-wrap gap-3 items-start">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索客户名、联系人、电话、地址…"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-72"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-gray-400">标签筛选：</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleFilterTag(tag)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    filterTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {filterTags.length > 0 && (
                <button
                  onClick={() => setFilterTags([])}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                >
                  清除
                </button>
              )}
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm text-blue-700 font-medium">已选 {selectedIds.size} 个客户</span>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {bulkDeleting ? '删除中…' : '批量删除'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-blue-500 hover:text-blue-700 ml-auto"
            >
              取消选择
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-6 animate-pulse space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">暂无客户</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">没有匹配的客户</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户名称</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">联系人</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">电话</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">地址</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">标签</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(customer.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelectOne(customer.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 text-sm">{customer.name}</span>
                        {customer.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs" title={customer.notes}>{customer.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{customer.contact || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{customer.phone || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                        <span className="truncate block" title={customer.address || ''}>{customer.address || <span className="text-gray-300">—</span>}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(customerTags[customer.id] || []).map((tag) => (
                            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => openEditModal(customer)}
                            className="text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id, customer.name)}
                            className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCustomer ? '编辑客户' : '添加客户'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    客户名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Tags — only available when editing an existing customer */}
              {editingCustomer && (
                <div className="pt-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">标签</label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                    {modalTags.length === 0 && (
                      <span className="text-xs text-gray-400">暂无标签</span>
                    )}
                    {modalTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(editingCustomer.id, tag)}
                          className="text-blue-400 hover:text-blue-700 font-bold leading-none ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddTag(editingCustomer.id) }
                        if (e.key === 'Escape') setTagInput('')
                      }}
                      list="taglist-modal"
                      placeholder="输入标签后按 Enter"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <datalist id="taglist-modal">
                      {allTags.map((t) => <option key={t} value={t} />)}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => handleAddTag(editingCustomer.id)}
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      添加
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? '保存中…' : editingCustomer ? '保存修改' : '添加客户'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
