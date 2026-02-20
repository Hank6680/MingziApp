import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import ProductsPage from './pages/ProductsPage'
import PickingPage from './pages/PickingPage'
import './App.css'

export default function App() {
  const { user } = useAuth()

  return (
    <div className="app-shell">
      <Navbar />
      <main>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/products" replace /> : <LoginPage />} />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picking"
            element={
              <ProtectedRoute roles={['admin']}>
                <PickingPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to={user ? '/products' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
