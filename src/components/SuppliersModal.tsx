import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Supplier } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onSuppliersChange?: () => void
}

export default function SuppliersModal({ open, onClose, onSuppliersChange }: Props) {
  const { token } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editContact, setEditContact] = useState('')

  const fetchSuppliers = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const data = await getSuppliers(token)
      setSuppliers(data.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (open) fetchSuppliers()
  }, [open, fetchSuppliers])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !name.trim()) return
    try {
      setError(null)
      await createSupplier({ name: name.trim(), contact: contact.trim() || undefined }, token)
      setName('')
      setContact('')
      await fetchSuppliers()
      onSuppliersChange?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (id: number) => {
    if (!token) return
    try {
      setError(null)
      await deleteSupplier(id, token)
      await fetchSuppliers()
      onSuppliersChange?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const startEdit = (s: Supplier) => {
    setEditingId(s.id)
    setEditName(s.name)
    setEditContact(s.contact ?? '')
  }

  const handleSaveEdit = async () => {
    if (!token || editingId == null || !editName.trim()) return
    try {
      setError(null)
      await updateSupplier(editingId, { name: editName.trim(), contact: editContact.trim() }, token)
      setEditingId(null)
      await fetchSuppliers()
      onSuppliersChange?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!open) return null

  return (
    <div className="suppliers-modal-overlay" onMouseDown={onClose}>
      <div className="suppliers-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>供应商管理</h2>
        {error && <p className="error-text">{error}</p>}

        <form className="supplier-form" onSubmit={handleAdd}>
          <input placeholder="供应商名称" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="联系方式（选填）" value={contact} onChange={(e) => setContact(e.target.value)} />
          <button type="submit">新增</button>
        </form>

        {loading ? (
          <p className="muted">加载中...</p>
        ) : suppliers.length === 0 ? (
          <p className="muted">暂无供应商</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>联系方式</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) =>
                  editingId === s.id ? (
                    <tr key={s.id}>
                      <td>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%' }} />
                      </td>
                      <td>
                        <input value={editContact} onChange={(e) => setEditContact(e.target.value)} style={{ width: '100%' }} />
                      </td>
                      <td>
                        <div className="admin-actions">
                          <button type="button" onClick={handleSaveEdit}>保存</button>
                          <button type="button" className="ghost" onClick={() => setEditingId(null)}>取消</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="muted">{s.contact || '-'}</td>
                      <td>
                        <div className="admin-actions">
                          <button type="button" className="ghost" onClick={() => startEdit(s)}>编辑</button>
                          <button type="button" className="ghost" onClick={() => handleDelete(s.id)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button type="button" className="ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
