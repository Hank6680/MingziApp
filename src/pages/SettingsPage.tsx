import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAuditLogs, getDbInfo, getPriceHistory } from '../api/client'
import type { AuditLogEntry, PriceHistoryEntry } from '../api/client'
import { formatMoney } from '../utils/money'

type TabKey = 'dbinfo' | 'pricehistory' | 'auditlog'

export default function SettingsPage() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('dbinfo')
  const [message, setMessage] = useState<string | null>(null)

  // DB info
  const [dbInfo, setDbInfo] = useState<Record<string, number> | null>(null)
  const [dbLoading, setDbLoading] = useState(false)

  // Price history
  const [priceProductId, setPriceProductId] = useState('')
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([])
  const [priceProductName, setPriceProductName] = useState('')
  const [priceLoading, setPriceLoading] = useState(false)

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const loadDbInfo = async () => {
    if (!token) return
    try {
      setDbLoading(true)
      const data = await getDbInfo(token)
      setDbInfo(data.tables)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDbLoading(false)
    }
  }

  const loadPriceHistory = async () => {
    if (!token || !priceProductId) return
    try {
      setPriceLoading(true)
      setMessage(null)
      const data = await getPriceHistory(Number(priceProductId), token)
      setPriceHistory(data.items)
      setPriceProductName(data.product.name)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setPriceLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    if (!token) return
    try {
      setAuditLoading(true)
      const data = await getAuditLogs({ limit: 100 }, token)
      setAuditLogs(data.items)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'dbinfo') loadDbInfo()
    if (activeTab === 'auditlog') loadAuditLogs()
  }, [activeTab, token])

  return (
    <div className="page-content">
      <div className="page-banner">
        <div className="page-banner-left">
          <h1>系统设置</h1>
          <p>数据库信息、价格历史、操作日志</p>
        </div>
      </div>
      {message && <p className="hint">{message}</p>}

      <div className="tab-bar">
        {([
          { key: 'dbinfo' as TabKey, label: '数据库概况' },
          { key: 'pricehistory' as TabKey, label: '价格历史' },
          { key: 'auditlog' as TabKey, label: '操作日志' },
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

      {activeTab === 'dbinfo' && (
        <div className="dash-section">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>数据表统计</h2>
          {dbLoading ? (
            <p>加载中…</p>
          ) : dbInfo ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>表名</th>
                    <th>记录数</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dbInfo).map(([table, count]) => (
                    <tr key={table}>
                      <td><strong>{table}</strong></td>
                      <td>{count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">无数据</p>
          )}
          <button type="button" className="ghost" onClick={loadDbInfo} style={{ marginTop: '1rem' }}>
            刷新
          </button>
        </div>
      )}

      {activeTab === 'pricehistory' && (
        <div className="dash-section">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>商品价格变动历史</h2>
          <div className="filters" style={{ marginBottom: '1rem' }}>
            <input
              type="number"
              placeholder="输入商品ID"
              value={priceProductId}
              onChange={(e) => setPriceProductId(e.target.value)}
              style={{ width: 140 }}
            />
            <button type="button" onClick={loadPriceHistory} disabled={priceLoading || !priceProductId}>
              {priceLoading ? '查询中…' : '查询'}
            </button>
          </div>
          {priceProductName && (
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>{priceProductName}</strong> 的价格变动记录：
            </p>
          )}
          {priceHistory.length > 0 ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>原价</th>
                    <th>新价</th>
                    <th>变动</th>
                    <th>操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((h) => {
                    const diff = h.oldPrice != null ? h.newPrice - h.oldPrice : null
                    return (
                      <tr key={h.id}>
                        <td>{new Date(h.changedAt).toLocaleString()}</td>
                        <td>{h.oldPrice != null ? formatMoney(h.oldPrice) : '-'}</td>
                        <td>{formatMoney(h.newPrice)}</td>
                        <td>
                          {diff != null && (
                            <span style={{ color: diff > 0 ? '#059669' : diff < 0 ? 'var(--color-danger)' : 'inherit', fontWeight: 600 }}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td>{h.changedBy || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : priceProductName ? (
            <p className="muted">暂无价格变动记录</p>
          ) : null}
        </div>
      )}

      {activeTab === 'auditlog' && (
        <div className="dash-section">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>操作日志</h2>
          {auditLoading ? (
            <p>加载中…</p>
          ) : auditLogs.length > 0 ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作</th>
                    <th>对象</th>
                    <th>详情</th>
                    <th>操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>{log.action}</td>
                      <td>{log.entity} {log.entityId ? `#${log.entityId}` : ''}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.detail || '-'}</td>
                      <td>{log.username || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">暂无操作日志（价格变更后将自动记录）</p>
          )}
          <button type="button" className="ghost" onClick={loadAuditLogs} style={{ marginTop: '1rem' }}>
            刷新
          </button>
        </div>
      )}
    </div>
  )
}
