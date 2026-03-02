import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, getOrders, getProducts } from '../api/client'
import type { DashboardAlert, DashboardTrend, TripSummary } from '../api/client'
import type { Order, Product } from '../types'
import { formatMoney } from '../utils/money'

export default function DashboardPage() {
  const { token, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [stats, setStats] = useState({
    totalProducts: 0,
    availableProducts: 0,
    lowStockProducts: 0,
    todayOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
  })
  const [trends, setTrends] = useState<DashboardTrend[]>([])
  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [tripSummary, setTripSummary] = useState<TripSummary[]>([])

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadStats = async () => {
      if (!token) return
      try {
        setLoading(true)
        if (isAdmin) {
          const data = await getDashboardStats(token)
          setStats(data.stats)
          setTrends(data.trends)
          setAlerts(data.alerts)
          setTripSummary(data.tripSummary)
        } else {
          // Fallback for non-admin
          const productsData = await getProducts({ limit: 1000, offset: 0 }, token)
          const products: Product[] = productsData.items || []
          const orders: Order[] = await getOrders(token)
          setStats({
            totalProducts: products.length,
            availableProducts: products.filter((p) => p.isAvailable).length,
            lowStockProducts: products.filter((p) => (p.stock || 0) < 10).length,
            todayOrders: orders.filter((o) => o.createdAt?.startsWith(new Date().toISOString().split('T')[0])).length,
            pendingOrders: orders.filter((o) => o.status === 'created' || o.status === 'confirmed').length,
            totalRevenue: Math.round(
              orders
                .filter((o) => o.status === 'completed')
                .reduce((sum, order) => {
                  const t = (order.items || []).reduce(
                    (s, item) => s + (Number(item.qtyOrdered) || 0) * Number(item.unitPrice ?? item.productPrice ?? 0),
                    0
                  )
                  return sum + t
                }, 0) * 100
            ) / 100,
          })
        }
      } catch (err) {
        console.error('Failed to load dashboard stats:', err)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [token, isAdmin])

  const maxOrders = Math.max(...trends.map((t) => t.orders), 1)

  return (
    <div className="page-content">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>仪表盘</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            欢迎回来，{user?.username || '用户'}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {currentTime.toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
        </div>
      </div>

      {loading ? (
        <p>加载中…</p>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="dash-stats-grid">
            <StatCard title="产品总数" value={stats.totalProducts} sub={`可用: ${stats.availableProducts}`} color="blue" link="/products" />
            <StatCard title="低库存预警" value={stats.lowStockProducts} sub="库存 < 10" color={stats.lowStockProducts > 0 ? 'red' : 'green'} link={isAdmin ? '/inventory' : undefined} />
            <StatCard title="今日订单" value={stats.todayOrders} sub={`待处理: ${stats.pendingOrders}`} color="purple" link="/orders" />
            <StatCard title="待处理订单" value={stats.pendingOrders} sub="需确认/发货" color="yellow" link="/orders" />
            <StatCard title="总营收" value={formatMoney(stats.totalRevenue)} sub="已完成订单" color="green" />
            <div className="dash-card">
              <h3 className="dash-card-title">快捷操作</h3>
              <div className="dash-quicklinks">
                <Link to="/products" className="dash-quicklink">下新订单</Link>
                <Link to="/orders" className="dash-quicklink">查看订单</Link>
                {isAdmin && <Link to="/inventory" className="dash-quicklink">货品入库</Link>}
                {isAdmin && <Link to="/suppliers" className="dash-quicklink">供应商管理</Link>}
              </div>
            </div>
          </div>

          {/* Alerts Panel */}
          {isAdmin && alerts.length > 0 && (
            <div className="dash-alerts">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>待办提醒</h2>
              {alerts.map((alert, idx) => (
                <div key={idx} className={`dash-alert dash-alert-${alert.level}`}>
                  <strong>{alert.title}</strong>
                  {alert.type === 'low_stock' && alert.items && (
                    <div className="dash-alert-items">
                      {alert.items.map((item) => (
                        <span key={item.id} className="dash-alert-tag">
                          {item.name}（{item.stock} {item.unit}）
                        </span>
                      ))}
                    </div>
                  )}
                  {alert.type === 'pending_review' && (
                    <Link to="/orders" className="dash-alert-link">去处理</Link>
                  )}
                  {alert.type === 'pending_invoices' && (
                    <Link to="/reconciliation" className="dash-alert-link">去对账</Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Trends */}
          {isAdmin && trends.length > 0 && (
            <div className="dash-section">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>近 7 天订单趋势</h2>
              <div className="dash-chart">
                {trends.map((t) => (
                  <div key={t.day} className="dash-chart-bar-wrap">
                    <div className="dash-chart-value">{t.orders}</div>
                    <div
                      className="dash-chart-bar"
                      style={{ height: `${Math.max((t.orders / maxOrders) * 120, 4)}px` }}
                      title={`${t.day}: ${t.orders} 单，${formatMoney(t.revenue)}`}
                    />
                    <div className="dash-chart-label">{t.day.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trip Summary */}
          {isAdmin && tripSummary.length > 0 && (
            <div className="dash-section">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>当前车次进度</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>车次</th>
                      <th>订单数</th>
                      <th>拣货进度</th>
                      <th>完成率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripSummary.map((trip) => {
                      const pct = trip.totalItems > 0 ? Math.round((trip.pickedItems / trip.totalItems) * 100) : 0
                      return (
                        <tr key={trip.tripNumber}>
                          <td><strong>{trip.tripNumber}</strong></td>
                          <td>{trip.orderCount}</td>
                          <td>
                            <div className="dash-progress">
                              <div className="dash-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td>{trip.pickedItems}/{trip.totalItems} ({pct}%)</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  sub: string
  color: 'blue' | 'red' | 'green' | 'yellow' | 'purple'
  link?: string
}

function StatCard({ title, value, sub, color, link }: StatCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'var(--color-primary)',
    red: 'var(--color-danger)',
    green: '#059669',
    yellow: '#d97706',
    purple: '#7c3aed',
  }
  const content = (
    <div className="dash-card">
      <p className="dash-card-title">{title}</p>
      <p className="dash-card-value" style={{ color: colorMap[color] }}>{value}</p>
      <p className="dash-card-sub">{sub}</p>
    </div>
  )
  if (link) {
    return <Link to={link} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</Link>
  }
  return content
}
