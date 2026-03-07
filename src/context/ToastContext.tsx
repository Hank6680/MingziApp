import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  text: string
}

interface ToastContextValue {
  showToast: (type: ToastType, text: string) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const showToast = useCallback((type: ToastType, text: string) => {
    const id = ++counter.current
    setToasts((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxWidth: 360,
            width: 'calc(100vw - 2rem)',
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                lineHeight: 1.4,
                animation: 'toast-in 0.22s ease',
                background:
                  t.type === 'success' ? '#f0fdf4' :
                  t.type === 'error'   ? '#fef2f2' : '#eff6ff',
                border:
                  t.type === 'success' ? '1px solid #bbf7d0' :
                  t.type === 'error'   ? '1px solid #fecaca' : '1px solid #bfdbfe',
                color:
                  t.type === 'success' ? '#166534' :
                  t.type === 'error'   ? '#991b1b' : '#1e40af',
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>
                {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
              </span>
              <span style={{ flex: 1 }}>{t.text}</span>
              <span style={{ opacity: 0.4, fontSize: '0.8rem', flexShrink: 0 }}>×</span>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </ToastContext.Provider>
  )
}
