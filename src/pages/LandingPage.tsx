import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Server, Globe, Shield, Zap, Database, Headphones, Check, ArrowRight } from 'lucide-react'
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
  cta?: string
}

// Registry returns `features` as an OBJECT and `monthly` price in PAISE. Normalize both.
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

export default function LandingPage() {
  const navigate = useNavigate()
  const { branding } = useTheme()
  const primary = branding?.primary_color || '#2563eb'
  const name = branding?.name || 'Capricorncorp'
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

  const features = [
    { icon: Globe, title: 'Free SSL', desc: "Let's Encrypt + auto-renew. HTTPS on every domain." },
    { icon: Shield, title: 'DDoS protection', desc: 'Always-on mitigation at the edge.' },
    { icon: Zap, title: 'LiteSpeed cache', desc: 'Sub-100ms TTFB on cached pages.' },
    { icon: Database, title: 'Daily backups', desc: 'JetBackup-grade snapshots, 30-day retention.' },
    { icon: Server, title: '1-click WordPress', desc: 'Plus 200+ apps via the installer.' },
    { icon: Headphones, title: 'Real human support', desc: 'India-based, 24/7, WhatsApp + email.' },
  ]

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
            <Link to="/pricing" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Pricing</Link>
            <a href="https://console.capricorncorp.com" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Sign in</a>
            <Link to="/signup" style={{ background: primary, color: '#fff', padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 15 }}>Get started</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero (dark navy + grid + gradient) ───────────────── */}
      <section className="hero-grid" style={{ color: '#fff', padding: '88px 24px 96px', textAlign: 'center' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <span className="brand-pill">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#22d3ee', display: 'inline-block' }} />
            Trusted by 500+ businesses · 99.9% uptime SLA
          </span>
          <h1 style={{ fontSize: 'clamp(38px, 6vw, 60px)', fontWeight: 800, lineHeight: 1.08, margin: '24px 0 20px', letterSpacing: '-0.02em' }}>
            Reliable shared hosting,<br />
            <span className="gradient-text">built for India.</span>
          </h1>
          <p style={{ fontSize: 19, color: '#94a3b8', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Free SSL, unlimited subdomains, 1-click WordPress, and a 99.9% uptime SLA.
            Plans from ₹99/mo. No surprises.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/pricing" className="btn-hero" style={{ background: primary }}>See plans <ArrowRight size={17} /></Link>
            <a href="#features" className="btn-hero-outline">Explore features</a>
          </div>
        </div>
      </section>

      {/* ── Features (light) ─────────────────────────────────── */}
      <section id="features" style={{ padding: '76px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <p className="brand-label">Why Capricorncorp</p>
          <h2 style={{ fontSize: 34, textAlign: 'center', fontWeight: 800, margin: '8px 0 48px', color: INK, letterSpacing: '-0.01em' }}>Everything you need</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {features.map((f, i) => (
              <div key={i} className="brand-card">
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(37,99,235,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <f.icon size={24} color={primary} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: INK }}>{f.title}</h3>
                <p style={{ color: BODY, lineHeight: 1.6, fontSize: 15 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plan preview (light) ─────────────────────────────── */}
      <section style={{ padding: '76px 24px', background: '#f8fafc', borderTop: '1px solid #eef2f7', borderBottom: '1px solid #eef2f7' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <p className="brand-label">Pricing</p>
          <h2 style={{ fontSize: 34, textAlign: 'center', fontWeight: 800, margin: '8px 0 8px', color: INK, letterSpacing: '-0.01em' }}>Simple pricing</h2>
          <p style={{ textAlign: 'center', color: BODY, marginBottom: 48 }}>
            {loading ? 'Loading plans…' : `${plans.length} plans available. ${plans.length === 0 ? '' : 'Pick what fits.'}`}
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {plans.slice(0, 3).map(plan => (
              <div key={plan.id} className="brand-card" style={{
                flex: '1 1 280px',
                maxWidth: 360,
                position: 'relative',
                border: `2px solid ${plan.popular ? primary : '#e6e9f0'}`,
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, right: 24, background: primary, color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>POPULAR</div>
                )}
                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: INK }}>{plan.name}</h3>
                <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 20, color: INK, letterSpacing: '-0.02em' }}>
                  ₹{rupees((plan as any).monthly)}<span style={{ fontSize: 16, color: BODY, fontWeight: 400 }}>/mo</span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: 24 }}>
                  {featureList(plan.features).slice(0, 5).map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, color: BODY, fontSize: 15 }}>
                      <Check size={16} color="#16a34a" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/signup')}
                  style={{
                    width: '100%', padding: '12px',
                    background: plan.popular ? primary : 'white',
                    color: plan.popular ? 'white' : primary,
                    border: `2px solid ${primary}`,
                    borderRadius: 10, fontWeight: 600, fontSize: 15,
                  }}
                >
                  {plan.cta || 'Get started'}
                </button>
              </div>
            ))}
          </div>
          {plans.length > 3 && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link to="/pricing" style={{ color: primary, fontWeight: 600 }}>See all {plans.length} plans →</Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer (dark, branded) ───────────────────────────── */}
      <footer style={{ background: HERO, color: '#94a3b8', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><CapricornLogo iconSize={28} /></div>
          <p style={{ fontSize: 14 }}>
            © {new Date().getFullYear()} {name} ·{' '}
            <a href="https://console.capricorncorp.com" style={{ color: '#cbd5e1' }}>Console</a> ·{' '}
            <a href="https://capricorncorp.com" style={{ color: '#cbd5e1' }}>Main site</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
