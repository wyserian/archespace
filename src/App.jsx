/**
 * App.jsx - Root application component.
 */

import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useRouteError } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContextCore'
import { EncryptionProvider } from './context/EncryptionContext'
import { VaultPinPromptProvider } from './context/VaultPinPromptContext'
import VaultUnlockGate from './components/VaultUnlockGate'
import MfaGate from './components/MfaGate'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { useToast } from './context/ToastCore'
import { peekAuthRedirectError, clearAuthRedirectError } from './lib/authRedirectError'
import { CommandPaletteProvider } from './context/CommandPaletteContext'
import { ShortcutsProvider } from './context/ShortcutsContext'
import { PageActionsProvider } from './context/PageActionsContext'
import { useSessionTimeout } from './hooks/useSessionTimeout'
import { useRouteMeta } from './hooks/useRouteMeta'

import ErrorBoundary from './components/ErrorBoundary'
import ErrorScreen from './components/ErrorScreen'
import AppChrome from './components/layout/AppChrome'
import AppShell from './components/layout/AppShell'
import OfflineBanner from './components/OfflineBanner'
import { Spinner } from './components/ui/UI'

/**
 * React.lazy() that reloads the page once when a dynamic import fails (a
 * redeploy changed the chunk hashes). A sessionStorage flag stops reload loops.
 */
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((error) => {
      const reloaded = sessionStorage.getItem('chunk_reload')
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', '1')
        window.location.reload()
        // Return a never-resolving promise so React doesn't render while reloading
        return new Promise(() => {})
      }
      // Already retried once - surface the real error
      sessionStorage.removeItem('chunk_reload')
      throw error
    }),
  )
}

// Clear the flag on a successful page load so future deploys can retry again
sessionStorage.removeItem('chunk_reload')

const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'))
const PasswordResetPage = lazyWithRetry(() => import('./pages/PasswordResetPage'))
const HomePage = lazyWithRetry(() => import('./pages/HomePage'))
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const SpacePage = lazyWithRetry(() => import('./pages/SpacePage'))
const RecycleBinPage = lazyWithRetry(() => import('./pages/RecycleBinPage'))
const ArchivePage = lazyWithRetry(() => import('./pages/ArchivePage'))
const StarredPage = lazyWithRetry(() => import('./pages/StarredPage'))
const RemindersPage = lazyWithRetry(() => import('./pages/RemindersPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'))
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'))

const queryClient = new QueryClient({
  // Realtime subscriptions keep the cache fresh, so a refetch on every window
  // focus is redundant work (each one re-decrypts every space/item). Rely on
  // staleTime + realtime instead.
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1, refetchOnWindowFocus: false },
  },
})

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <Spinner size={24} />
    </div>
  )
}

function ProtectedRoute({ children, title }) {
  const { user, loading } = useAuth()
  useSessionTimeout()
  // App routes are private: keep them out of search results.
  useRouteMeta({ title, indexable: false })

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return (
    <MfaGate>
      <VaultUnlockGate>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </VaultUnlockGate>
    </MfaGate>
  )
}

function PublicRoute({ children, title }) {
  const { user, loading } = useAuth()
  useRouteMeta({ title, indexable: false })

  if (loading) return <PageLoader />
  if (user) return <Navigate to="/app" replace />
  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  )
}

/** Public legal pages: indexable, and viewable whether or not you're signed in. */
function LegalRoute({ children, title }) {
  useRouteMeta({ title, indexable: true })
  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  )
}

function HomeRoute() {
  const { user, loading } = useAuth()
  // The landing page is the only indexable route.
  useRouteMeta({ title: null, indexable: true })

  if (loading) return <PageLoader />
  if (user) return <Navigate to="/app" replace />
  return (
    <Suspense fallback={<PageLoader />}>
      <HomePage />
    </Suspense>
  )
}

/**
 * Show a failed email link (expired, already used) to a signed-in user as a
 * toast. Signed-out users see it inline on the login page instead.
 */
function AuthLinkErrorToast() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  useEffect(() => {
    if (loading || !user) return
    const message = peekAuthRedirectError()
    if (!message) return
    clearAuthRedirectError()
    toast.error(message)
  }, [loading, user, toast])
  return null
}

/** Shell rendered inside RouterProvider so hooks like useNavigate() work in AppChrome. */
function RootLayout() {
  return (
    <>
      <AuthLinkErrorToast />
      <OfflineBanner />
      <AppChrome />
      <Outlet />
    </>
  )
}

/** React Router error boundary - renders when a route throws (including chunk-load failures). */
function RouteErrorBoundary() {
  const error = useRouteError()
  console.error('[RouteErrorBoundary]', error)

  const isChunkError =
    error?.message?.includes('dynamically imported module') ||
    error?.message?.includes('Failed to fetch')

  return (
    <ErrorScreen
      variant={isChunkError ? 'chunk' : 'error'}
      title={isChunkError ? 'App updated - reload needed' : 'Something went wrong'}
      message={isChunkError
        ? 'A new version of ArcheSpace was deployed. Please reload to get the latest update.'
        : 'An unexpected error occurred. Try reloading the page or going back to the dashboard.'}
      errorMessage={isChunkError ? undefined : error?.message}
    />
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <PublicRoute title="Sign in"><LoginPage /></PublicRoute> },
      { path: '/signup', element: <PublicRoute title="Create account"><LoginPage /></PublicRoute> },
      // A sign-up link from the mobile app, opened where the app isn't
      // installed: the session in the link signs in here instead.
      { path: '/auth/mobile', element: <PublicRoute title="Sign in"><LoginPage /></PublicRoute> },
      { path: '/reset-password', element: <Suspense fallback={<PageLoader />}><PasswordResetPage /></Suspense> },
      { path: '/privacy', element: <LegalRoute title="Privacy Policy"><PrivacyPage /></LegalRoute> },
      { path: '/terms', element: <LegalRoute title="Terms of Service"><TermsPage /></LegalRoute> },
      { path: '/', element: <HomeRoute /> },
      {
        element: <AppShell />,
        children: [
          { path: '/app', element: <ProtectedRoute title="Your spaces"><DashboardPage /></ProtectedRoute> },
          { path: '/space/:id', element: <ProtectedRoute><SpacePage /></ProtectedRoute> },
          { path: '/recycle-bin', element: <ProtectedRoute title="Recycle bin"><RecycleBinPage /></ProtectedRoute> },
          { path: '/starred', element: <ProtectedRoute title="Starred"><StarredPage /></ProtectedRoute> },
          { path: '/reminders', element: <ProtectedRoute title="Reminders"><RemindersPage /></ProtectedRoute> },
          { path: '/archive', element: <ProtectedRoute title="Archive"><ArchivePage /></ProtectedRoute> },
          { path: '/settings', element: <ProtectedRoute title="Settings"><SettingsPage /></ProtectedRoute> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <ShortcutsProvider>
              <CommandPaletteProvider>
                <PageActionsProvider>
                  <AuthProvider>
                    <EncryptionProvider>
                      <VaultPinPromptProvider>
                        <RouterProvider router={router} />
                      </VaultPinPromptProvider>
                    </EncryptionProvider>
                  </AuthProvider>
                </PageActionsProvider>
              </CommandPaletteProvider>
            </ShortcutsProvider>
          </QueryClientProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
