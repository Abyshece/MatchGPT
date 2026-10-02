// ============================================================================
// useToast
//
// Minimal toast notifications. Provider goes near the root (above
// AuthProvider is fine). Hook returns { showToast }.
//
// Usage:
//   const { showToast } = useToast();
//   showToast('Saved', 'success');
//   showToast('Couldn't save: ...', 'error');
// ============================================================================

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, variant }]);
    // auto-dismiss after 3s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

// ----------------------------------------------------------------------------
// Viewport (the floating toast container, top-right)
// ----------------------------------------------------------------------------

const ToastViewport: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div
    className="fixed right-4 z-[1000] flex flex-col gap-2 pointer-events-none"
    style={{ top: 'calc(1rem + var(--safe-top))' }}  // below an iPhone's notch (index.css)
  >
    {toasts.map((t) => (
      <div
        key={t.id}
        className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in pointer-events-auto border ${
          t.variant === 'success'
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800'
            : t.variant === 'error'
            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800'
            : 'bg-gray-50 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-zinc-700'
        }`}
      >
        {t.variant === 'success' && <span className="mr-2">✓</span>}
        {t.variant === 'error' && <span className="mr-2">✕</span>}
        {t.message}
      </div>
    ))}
  </div>
);
