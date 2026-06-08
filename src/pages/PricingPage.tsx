import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ArrowLeft } from 'lucide-react'
import client from '@capricorncorp/frontend-platform/api/client'
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider'
import CapricornLogo from '../components/CapricornLogo'

interface Plan {
  id: string
  name: string
  monthlyPrice: number
  yearlyPrice?: number
  features: string[]
  popular?: boolean
}

// Registry returns `features` as an OBJECT and `monthly`/`annual` in PAISE. Normalize.
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

const HERO = '#0A1628'
const INK = '#0f172a'
const BODY = '#475569'

export default function PricingPage() {
  const navigate = useNavigate()
  const { branding } = useTheme()
  const primary = branding?.primary_color || '#2563eb'
  const name = branding?.name || 'Capricorncorp'
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    client.get('/registry/products/hosting/plans')
      .then(r => {
        setPlans(r.data?.plans || r.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const onSelect = (planId: string) => {
    sessionStorage.setItem('selected_plan', planId)
    sessionStorage.setItem('billing_cycle', billingCycle)
    navigate('/signup')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: INK }}>
      {/* ── Header (dark, branded) ───────────────────────────── */}
      <header style={{ background: HERO, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {branding?.logo_url
              ? <img src={branding.logo_url} alt={name} style={{ height: 30 }} />
              : <CapricornLogo iconSize={30} />}
            <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14, borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 12 }}>Hosting</span>
          </Link>
          <nav style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
            <a href="https://console.capricorncorp.com" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Sign in</a>
            <Link to="/signup" style={{ background: primary, color: '#fff', padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 15 }}>Get started</Link>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '48px 24px 72px' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: BODY, marginBottom: 28, fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 style={{ fontSize: 'clamp(34px, 5vw, 48px)', textAlign: 'center', fontWeight: 800, marginBottom: 14, color: INK, letterSpacing: '-0.02em' }}>Hosting plans</h1>
        <p style={{ textAlign: 'center', color: BODY, marginBottom: 32, fontSize: 17 }}>
          Pick the plan that fits today. Upgrade anytime with no downtime.
        </p>

        {/* Billing cycle toggle */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10, width: 'fit-content', margin: '0 auto 48px' }}>
          {(['monthly', 'yearly'] as const).map(c => (
            <button
              key={c}
              onClick={() => setBillingCycle(c)}
              style={{
                padding: '9px 24px',
                background: billingCycle === c ? '#fff' : 'transparent',
                color: billingCycle === c ? primary : BODY,
                border: 'none',
                borderRadius: 8,
                fontWeight: billingCycle === c ? 600 : 500,
                fontSize: 14,
                boxShadow: billingCycle === c ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {c === 'monthly' ? 'Monthly' : 'Yearly (save 20%)'}
            </button>
          ))}
        </div>

        {loading && <p style={{ textAlign: 'center', color: BODY }}>Loading plans from the registry…</p>}

        {!loading && plans.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 14, color: '#854d0e' }}>
            <p>Plans aren't loaded yet. Try refreshing, or <Link to="/signup" style={{ textDecoration: 'underline', fontWeight: 600 }}>get in touch</Link>.</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {plans.map(plan => {
            const monthlyRs = rupees((plan as any).monthly)
            const annualRs = rupees((plan as any).annual)
            const price = billingCycle === 'yearly' && annualRs ? Math.round(annualRs / 12) : monthlyRs
            return (
              <div key={plan.id} className="brand-card" style={{
                position: 'relative',
                border: `2px solid ${plan.popular ? primary : '#e6e9f0'}`,
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, right: 24, background: primary, color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>POPULAR</div>
                )}
                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: INK }}>{plan.name}</h3>
                <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 4, color: INK, letterSpacing: '-0.02em' }}>
                  ₹{price}<span style={{ fontSize: 16, color: BODY, fontWeight: 400 }}>/mo</span>
                </div>
                {billingCycle === 'yearly' && annualRs > 0 && (
                  <div style={{ fontSize: 12, color: BODY, marginBottom: 20 }}>Billed annually at ₹{annualRs}</div>
                )}
                <ul style={{ listStyle: 'none', margin: '20px 0 24px' }}>
                  {featureList(plan.features).map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, color: BODY, fontSize: 15 }}>
                      <Check size={16} color="#16a34a" style={{ marginTop: 4, flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelect(plan.id)}
                  style={{
                    width: '100%', padding: '12px',
                    background: plan.popular ? primary : 'white',
                    color: plan.popular ? 'white' : primary,
                    border: `2px solid ${primary}`,
                    borderRadius: 10, fontWeight: 600, fontSize: 15,
                  }}
                >
                  Get started
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
