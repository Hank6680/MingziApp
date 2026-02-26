import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="app-header">
      <div className="brand">Mingzi Supply</div>
      <nav>
        {user && (
          <>
            <NavLink to="/products">商品下单</NavLink>
            <NavLink to="/orders">订单列表</NavLink>
            {user.role === 'admin' && (
              <>
                <NavLink to="/picking">拣货任务</NavLink>
                <NavLink to="/inventory">库存管理</NavLink>
                <NavLink to="/reconciliation">供应商对账</NavLink>
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
