import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ArrowLeft } from 'lucide-react'
import client from '@capricorncorp/frontend-platform/api/client'
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider'
import CapricornLogo from '../components/CapricornLogo'
import { HeaderNav } from '../auth/SurfaceAuth'

interface Plan {
  id: string
  name: string
  monthlyPrice: number
  yearlyPrice?: number
  features: string[]
  popular?: boolean
}

function featureList(features: any): string[] {
  if (Array.isArray(features)) return features.map(String)
  if (features && typeof features === 'object') {
    return Object.entries(features)
      .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
        return v === true ? label : `${label}: ${v}`
      })
  }
  return []
}
function rupees(paise: any): number {
  return typeof paise === 'number' ? Math.round(paise / 100) : 0
}

export default function PricingPage() {
  const navigate = useNavigate()
  const { branding } = useTheme()
  const b = {
    primary: branding?.primary_color || '#3b82f6',
    dark: branding?.surface_dark || '#0a1628',
    border: branding?.border_color || '#2d3f5e',
    textDim: branding?.text_secondary || '#94a3b8',
    name: branding?.name || 'Capricorncorp',
    logo: (branding as any)?.logo_url as string | undefined,
  }
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    client.get('/registry/products/hosting/plans')
      .then(r => { setPlans(r.data?.plans || r.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const onSelect = (planId: string) => {
    sessionStorage.setItem('selected_plan', planId)
    sessionStorage.setItem('billing_cycle', billingCycle)
    navigate('/signup')
  }

  return (
    <div style={{ minHeight: '100vh', background: b.dark, color: '#f1f5f9' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(10,22,40,0.72)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${b.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '15px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {b.logo && b.logo !== '/logo.svg' ? <img src={b.logo} alt={b.name} style={{ height: 30 }} /> : <CapricornLogo iconSize={30} />}
            <span style={{ color: b.textDim, fontWeight: 600, fontSize: 14, borderLeft: `1px solid ${b.border}`, paddingLeft: 12 }}>Hosting</span>
          </Link>
          <HeaderNav primary={b.primary} />
        </div>
      </header>

      {/* glow accents */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="cc-glow" style={{ width: 520, height: 520, top: -240, left: '50%', marginLeft: -260, background: 'radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1140, margin: '0 auto', padding: '56px 24px 88px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: b.textDim, marginBottom: 26, fontWeight: 500 }}>
            <ArrowLeft size={16} /> Back
          </Link>

          <h1 className="cc-rise" style={{ fontSize: 'clamp(34px, 5vw, 50px)', textAlign: 'center', fontWeight: 800, marginBottom: 14, letterSpacing: '-0.025em' }}>
            Hosting <span className="gradient-text">plans</span>
          </h1>
          <p className="cc-rise" style={{ textAlign: 'center', color: b.textDim, marginBottom: 30, fontSize: 17, animationDelay: '0.07s' }}>
            Pick the plan that fits today. Upgrade anytime with no downtime.
          </p>

          {/* Billing cycle toggle */}
          <div className="cc-rise" style={{ display: 'flex', justifyContent: 'center', marginBottom: 48, animationDelay: '0.12s' }}>
            <div className="cc-toggle">
              {(['monthly', 'yearly'] as const).map(c => (
                <button key={c} className={billingCycle === c ? 'on' : ''} onClick={() => setBillingCycle(c)}>
                  {c === 'monthly' ? 'Monthly' : <>Yearly <span style={{ color: billingCycle === c ? '#bbf7d0' : '#34d399', fontSize: 12 }}>Save 20%</span></>}
                </button>
              ))}
            </div>
          </div>

          {loading && <p style={{ textAlign: 'center', color: b.textDim }}>Loading plans from the registry…</p>}

          {!loading && plans.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 14, color: '#fcd34d' }}>
              <p>Plans aren't loaded yet. Try refreshing, or <Link to="/signup" style={{ textDecoration: 'underline', fontWeight: 600 }}>get in touch</Link>.</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 24, alignItems: 'stretch' }}>
            {plans.map((plan, i) => {
              const monthlyRs = rupees((plan as any).monthly)
              const annualRs = rupees((plan as any).annual)
              const price = billingCycle === 'yearly' && annualRs ? Math.round(annualRs / 12) : monthlyRs
              return (
                <div key={plan.id} className="cc-card cc-rise" style={{
                  animationDelay: `${0.07 * i}s`,
                  border: `1px solid ${plan.popular ? '#8b5cf6' : b.border}`,
                  boxShadow: plan.popular ? '0 0 44px -12px rgba(139,92,246,0.55)' : undefined,
                }}>
                  <span className="cc-shine" />
                  {plan.popular && (
                    <div style={{ position: 'absolute', top: -11, right: 22, background: 'linear-gradient(180deg,#a78bfa,#8b5cf6)', color: '#fff', padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', boxShadow: '0 6px 16px -4px rgba(139,92,246,0.7)' }}>POPULAR</div>
                  )}
                  <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: '#f1f5f9' }}>{plan.name}</h3>
                  <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 2, color: '#fff', letterSpacing: '-0.03em' }}>
                    <span style={{ color: b.primary }}>₹{price}</span><span style={{ fontSize: 15, color: b.textDim, fontWeight: 500 }}>/mo</span>
                  </div>
                  {billingCycle === 'yearly' && annualRs > 0 && (
                    <div style={{ fontSize: 12, color: b.textDim, marginBottom: 18 }}>Billed annually at ₹{annualRs}</div>
                  )}
                  <ul style={{ listStyle: 'none', margin: '20px 0 24px' }}>
                    {featureList(plan.features).map((f, j) => (
                      <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 11, color: '#cbd5e1', fontSize: 15 }}>
                        <Check size={16} color="#34d399" style={{ marginTop: 4, flexShrink: 0 }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => onSelect(plan.id)} className="btn-hero" style={{
                    width: '100%',
                    background: plan.popular ? 'linear-gradient(180deg,#3b82f6,#2563eb)' : 'transparent',
                    border: plan.popular ? 'none' : `1px solid ${b.primary}`,
                    color: plan.popular ? '#fff' : '#93c5fd',
                    boxShadow: plan.popular ? undefined : 'none',
                  }}>
                    Get started
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
