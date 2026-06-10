import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getAccessToken, clearTokens } from '@capricorncorp/frontend-platform/api/auth'

// ── Cross-subdomain session recognition for hosting.capricorncorp.com ──
//
// Problem this fixes: a customer signed in to the shared .capricorncorp.com identity
// (Console / capricorncorp.com / any product) was NOT recognized here — the header
// always showed "Sign in / Get started". capricorncorp.com already greets them by
// name; this surface must behave identically (no discrepancy across our properties).
//
// The shared sign-in signal is the OIDC session cookie on auth.capricorncorp.com. We
// detect it the same way capricorncorp.com does: a one-time, per-tab silent
// `prompt=none` authorize. If a session exists, the IdP returns an auth code (consent
// is auto-granted for first-party clients), which we exchange SERVER-SIDE through the
// gateway (the very path the signup flow already uses) to obtain the customer's name.
// If no session exists, the IdP returns login_required and we simply render logged-out.
//
// RECOGNITION ONLY. The signup → /callback → /onboarding flow is untouched: the silent
// callback is distinguished by a dedicated `cc_silent_state` marker (see Callback.tsx),
// so a real signup never takes the silent branch.

const OIDC_URL = (import.meta as any).env?.VITE_OIDC_URL || 'https://auth.capricorncorp.com'
const GATEWAY_URL = (import.meta as any).env?.VITE_GATEWAY_URL || 'https://gateway.capricorncorp.com'
const CLIENT_ID = 'hosting-frontend'
// Where a signed-in customer goes to manage their service (Architecture C: Console is
// the operational plane; product surfaces are acquisition-only).
// ?from=hosting lets Console render a contextual "Back to Hosting" link.
const CONSOLE_URL = 'https://console.capricorncorp.com/?from=hosting#hosting'

export interface SurfaceUser { firstName?: string; lastName?: string; email?: string; id?: number | string }

interface Ctx { user: SurfaceUser | null; logout: () => void }
const AuthCtx = createContext<Ctx>({ user: null, logout: () => {} })

/** A stored profile is only trustworthy if we also hold a live access token this tab. */
function readStoredUser(): SurfaceUser | null {
  try {
    const raw = localStorage.getItem('user_profile')
    if (!raw) return null
    if (!getAccessToken()) return null
    return JSON.parse(raw)
  } catch { return null }
}

// Silent detection runs only on the marketing entry points; it must never interfere
// with the signup / onboarding / callback machinery.
function isMarketingPath(): boolean {
  const p = window.location.pathname
  return p === '/' || p === '/pricing'
}

export function SurfaceAuthProvider({ children }: { children: React.ReactNode }) {
  const [user] = useState<SurfaceUser | null>(() => readStoredUser())

  useEffect(() => {
    if (user) return                                       // already recognized this tab
    if (sessionStorage.getItem('logged_out')) return       // explicit logout — stay logged out
    if (!isMarketingPath()) return                          // don't touch signup/onboarding/callback
    if (sessionStorage.getItem('cc_silent_tried')) return   // exactly one silent attempt per tab

    // One-time silent prompt=none — identical mechanism to capricorncorp.com. A shared
    // OIDC session yields a code (→ name, via the gateway exchange in Callback.tsx);
    // no session yields login_required (→ stay logged-out). No login form is ever shown.
    try {
      const state = crypto.randomUUID()
      sessionStorage.setItem('cc_silent_state', state)
      sessionStorage.setItem('cc_silent_return', window.location.pathname + window.location.search + window.location.hash)
      sessionStorage.setItem('cc_silent_tried', '1')
      const redirectUri = encodeURIComponent(window.location.origin + '/callback')
      window.location.replace(
        `${OIDC_URL}/auth?response_type=code&client_id=${CLIENT_ID}` +
        `&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}` +
        `&scope=openid+profile+email&prompt=none`,
      )
    } catch { /* crypto/sessionStorage unavailable — stay logged-out */ }
  }, [user])

  const logout = useCallback(() => {
    try { localStorage.removeItem('user_profile') } catch { /* ignore */ }
    try { clearTokens() } catch { /* ignore */ }
    try {
      sessionStorage.setItem('logged_out', '1')
      sessionStorage.removeItem('cc_silent_tried')
      sessionStorage.removeItem('cc_silent_state')
    } catch { /* ignore */ }
    document.cookie = 'cc_session=; domain=.capricorncorp.com; path=/; secure; max-age=0; samesite=lax'
    // Best-effort clear of the HttpOnly refresh cookie, then destroy the OIDC session
    // globally so every other surface also drops to logged-out.
    const finish = () => {
      const redirect = encodeURIComponent(window.location.origin)
      window.location.replace(`${OIDC_URL}/logout?redirect=${redirect}`)
    }
    fetch(`${GATEWAY_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).then(finish, finish)
  }, [])

  return <AuthCtx.Provider value={{ user, logout }}>{children}</AuthCtx.Provider>
}

export function useSurfaceAuth() { return useContext(AuthCtx) }

// Shared right-side header nav. Signed-in customers see their name + a Console button +
// Sign out (matching capricorncorp.com); everyone else sees the original Sign in /
// Get started CTAs. `pricing` adds the Pricing link (the landing page has it; the
// pricing page itself does not).
export function HeaderNav({ primary, pricing = false }: { primary: string; pricing?: boolean }) {
  const { user, logout } = useSurfaceAuth()
  return (
    <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      {pricing && <Link to="/pricing" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Pricing</Link>}
      {user ? (
        <>
          <a href={CONSOLE_URL} className="btn-hero" style={{ padding: '9px 18px', fontSize: 15, background: primary }}>Console</a>
          <span style={{ color: '#cbd5e1', fontSize: 15, fontWeight: 600 }}>Hi, {user.firstName || 'there'}</span>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#94a3b8', fontWeight: 500, fontSize: 15, cursor: 'pointer', padding: 0 }}>Sign out</button>
        </>
      ) : (
        <>
          <Link to="/signup" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Sign in</Link>
          <Link to="/signup" className="btn-hero" style={{ padding: '9px 18px', fontSize: 15, background: primary }}>Get started</Link>
        </>
      )}
    </nav>
  )
}
