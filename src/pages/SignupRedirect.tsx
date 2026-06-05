import { useEffect } from 'react'

// Wave 96 P0 fix — redirect_uri now points at /callback (not /onboarding).
// /callback handles the OIDC token exchange via the Gateway, restores the
// cart from sessionStorage, then navigates to /onboarding. The OIDC client
// `hosting-frontend` is registered with /callback (the canonical target)
// and /onboarding (legacy alias) as valid redirect_uris.
//
// Pre-fix, this sent /onboarding directly, which OIDC rejected with
// invalid_redirect_uri because /onboarding was never registered. See
// docs/qc-bundle-2026-06-05/walkthrough/CUSTOMER-ONBOARDING-WALKTHROUGH.md
// step 6 for the QC trace.

export default function SignupRedirect() {
  useEffect(() => {
    const clientId = 'hosting-frontend'
    // redirect_uri MUST match what the OIDC client is registered with AND
    // what Callback.tsx will send to the gateway on the second leg of the
    // exchange. Keeping it absolute (window.location.origin) means localhost
    // dev and prod both work without env wiring.
    const callbackUrl = `${window.location.origin}/callback`
    const redirectUri = encodeURIComponent(callbackUrl)
    // Stash the raw state value; the URLSearchParams that Callback.tsx
    // reads decodes it back to this same raw value, so the equality check
    // in Callback works without us hand-rolling decode logic.
    const rawState = crypto.randomUUID()
    const state = encodeURIComponent(rawState)
    try { sessionStorage.setItem('oauth_state', rawState) } catch {}
    window.location.href =
      `https://auth.capricorncorp.com/auth?response_type=code&` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `state=${state}&scope=openid+profile+email`
  }, [])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p>Redirecting to sign in...</p>
        <p style={{ color: '#666', marginTop: 8 }}>If you're not redirected, <a href="https://auth.capricorncorp.com/auth">click here</a>.</p>
      </div>
    </div>
  )
}
