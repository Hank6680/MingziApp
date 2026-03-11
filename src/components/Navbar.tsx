import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  ClipboardList, Warehouse, FileText, Settings, Leaf,
  LogOut, Menu, X, UserCircle,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard',      label: '仪表盘',    icon: LayoutDashboard, roles: null,                              showCart: false },
  { to: '/staff-ordering', label: '代客下单',   icon: ShoppingCart,    roles: ['staff', 'admin', 'manager'],    showCart: true  },
  { to: '/products',       label: '商品下单',   icon: Package,         roles: ['admin', 'manager'],             showCart: false },
  { to: '/orders',         label: '订单列表',   icon: FileText,        roles: null,                              showCart: false },
  { to: '/customers',      label: '客户管理',   icon: Users,           roles: ['admin', 'manager'],             showCart: false },
  { to: '/suppliers',      label: '供应商',     icon: Truck,           roles: ['admin', 'manager'],             showCart: false },
  { to: '/picking',        label: '拣货任务',   icon: ClipboardList,   roles: ['admin', 'manager'],             showCart: false },
  { to: '/inventory',      label: '库存管理',   icon: Warehouse,       roles: ['admin', 'manager'],             showCart: false },
  { to: '/reconciliation', label: '供应商对账',  icon: FileText,        roles: ['admin'],                        showCart: false },
  { to: '/settings',       label: '系统设置',   icon: Settings,        roles: ['admin'],                        showCart: false },
] as const

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { totalItems } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) return null

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(user.role as never)
  )

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      {/* Mobile hamburger - only visible on small screens via CSS */}
      <button className="sidebar-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && <div className="sidebar-overlay" onClick={closeMobile} />}

      <aside className={`app-sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Leaf size={18} />
          </div>
          <span>Mingzi Supply</span>
          <button className="sidebar-close-btn" onClick={closeMobile} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleItems.map(({ to, label, icon: Icon, showCart }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeMobile}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {showCart && totalItems > 0 && (
                <span className="nav-cart-badge">{totalItems}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <UserCircle size={20} />
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.username}</span>
              <span className="sidebar-user-role">{user.role}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} />
            <span>退出</span>
          </button>
        </div>
      </aside>
    </>
  )
}
