import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { totalItems } = useCart()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="app-header">
      <div className="brand">Mingzi Supply</div>

      <button
        className="hamburger-btn"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      <nav className={menuOpen ? 'nav-links-open' : 'nav-links'}>
        {user && (
          <>
            <NavLink to="/dashboard" onClick={closeMenu}>仪表盘</NavLink>
            {(user.role === 'staff' || user.role === 'admin' || user.role === 'manager') && (
              <NavLink to="/staff-ordering" onClick={closeMenu}>
                代客下单
                {totalItems > 0 && <span className="nav-cart-badge">{totalItems}</span>}
              </NavLink>
            )}
            {user.role !== 'staff' && <NavLink to="/products" onClick={closeMenu}>商品下单</NavLink>}
            <NavLink to="/orders" onClick={closeMenu}>订单列表</NavLink>
            {(user.role === 'admin' || user.role === 'manager') && (
              <>
                <NavLink to="/customers" onClick={closeMenu}>客户管理</NavLink>
                <NavLink to="/suppliers" onClick={closeMenu}>供应商</NavLink>
                <NavLink to="/picking" onClick={closeMenu}>拣货任务</NavLink>
                <NavLink to="/inventory" onClick={closeMenu}>库存管理</NavLink>
              </>
            )}
            {user.role === 'admin' && (
              <>
                <NavLink to="/reconciliation" onClick={closeMenu}>供应商对账</NavLink>
                <NavLink to="/settings" onClick={closeMenu}>系统设置</NavLink>
              </>
            )}
          </>
        )}
      </nav>

      {user ? (
        <div className="user-box">
          <span>{user.username}</span>
          <button onClick={handleLogout}>退出</button>
        </div>
      ) : (
        <NavLink to="/login">登录</NavLink>
      )}
    </header>
  )
}
