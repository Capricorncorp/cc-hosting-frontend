import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Server, Globe, Shield, Zap, Database, Headphones, Check, ArrowRight } from 'lucide-react'
import client from '@capricorncorp/frontend-platform/api/client'
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider'

interface Plan {
  id: string
  name: string
  monthlyPrice: number
  yearlyPrice?: number
  features: string[]
  popular?: boolean
  cta?: string
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { branding } = useTheme()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/registry/products/hosting/plans')
      .then(r => {
        setPlans(r.data?.plans || r.data || [])
        setLoading(false)
      })
      .catch(() => {
        setPlans([])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: branding?.colors?.background || '#fafafa' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${branding?.colors?.border || '#e0e0e0'}`,
        background: 'white',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 20 }}>
          <Server color={branding?.colors?.primary || '#1e3a8a'} />
          <span>{branding?.name || 'Capricorncorp'} Hosting</span>
        </Link>
        <nav style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Link to="/pricing">Pricing</Link>
          <a href="https://console.capricorncorp.com" style={{ color: '#666' }}>Sign in</a>
          <Link to="/signup" style={{
            background: branding?.colors?.primary || '#1e3a8a',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 6,
          }}>Get started</Link>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ padding: '80px 40px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, marginBottom: 24 }}>
          Reliable shared hosting<br />
          built for India.
        </h1>
        <p style={{ fontSize: 20, color: '#666', maxWidth: 700, margin: '0 auto 32px' }}>
          Free SSL, unlimited subdomains, 1-click WordPress, and a 99.9% uptime SLA.
          Plans from ₹99/mo. No surprises.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link to="/pricing" style={{
            background: branding?.colors?.primary || '#1e3a8a',
            color: 'white',
            padding: '14px 28px',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}>
            See plans <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section style={{ padding: '60px 40px', background: 'white' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, textAlign: 'center', marginBottom: 48 }}>Everything you need</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
            {[
              { icon: Globe, title: 'Free SSL', desc: 'Let\'s Encrypt + auto-renew. HTTPS on every domain.' },
              { icon: Shield, title: 'DDoS protection', desc: 'Always-on mitigation at the edge.' },
              { icon: Zap, title: 'LiteSpeed cache', desc: 'Sub-100ms TTFB on cached pages.' },
              { icon: Database, title: 'Daily backups', desc: 'JetBackup-grade snapshots, 30-day retention.' },
              { icon: Server, title: '1-click WordPress', desc: 'Plus 200+ apps via the installer.' },
              { icon: Headphones, title: 'Real human support', desc: 'India-based, 24/7, WhatsApp + email.' },
            ].map((f, i) => (
              <div key={i} style={{ padding: 24 }}>
                <f.icon size={32} color={branding?.colors?.primary || '#1e3a8a'} />
                <h3 style={{ fontSize: 20, margin: '16px 0 8px' }}>{f.title}</h3>
                <p style={{ color: '#666' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plan preview ─────────────────────────────────────── */}
      <section style={{ padding: '60px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, textAlign: 'center', marginBottom: 16 }}>Simple pricing</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 48 }}>
          {loading ? 'Loading plans...' : `${plans.length} plans available. ${plans.length === 0 ? '' : 'Pick what fits.'}`}
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {plans.slice(0, 3).map(plan => (
            <div key={plan.id} style={{
              flex: '1 1 280px',
              maxWidth: 360,
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
              <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 24 }}>
                ₹{plan.monthlyPrice}<span style={{ fontSize: 16, color: '#666', fontWeight: 400 }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', marginBottom: 24 }}>
                {plan.features?.slice(0, 5).map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Check size={16} color="#22c55e" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
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
                {plan.cta || 'Get started'}
              </button>
            </div>
          ))}
        </div>
        {plans.length > 3 && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to="/pricing">See all {plans.length} plans →</Link>
          </div>
        )}
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{
        padding: '40px',
        borderTop: '1px solid #e0e0e0',
        textAlign: 'center',
        color: '#666',
      }}>
        © {new Date().getFullYear()} {branding?.name || 'Capricorncorp'} · <a href="https://console.capricorncorp.com">Console</a> · <a href="https://capricorncorp.com">Main site</a>
      </footer>
    </div>
  )
}
