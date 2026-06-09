// Wave 96 P0 fix — OIDC callback handler for hosting.capricorncorp.com
//
// Prior to this page, SignupRedirect sent redirect_uri=/onboarding to OIDC.
// OIDC rejects that with `invalid_redirect_uri` because the registered client
// only allowed `/callback`. The QC walkthrough flagged this as a P0 production
// failure (see docs/qc-bundle-2026-06-05/walkthrough/CUSTOMER-ONBOARDING-WALKTHROUGH.md
// step 6).
//
// This page handles `/callback?code=...&state=...`:
//   1. Read code + state from the URL.
//   2. POST to gateway /auth/oidc-token with code + redirect_uri=/callback.
//      The gateway exchanges the code with OIDC Provider server-to-server
//      (using the hosting-frontend client secret) and sets the refresh_token
//      HttpOnly cookie on .capricorncorp.com.
//   3. Restore the cart context from sessionStorage so the user lands at
//      /onboarding with the plan they had selected before signup.
//   4. Navigate to /onboarding via react-router.
//
// On any failure, navigate to / with an error message stashed for the
// landing page to display.
//
// IMPORTANT: redirect_uri sent to the gateway MUST match what was sent to
// `/auth` — both must be `/callback`. The gateway forwards that value
// verbatim to OIDC.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider'
import { setAccessToken } from '@capricorncorp/frontend-platform/api/auth'

const GATEWAY_URL =
  (import.meta as any).env?.VITE_GATEWAY_URL || 'https://gateway.capricorncorp.com'

// The redirect_uri MUST match what SignupRedirect sent to OIDC's /auth.
// Hard-coded to /callback (not window.location.origin + '/callback') so a
// stale tab on a different origin can't drift the value.
const REDIRECT_URI =
  typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'https://hosting.capricorncorp.com/callback'

export default function Callback() {
  const navigate = useNavigate()
  const { branding } = useTheme()
  const [error, setError] = useState<string | null>(null)
  // StrictMode mounts effects twice in dev; guard so we don't double-exchange
  // the one-time-use authorization code.
  const exchangedRef = useRef(false)

  useEffect(() => {
    if (exchangedRef.current) return
    exchangedRef.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const oidcError = params.get('error')
    const oidcErrorDesc = params.get('error_description')
    const returnedState = params.get('state')

    if (oidcError) {
      setError(`Sign-in failed: ${oidcErrorDesc || oidcError}`)
      try { sessionStorage.setItem('hosting_oidc_error', oidcErrorDesc || oidcError) } catch {}
      window.setTimeout(() => navigate('/', { replace: true }), 1500)
      return
    }

    if (!code) {
      setError('No authorization code in callback URL.')
      window.setTimeout(() => navigate('/', { replace: true }), 1500)
      return
    }

    // CSRF defense — compare the state we stashed in SignupRedirect with the
    // one OIDC echoed back. Mismatch means someone tried to feed us a
    // foreign authorization code; refuse to exchange.
    try {
      const expectedState = sessionStorage.getItem('oauth_state')
      if (expectedState && returnedState && expectedState !== returnedState) {
        setError('Sign-in state did not match. Please try again.')
        window.setTimeout(() => navigate('/', { replace: true }), 1500)
        return
      }
      // One-time-use: clear it now so a replay can't reuse the same state.
      sessionStorage.removeItem('oauth_state')
    } catch { /* sessionStorage unavailable — proceed without CSRF check */ }

    // Read cart context BEFORE the token exchange so we can restore it on
    // either success or fallback paths.
    let selectedPlan: string | null = null
    try {
      selectedPlan = sessionStorage.getItem('selected_plan')
    } catch { /* sessionStorage unavailable */ }

    ;(async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/auth/oidc-token`, {
          method: 'POST',
          credentials: 'include', // refresh_token cookie is set on the response
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
        })

        if (!res.ok) {
          let msg = 'Token exchange failed.'
          try {
            const body = await res.json()
            if (body?.message) msg = body.message
          } catch { /* non-json error body */ }
          setError(msg)
          try { sessionStorage.setItem('hosting_oidc_error', msg) } catch {}
          window.setTimeout(() => navigate('/', { replace: true }), 1500)
          return
        }

        const data = await res.json()
        if (data?.access_token) {
          setAccessToken(data.access_token, data.expires_in || 900)
        }
        if (data?.user) {
          try { localStorage.setItem('user_profile', JSON.stringify(data.user)) } catch {}
        }

        // W129: do NOT resurface a stale `hosting_onboarding_txn` here. In the
        // normal flow the order/txn is created AFTER login (at checkout), so any
        // txn lingering at sign-in is a leftover from a prior abandoned attempt;
        // propagating it made a plain "Sign in" resume a dead, unpaid order and
        // spin "Connecting to provisioning…" forever. A real payment return comes
        // back via the gateway redirect (/onboarding?txn=...), not through here.
        const dest = '/onboarding'

        // Make sure the wizard sees the plan the user picked before signup.
        if (selectedPlan) {
          try { sessionStorage.setItem('selected_plan', selectedPlan) } catch {}
        }

        // Clear ?code/?state from the URL bar before the route change.
        window.history.replaceState({}, '', '/callback')
        navigate(dest, { replace: true })
      } catch (err: any) {
        const msg = err?.message || 'Unexpected sign-in error.'
        setError(msg)
        try { sessionStorage.setItem('hosting_oidc_error', msg) } catch {}
        window.setTimeout(() => navigate('/', { replace: true }), 1500)
      }
    })()
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: branding?.surface_dark || '#0a1628',
      color: branding?.text_primary || '#fff',
      padding: 16,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 12, letterSpacing: 4, color: '#64748b', marginBottom: 16 }}>
          CAPRICORNCORP
        </div>
        {error ? (
          <>
            <h2 style={{ color: '#f87171', fontSize: 20, marginBottom: 12 }}>Sign-in error</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 12 }}>{error}</p>
            <p style={{ color: '#64748b', fontSize: 12 }}>Returning you to the start…</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 16, marginBottom: 6 }}>Finishing sign-in…</p>
            <p style={{ color: '#64748b', fontSize: 12 }}>Restoring your cart and taking you to onboarding.</p>
          </>
        )}
      </div>
    </div>
  )
}
