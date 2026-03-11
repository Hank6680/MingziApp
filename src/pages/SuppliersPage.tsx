import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, getReceivingBatches } from '../api/client'
import type { Supplier, ReceivingBatch } from '../types'

export default function SuppliersPage() {
  const { token } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', contact: '', phone: '', notes: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null)
  const [batches, setBatches] = useState<ReceivingBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)

  const loadSuppliers = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const data = await getSuppliers(token)
      setSuppliers(data.items || [])
    } catch (err: any) {
      showMessage('error', err.message || '加载供应商失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !form.name.trim()) return

    try {
      await createSupplier({ ...form, name: form.name.trim() }, token)
      showMessage('success', '供应商添加成功')
      setForm({ name: '', contact: '', phone: '', notes: '' })
      setShowAddForm(false)
      loadSuppliers()
    } catch (err: any) {
      showMessage('error', err.message || '添加供应商失败')
    }
  }

  const handleUpdate = async (id: number) => {
    if (!token || !form.name.trim()) return

    try {
      await updateSupplier(id, { ...form, name: form.name.trim() }, token)
      showMessage('success', '供应商更新成功')
      setEditingId(null)
      setForm({ name: '', contact: '', phone: '', notes: '' })
      loadSuppliers()
    } catch (err: any) {
      showMessage('error', err.message || '更新供应商失败')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!token || !confirm(`确定删除供应商 "${name}" 吗？`)) return

    try {
      await deleteSupplier(id, token)
      showMessage('success', '供应商删除成功')
      loadSuppliers()
    } catch (err: any) {
      showMessage('error', err.message || '删除供应商失败')
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setEditingId(supplier.id)
    setForm({
      name: supplier.name || '',
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      notes: supplier.notes || '',
    })
    setShowAddForm(false)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm({ name: '', contact: '', phone: '', notes: '' })
  }

  const loadBatches = async (supplierId: number) => {
    if (!token) return
    try {
      setBatchesLoading(true)
      const data = await getReceivingBatches({ supplierId }, token)
      setBatches(data.items || [])
      setSelectedSupplierId(supplierId)
    } catch (err) {
      console.error('Failed to load batches:', err)
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="page-banner">
        <div className="page-banner-left">
          <h1>供应商管理</h1>
          <p>管理所有供应商信息和入库记录</p>
        </div>
        <div className="page-banner-actions">
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingId(null)
              setForm({ name: '', contact: '', phone: '', notes: '' })
            }}
            className="btn btn-primary"
          >
            ➕ 添加供应商
          </button>
        </div>
      </div>
      <div>

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
              {editingId ? '编辑供应商' : '添加供应商'}
            </h2>
            <form onSubmit={editingId ? (e) => { e.preventDefault(); handleUpdate(editingId); } : handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    供应商名称 <span className="text-red-500">*</span>
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

        {/* Suppliers List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        ) : suppliers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">暂无供应商</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{supplier.name}</h3>
                    {supplier.contact && (
                      <p className="text-sm text-gray-600 mt-1">联系人: {supplier.contact}</p>
                    )}
                    {supplier.phone && (
                      <p className="text-sm text-gray-600">电话: {supplier.phone}</p>
                    )}
                    {supplier.notes && (
                      <p className="text-sm text-gray-500 mt-2">{supplier.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(supplier)}
                      className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(supplier.id, supplier.name)}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => loadBatches(supplier.id)}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  查看入库记录
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Batches Modal */}
        {selectedSupplierId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">入库记录</h2>
                  <button
                    onClick={() => {
                      setSelectedSupplierId(null)
                      setBatches([])
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                {batchesLoading ? (
                  <div className="text-center py-8 text-gray-500">加载中...</div>
                ) : batches.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无入库记录</div>
                ) : (
                  <div className="space-y-4">
                    {batches.map((batch) => (
                      <div key={batch.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            入库日期: {batch.batchDate || '-'}
                          </span>
                          <span className="text-xs text-gray-500">ID: {batch.id}</span>
                        </div>
                        {batch.notes && (
                          <p className="text-sm text-gray-600 mb-2">备注: {batch.notes}</p>
                        )}
                        {batch.items && batch.items.length > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            共 {batch.items.length} 个产品
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

