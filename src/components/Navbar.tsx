import { Link, useNavigate } from 'react-router-dom'
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
            <Link to="/products">商品下单</Link>
            <Link to="/orders">订单列表</Link>
            {user.role === 'admin' && (
              <>
                <Link to="/picking">拣货任务</Link>
                <Link to="/inventory">库存管理</Link>
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
        <Link to="/login">登录</Link>
      )}
    </header>
  )
}
