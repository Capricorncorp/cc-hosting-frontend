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

export default function LandingPage() {
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

  useEffect(() => {
    client.get('/registry/products/hosting/plans')
      .then(r => { setPlans(r.data?.plans || r.data || []); setLoading(false) })
      .catch(() => { setPlans([]); setLoading(false) })
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
    <div style={{ minHeight: '100vh', background: b.dark, color: '#f1f5f9' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(10,22,40,0.72)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${b.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '15px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {b.logo && b.logo !== '/logo.svg' ? <img src={b.logo} alt={b.name} style={{ height: 30 }} /> : <CapricornLogo iconSize={30} />}
            <span style={{ color: b.textDim, fontWeight: 600, fontSize: 14, borderLeft: `1px solid ${b.border}`, paddingLeft: 12 }}>Hosting</span>
          </Link>
          <nav style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
            <Link to="/pricing" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Pricing</Link>
            <Link to="/signup" style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 15 }}>Sign in</Link>
            <Link to="/signup" className="btn-hero" style={{ padding: '9px 18px', fontSize: 15, background: b.primary }}>Get started</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{
        position: 'relative', overflow: 'hidden', textAlign: 'center', padding: '96px 24px 104px',
        backgroundImage: 'linear-gradient(rgba(96,165,250,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.05) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }}>
        <div className="cc-glow" style={{ width: 520, height: 520, top: -180, left: -120, background: 'radial-gradient(circle, rgba(59,130,246,0.55), transparent 70%)' }} />
        <div className="cc-glow" style={{ width: 440, height: 440, bottom: -200, right: -110, background: 'radial-gradient(circle, rgba(139,92,246,0.45), transparent 70%)', animationDelay: '4s' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
          <span className="brand-pill cc-rise">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#22d3ee', display: 'inline-block' }} />
            Trusted by 500+ businesses · 99.9% uptime SLA
          </span>
          <h1 className="cc-rise" style={{ fontSize: 'clamp(40px, 6.4vw, 66px)', fontWeight: 800, lineHeight: 1.06, margin: '24px 0 20px', letterSpacing: '-0.025em', animationDelay: '0.08s' }}>
            Reliable shared hosting,<br /><span className="gradient-text">built for India.</span>
          </h1>
          <p className="cc-rise" style={{ fontSize: 19, color: b.textDim, maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.6, animationDelay: '0.16s' }}>
            Free SSL, unlimited subdomains, 1-click WordPress, and a 99.9% uptime SLA. Plans from ₹99/mo. No surprises.
          </p>
          <div className="cc-rise" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '0.24s' }}>
            <Link to="/pricing" className="btn-hero" style={{ background: b.primary }}>See plans <ArrowRight size={17} /></Link>
            <a href="#features" className="btn-hero-outline">Explore features</a>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" style={{ padding: '72px 24px', maxWidth: 1140, margin: '0 auto' }}>
        <p className="brand-label cc-rise">Why Capricorncorp</p>
        <h2 className="cc-rise" style={{ fontSize: 'clamp(28px,4vw,38px)', textAlign: 'center', fontWeight: 800, margin: '8px 0 48px', letterSpacing: '-0.01em', animationDelay: '0.05s' }}>Everything you need</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22 }}>
          {features.map((f, i) => (
            <div key={i} className="cc-card cc-rise" style={{ animationDelay: `${0.06 * i}s` }}>
              <span className="cc-shine" />
              <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <f.icon size={24} color="#60a5fa" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>{f.title}</h3>
              <p style={{ color: b.textDim, lineHeight: 1.6, fontSize: 15 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Plan preview ─────────────────────────────────────── */}
      <section style={{ padding: '64px 24px 88px', maxWidth: 1140, margin: '0 auto' }}>
        <p className="brand-label">Pricing</p>
        <h2 style={{ fontSize: 'clamp(28px,4vw,38px)', textAlign: 'center', fontWeight: 800, margin: '8px 0 8px', letterSpacing: '-0.01em' }}>Simple pricing</h2>
        <p style={{ textAlign: 'center', color: b.textDim, marginBottom: 44 }}>
          {loading ? 'Loading plans…' : `${plans.length} plans available. ${plans.length === 0 ? '' : 'Pick what fits.'}`}
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch' }}>
          {plans.slice(0, 3).map((plan, i) => (
            <div key={plan.id} className="cc-card cc-rise" style={{
              flex: '1 1 290px', maxWidth: 360, animationDelay: `${0.08 * i}s`,
              border: `1px solid ${plan.popular ? '#8b5cf6' : b.border}`,
              boxShadow: plan.popular ? '0 0 44px -12px rgba(139,92,246,0.55)' : undefined,
            }}>
              <span className="cc-shine" />
              {plan.popular && (
                <div style={{ position: 'absolute', top: -11, right: 22, background: 'linear-gradient(180deg,#a78bfa,#8b5cf6)', color: '#fff', padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', boxShadow: '0 6px 16px -4px rgba(139,92,246,0.7)' }}>POPULAR</div>
              )}
              <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: '#f1f5f9' }}>{plan.name}</h3>
              <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 20, color: '#fff', letterSpacing: '-0.03em' }}>
                <span style={{ color: b.primary }}>₹{rupees((plan as any).monthly)}</span>
                <span style={{ fontSize: 15, color: b.textDim, fontWeight: 500 }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', marginBottom: 24 }}>
                {featureList(plan.features).slice(0, 5).map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, color: '#cbd5e1', fontSize: 15 }}>
                    <Check size={16} color="#34d399" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('/signup')} className="btn-hero" style={{
                width: '100%',
                background: plan.popular ? 'linear-gradient(180deg,#3b82f6,#2563eb)' : 'transparent',
                border: plan.popular ? 'none' : `1px solid ${b.primary}`,
                color: plan.popular ? '#fff' : '#93c5fd',
                boxShadow: plan.popular ? undefined : 'none',
              }}>
                {plan.cta || 'Get started'}
              </button>
            </div>
          ))}
        </div>
        {plans.length > 3 && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to="/pricing" style={{ color: '#60a5fa', fontWeight: 600 }}>See all {plans.length} plans →</Link>
          </div>
        )}
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${b.border}`, padding: '44px 24px', color: b.textDim }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><CapricornLogo iconSize={28} /></div>
          <p style={{ fontSize: 14 }}>
            © {new Date().getFullYear()} {b.name} ·{' '}
            <a href="https://console.capricorncorp.com" style={{ color: '#cbd5e1' }}>Console</a> ·{' '}
            <a href="https://capricorncorp.com" style={{ color: '#cbd5e1' }}>Main site</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
