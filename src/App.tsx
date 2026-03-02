import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import ProductsPage from './pages/ProductsPage'
import PickingPage from './pages/PickingPage'
import InventoryPage from './pages/InventoryPage'
import ReconciliationPage from './pages/ReconciliationPage'
import CustomersPage from './pages/CustomersPage'
import SuppliersPage from './pages/SuppliersPage'
import SettingsPage from './pages/SettingsPage'
import StaffOrderingPage from './pages/StaffOrderingPage'
import './App.css'

export default function App() {
  const { user } = useAuth()

  return (
    <div className="app-shell">
      <Navbar />
      <main>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
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
            path="/staff-ordering"
            element={
              <ProtectedRoute roles={['staff', 'admin', 'manager']}>
                <StaffOrderingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute roles={['admin', 'manager']}>
                <CustomersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute roles={['admin', 'manager']}>
                <SuppliersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picking"
            element={
              <ProtectedRoute roles={['admin', 'manager']}>
                <PickingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute roles={['admin', 'manager']}>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reconciliation"
            element={
              <ProtectedRoute roles={['admin']}>
                <ReconciliationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute roles={['admin']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
