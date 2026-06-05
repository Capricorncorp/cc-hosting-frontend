import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ArrowLeft } from 'lucide-react'
import client from '@capricorncorp/frontend-platform/api/client'
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider'

interface Plan {
  id: string
  name: string
  monthlyPrice: number
  yearlyPrice?: number
  features: string[]
  popular?: boolean
}

export default function PricingPage() {
  const navigate = useNavigate()
  const { branding } = useTheme()
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
    <div style={{ minHeight: '100vh', padding: '40px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#666', marginBottom: 32 }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <h1 style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>Hosting plans</h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: 32 }}>
        Pick the plan that fits today. Upgrade anytime with no downtime.
      </p>

      {/* Billing cycle toggle */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f3f4f6', borderRadius: 8, width: 'fit-content', margin: '0 auto 48px' }}>
        {(['monthly', 'yearly'] as const).map(c => (
          <button
            key={c}
            onClick={() => setBillingCycle(c)}
            style={{
              padding: '8px 24px',
              background: billingCycle === c ? 'white' : 'transparent',
              border: 'none',
              borderRadius: 6,
              fontWeight: billingCycle === c ? 600 : 400,
              boxShadow: billingCycle === c ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {c === 'monthly' ? 'Monthly' : 'Yearly (save 20%)'}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center' }}>Loading plans from the registry...</p>}

      {!loading && plans.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: '#fef3c7', borderRadius: 12 }}>
          <p>Plans aren't loaded yet. Try refreshing, or <Link to="/signup" style={{ textDecoration: 'underline' }}>get in touch</Link>.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        {plans.map(plan => {
          const price = billingCycle === 'yearly' && plan.yearlyPrice
            ? Math.round(plan.yearlyPrice / 12)
            : plan.monthlyPrice
          return (
            <div key={plan.id} style={{
              background: 'white',
              border: `2px solid ${plan.popular ? branding?.colors?.primary || '#1e3a8a' : '#e0e0e0'}`,
              borderRadius: 12,
              padding: 32,
              position: 'relative',
            }}>
              {plan.popular && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  right: 24,
                  background: branding?.colors?.primary || '#1e3a8a',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}>POPULAR</div>
              )}
              <h3 style={{ fontSize: 24, marginBottom: 8 }}>{plan.name}</h3>
              <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 4 }}>
                ₹{price}<span style={{ fontSize: 16, color: '#666', fontWeight: 400 }}>/mo</span>
              </div>
              {billingCycle === 'yearly' && plan.yearlyPrice && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 24 }}>
                  Billed annually at ₹{plan.yearlyPrice}
                </div>
              )}
              <ul style={{ listStyle: 'none', marginBottom: 24 }}>
                {plan.features?.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <Check size={16} color="#22c55e" style={{ marginTop: 4 }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onSelect(plan.id)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: plan.popular ? branding?.colors?.primary || '#1e3a8a' : 'white',
                  color: plan.popular ? 'white' : branding?.colors?.primary || '#1e3a8a',
                  border: `2px solid ${branding?.colors?.primary || '#1e3a8a'}`,
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Get started
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
