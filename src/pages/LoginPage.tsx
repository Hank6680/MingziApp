import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Leaf } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('demo')
  const [password, setPassword] = useState('demo123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate('/products')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      {/* Left decorative panel */}
      <div className="login-panel-left">
        <div className="login-panel-text">
          <h2>鲜货直达，<br />省心配送</h2>
          <p>专为华人食材分销商打造的<br />数字化订货与仓储管理平台</p>
          <div className="login-panel-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-panel-right">
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div className="login-brand">
            <div className="login-brand-icon">
              <Leaf size={24} />
            </div>
            <h1>Mingzi Supply</h1>
            <p>食材配送订货平台</p>
          </div>
          <form onSubmit={handleSubmit} className="form">
            <label>
              用户名
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? '登录中…' : '登录'}
            </button>
            <p className="hint">普通用户：demo/demo123 · 管理员：admin/admin123</p>
          </form>
        </div>
      </div>
    </div>
  )
}
