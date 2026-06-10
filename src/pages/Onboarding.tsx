// Hosting Onboarding Wizard
//
// REWRITTEN 2026-05-28: real backend state polling, no setTimeout fakes.
// Frontend reads /api/onboarding/<merchantTransId>/status which is backed
// by the ProvisioningJob + ProvisioningStep tables and updated by the
// Provisioning Worker (CC_Provisioning_Worker/src/index.js). See
// /docs/project-memory.md §17 for the state model.
//
// Six customer-visible states (StatusChip) — no more "all green checks
// after 3 seconds regardless of CWP reality."

import { useState, useEffect, useRef } from 'react';
import { Globe, Check, ArrowRight, ArrowLeft, AlertTriangle,
  Sparkles, Mail, ShieldCheck, ExternalLink, BookOpen } from 'lucide-react';
import client from '@capricorncorp/frontend-platform/api/client';
import { useTheme } from '@capricorncorp/frontend-platform/theme/ThemeProvider';
import { StatusChip, stepStateToChipState } from '@capricorncorp/frontend-platform/components/StatusChip';
import { safeRedirect } from '@capricorncorp/frontend-platform/lib/safeRedirect';

// Wave 51: same RFC-1035-ish shape Account Service validates against. Keep in
// sync; the backend has the authoritative copy.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

interface DomainProbe {
  looksRegistered: boolean;
  looksTaken: boolean;
  pointsToCC: boolean;
  mailFlowsToCC: boolean;
  existingNs: string[];
  existingA: string[];
  existingMx: { host: string; priority: number | null }[];
  ourNs: string[];
  ourMxHost: string;
}

interface Plan {
  id: string;
  name: string;
  monthly: number;
  annual: number;
  popular?: boolean;
  trial?: boolean;
  features: Record<string, any>;
  limits: Record<string, any>;
}

interface OnboardingStep {
  name: string;
  ordinal: number;
  state: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped';
  reason?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
}

interface OnboardingStatus {
  merchantTransId: string;
  product: string;
  plan: string;
  domain: string | null;
  state: 'pending' | 'retrying' | 'propagating' | 'action_required' | 'succeeded' | 'failed';
  reason: string | null;
  expected_resolution: string | null;
  attempts: number;
  max_attempts: number;
  started_at: string | null;
  finished_at: string | null;
  next_check_at: string | null;
  steps: OnboardingStep[];
}

const STEP_LABELS: Record<string, string> = {
  create_account: 'Create hosting account',
  configure_dns: 'Configure DNS zone',
  install_ssl: 'Install SSL certificate',
  create_admin_email: 'Create admin mailbox',
  write_db_record: 'Finalize account record',
};

function featureList(f: Record<string, any>): string[] {
  if (Array.isArray(f)) return f;
  if (!f || typeof f !== 'object') return [];
  const labels: string[] = [];
  if (f.sites != null) labels.push(f.sites === 'Unlimited' ? 'Unlimited Sites' : `${f.sites} Site${f.sites === 1 ? '' : 's'}`);
  if (f.ssdGb != null) labels.push(f.ssdGb === 'Unlimited' ? 'Unlimited SSD Storage' : `${f.ssdGb} GB SSD`);
  if (f.bandwidthGb != null) labels.push(f.bandwidthGb === 'Unlimited' ? 'Unlimited Bandwidth' : `${f.bandwidthGb} GB Bandwidth`);
  if (f.databases != null) labels.push(f.databases === 'Unlimited' ? 'Unlimited Databases' : `${f.databases} Database${f.databases === 1 ? '' : 's'}`);
  if (f.emailAccounts != null) labels.push(f.emailAccounts === 'Unlimited' ? 'Unlimited Email' : `${f.emailAccounts} Email Account${f.emailAccounts === 1 ? '' : 's'}`);
  if (f.backups) labels.push(`${f.backups.charAt(0).toUpperCase() + f.backups.slice(1)} Backups`);
  return labels;
}

const POLL_INTERVAL_MS = 3000;
// W129: consecutive "no provisioning job" (404) polls to tolerate at step 4
// before concluding the order was never paid (covers the webhook→job gap on a
// fresh payment, ~18s) instead of spinning "Connecting…" forever.
const NO_JOB_GRACE_POLLS = 6;
// W131: payment-recipient identity on the checkout step (mirrors SMS Ocean's
// CompanyInfoBadge). PRESENTATION ONLY — broker dynamic QR + reconciliation +
// auto-provisioning unchanged. Legal name is a config constant (broker exposes no
// merchant field via API). PAYMENT_MERCHANT_UPI stays empty until the settlement
// VPA is confirmed against the broker; the UPI line renders only when set.
const PAYMENT_MERCHANT_BRAND = 'Capricorncorp';
const PAYMENT_MERCHANT_LEGAL_NAME = 'MOONSHOT AI PRIVATE LIMITED';
const PAYMENT_MERCHANT_UPI = 'moonshot4086@fbl'; // operator-confirmed settlement VPA (2026-06-10)

// Phase 4a §22.34 — onComplete is fallback for legacy callers. The new
// hosting.capricorncorp.com surface doesn't pass it; instead the goTab
// helper above does an absolute redirect to console.capricorncorp.com
// for ongoing management.
export default function Onboarding({ onComplete }: { onComplete?: () => void } = {}) {
  const { branding } = useTheme();
  const [step, setStep] = useState(1); // 1=plan, 2=domain, 3=payment, 4=provisioning
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gstPercent, setGstPercent] = useState(18);
  const [merchantTransId, setMerchantTransId] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const pollTimer = useRef<number | null>(null);
  // W129: tell "waiting for the job to appear" apart from "no paid order behind
  // this txn" so step 4 renders honestly instead of a perpetual fake spinner.
  const [provisioningPhase, setProvisioningPhase] = useState<'waiting' | 'no_payment'>('waiting');
  const noJobPolls = useRef(0);
  const [resumeChecked, setResumeChecked] = useState(false);

  // Wave 51: domain probe state. Triggered when the customer pauses typing in
  // step 2; surfaces "your domain currently points to X" warnings BEFORE
  // payment so they understand the consequence of pointing nameservers to us.
  const [probe, setProbe] = useState<DomainProbe | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState('');
  const probeDebounce = useRef<number | null>(null);
  const [acknowledgedExisting, setAcknowledgedExisting] = useState(false);

  function isValidDomain(d: string): boolean {
    return DOMAIN_RE.test(d.toLowerCase());
  }

  // Debounced probe when domain changes in step 2.
  useEffect(() => {
    if (step !== 2) return;
    if (probeDebounce.current) window.clearTimeout(probeDebounce.current);
    setProbe(null);
    setProbeError('');
    setAcknowledgedExisting(false);
    if (!isValidDomain(domain)) return;
    probeDebounce.current = window.setTimeout(async () => {
      setProbeLoading(true);
      try {
        const { data } = await client.get(`/dns/probe/${encodeURIComponent(domain)}`);
        setProbe(data as DomainProbe);
      } catch (err: any) {
        setProbeError(err.response?.data?.message || 'Could not check this domain right now.');
      } finally {
        setProbeLoading(false);
      }
    }, 600);
    return () => {
      if (probeDebounce.current) window.clearTimeout(probeDebounce.current);
    };
  }, [domain, step]);

  useEffect(() => {
    client.get('/registry/products/hosting/plans')
      .then(res => {
        setPlans(res.data.plans || []);
        setGstPercent(res.data.gstPercent || 18);
      })
      .catch(() => {});
  }, []);

  // Poll real backend state when in provisioning step
  useEffect(() => {
    if (step !== 4 || !merchantTransId) return;

    let cancelled = false;
    noJobPolls.current = 0;
    setProvisioningPhase('waiting');

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data } = await client.get(`/onboarding/${merchantTransId}/status`);
        if (cancelled) return;
        if (data?.job) {
          noJobPolls.current = 0;
          setStatus(data.job);
          // Keep polling unless we've reached a terminal state
          if (data.job.state === 'succeeded' || data.job.state === 'failed') {
            return; // stop polling
          }
        }
      } catch (e: any) {
        // W129: 404 = no provisioning job for this txn (no completed payment).
        // Tolerate a short grace window (the webhook→job gap on a fresh payment),
        // then show an honest "no payment" state instead of spinning forever —
        // which is what a stale, unpaid txn resumed on a bare sign-in used to do.
        if (e?.response?.status === 404) {
          noJobPolls.current += 1;
          if (noJobPolls.current >= NO_JOB_GRACE_POLLS) {
            if (!cancelled) setProvisioningPhase('no_payment');
            return; // stop polling — nothing to provision
          }
        }
      }
      pollTimer.current = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [step, merchantTransId]);

  const currentPlan = plans.find(p => p.id === selectedPlan);
  const baseAmount = currentPlan ? (period === 'annual' ? currentPlan.annual : currentPlan.monthly) : 0;
  const tax = Math.round(baseAmount * gstPercent / 100);
  const total = baseAmount + tax;

  async function handleCheckout() {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post('/billing/orders', {
        product: 'hosting',
        plan: selectedPlan,
        period,
        domain,
      });
      if (data.trial || data.devMode) {
        setMerchantTransId(data.merchantTransId);
        // Persist so a REFRESH on the Setup step resumes here. Trial/dev orders have
        // no payment redirect, so this sessionStorage write is the only thing that
        // survives a reload — without it a refresh dropped the customer back to step 1.
        try { sessionStorage.setItem('hosting_onboarding_txn', data.merchantTransId); } catch {}
        setStep(4); // Provisioning step — real polling starts via useEffect
      } else if (data.paymentUrl) {
        // Persist the txnId so the post-PhonePe redirect can resume
        if (data.merchantTransId) {
          try { sessionStorage.setItem('hosting_onboarding_txn', data.merchantTransId); } catch {}
        }
        // Wave 38: allowlist-validate the PhonePe payment URL — even though
        // Billing Service is trusted, if it's compromised we don't ship
        // customers off to an attacker's payment page.
        // W125f hotfix: PhonePe V2 returns a rotating checkout host
        // (mercury-t2.phonepe.com) not yet in the shared safeRedirect allowlist
        // (platform 1.1.1 blocked on Verdaccio auth). PhonePe owns *.phonepe.com,
        // so trust it here for the payment hop ONLY; all else still goes through
        // safeRedirect.
        let payHost = '';
        try { payHost = new URL(data.paymentUrl).host.toLowerCase(); } catch { /* fall through */ }
        // W130: the Capricorncorp Payments Broker returns its hosted payment page
        // on a FIRST-PARTY host (app.capricorncorp.com). Trust *.capricorncorp.com
        // for the payment hop too (same basis as PhonePe); every other host still
        // routes through safeRedirect. (Fixes "host-not-allowlisted:app.capricorncorp.com".)
        if (payHost === 'phonepe.com' || payHost.endsWith('.phonepe.com')
            || payHost === 'capricorncorp.com' || payHost.endsWith('.capricorncorp.com')) {
          window.location.href = data.paymentUrl;
          return;
        }
        const ok = safeRedirect(data.paymentUrl, {
          onUnsafe: (reason) => {
            setError(`We could not start your payment securely (${reason}). Please contact support.`);
          },
        });
        if (!ok) { setLoading(false); return; }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
    }
    setLoading(false);
  }

  // Resume after payment redirect — W129 hardening.
  // A bare "Sign in" used to land here carrying a STALE `hosting_onboarding_txn`
  // (Callback propagated it) and jumped straight to step 4 → "Connecting to
  // provisioning…" forever. Now an explicit ?txn= (the real payment-gateway
  // redirect) resumes step 4 with the poll's grace guard; a sessionStorage-only
  // txn is validated first and resumed only if it has a real provisioning job,
  // else cleared so sign-in lands on a clean, usable step 1.
  useEffect(() => {
    if (step !== 1 || merchantTransId || resumeChecked) return;
    let cancelled = false;
    (async () => {
      let urlTxn: string | null = null;
      let ssTxn: string | null = null;
      try {
        urlTxn = new URLSearchParams(window.location.search).get('txn');
        ssTxn = sessionStorage.getItem('hosting_onboarding_txn');
      } catch { /* sessionStorage unavailable */ }

      // Explicit ?txn= = the real payment-gateway redirect. Resume step 4 immediately
      // (the job may not exist for a few seconds after a fresh payment — the poll's
      // grace guard covers that gap). PERSIST it so a later refresh — by which point
      // the URL param may be gone — still resumes instead of dropping to step 1.
      if (urlTxn) {
        try { sessionStorage.setItem('hosting_onboarding_txn', urlTxn); } catch { /* noop */ }
        if (!cancelled) { setMerchantTransId(urlTxn); setStep(4); setResumeChecked(true); }
        return;
      }
      if (!ssTxn) { if (!cancelled) setResumeChecked(true); return; }

      // sessionStorage-only txn — a legit in-progress order (the refresh case) OR a
      // stale leftover from an abandoned attempt. Confirm a real job exists before
      // resuming. CRITICAL: only a DEFINITIVE "no job" (job-less 200, or 404) clears
      // it; a transient/network error must NOT discard the txn — doing so stranded a
      // legitimate order back at step 1 on every refresh (the reported bug). On a
      // transient error we resume step 4 and let the poll render the real state.
      try {
        const { data } = await client.get(`/onboarding/${ssTxn}/status`);
        if (cancelled) return;
        if (data?.job) { setMerchantTransId(ssTxn); setStep(4); }
        else { try { sessionStorage.removeItem('hosting_onboarding_txn'); } catch { /* noop */ } }
      } catch (e: any) {
        if (e?.response?.status === 404) {
          try { sessionStorage.removeItem('hosting_onboarding_txn'); } catch { /* noop */ }
        } else if (!cancelled) {
          setMerchantTransId(ssTxn); setStep(4);
        }
      } finally {
        if (!cancelled) setResumeChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [step, merchantTransId, resumeChecked]);

  const cardStyle = {
    background: branding.surface_card,
    borderRadius: 16,
    padding: 24,
    border: `1px solid ${branding.border_color}`,
  };

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 'clamp(20px, 3.5vw, 24px)', fontWeight: 800, color: branding.text_primary, marginBottom: 4 }}>Get Started with Hosting</h1>
      <p style={{ color: branding.text_muted, fontSize: 14, marginBottom: 32 }}>Choose a plan, add your domain, and launch in minutes</p>

      {/* Progress Steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        {['Select Plan', 'Domain', 'Payment', 'Setup'].map((label, i) => (
          <div key={label} style={{ flex: '1 1 70px', textAlign: 'center', minWidth: 60 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', margin: '0 auto 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step > i + 1 ? '#10b981' : step === i + 1 ? branding.primary_color : '#1e293b',
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}>
              {step > i + 1 ? <Check size={14} /> : i + 1}
            </div>
            <div style={{ color: step === i + 1 ? branding.text_primary : '#475569', fontSize: 11, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#451a1a', color: '#f87171', padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Step 1: Plan Selection */}
      {step === 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 4, display: 'flex', gap: 2 }}>
              <button onClick={() => setPeriod('monthly')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: period === 'monthly' ? branding.primary_color : 'transparent', color: branding.text_primary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Monthly</button>
              <button onClick={() => setPeriod('annual')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: period === 'annual' ? branding.primary_color : 'transparent', color: branding.text_primary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annual <span style={{ color: '#34d399', fontSize: 11 }}>Save 15%+</span></button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {plans.map(plan => (
              <div key={plan.id} onClick={() => setSelectedPlan(plan.id)} style={{
                ...cardStyle,
                cursor: 'pointer',
                border: selectedPlan === plan.id ? `2px solid ${branding.primary_color}` : plan.popular ? '2px solid #8b5cf6' : `1px solid ${branding.border_color}`,
                position: 'relative',
              }}>
                {plan.popular && <div style={{ position: 'absolute', top: -10, right: 16, background: '#8b5cf6', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>POPULAR</div>}
                {plan.trial && <div style={{ position: 'absolute', top: -10, left: 16, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>7-DAY FREE TRIAL</div>}
                <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>{plan.name}</h3>
                <div style={{ color: branding.primary_color, fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                  {'₹'}{((period === 'annual' ? plan.annual : plan.monthly) / 100).toFixed(0)}
                  <span style={{ fontSize: 13, color: branding.text_muted, fontWeight: 400 }}>/{period === 'annual' ? 'yr' : 'mo'}</span>
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>+ {gstPercent}% GST</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {featureList(plan.features).map(f => (
                    <li key={f} style={{ color: branding.text_secondary, fontSize: 13, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={12} color="#10b981" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <button disabled={!selectedPlan} onClick={() => setStep(2)} style={{
              padding: '12px 28px', background: selectedPlan ? branding.primary_color : '#1e293b', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: selectedPlan ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Domain */}
      {step === 2 && (
        <div style={cardStyle}>
          <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Add Your Domain</h3>
          <p style={{ color: branding.text_muted, fontSize: 13, marginBottom: 20 }}>
            Enter the domain you want to host. We'll check whether it's already in use elsewhere so you know what to expect when you point its nameservers.
          </p>
          <div style={{ position: 'relative' }}>
            <Globe size={16} color={branding.text_muted} style={{ position: 'absolute', left: 14, top: 14 }} />
            <input
              type="text" placeholder="e.g. example.com" value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase().trim())}
              style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: 10, border: `1px solid ${branding.border_color}`, background: branding.surface_input, color: '#fff', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          {/* Wave 51: shape validation hint */}
          {domain && !isValidDomain(domain) && (
            <div style={{ color: '#f59e0b', fontSize: 12, marginTop: 8 }}>
              Use the format example.com (no http://, no trailing dot, no path).
            </div>
          )}

          {/* Wave 51: probe states */}
          {probeLoading && (
            <div style={{ color: branding.text_muted, fontSize: 12, marginTop: 12 }}>
              Checking this domain…
            </div>
          )}
          {probeError && (
            <div style={{ color: '#f59e0b', fontSize: 12, marginTop: 12 }}>
              {probeError}
            </div>
          )}

          {probe && !probeLoading && (
            <>
              {/* Case A: domain not registered / not active anywhere */}
              {!probe.looksTaken && (
                <div style={{ background: '#0a2e1a', border: '1px solid #064e3b', borderRadius: 10, padding: 14, marginTop: 14, fontSize: 13, color: '#34d399' }}>
                  <strong>This domain doesn't appear to be active yet.</strong>
                  <div style={{ color: branding.text_muted, fontSize: 12, marginTop: 4 }}>
                    Make sure you've registered it with a domain registrar first. After we set up your hosting, you'll point its nameservers here.
                  </div>
                </div>
              )}

              {/* Case B: already points to us */}
              {probe.pointsToCC && (
                <div style={{ background: '#0a2e1a', border: '1px solid #064e3b', borderRadius: 10, padding: 14, marginTop: 14, fontSize: 13, color: '#34d399' }}>
                  <strong>This domain already points to our nameservers.</strong>
                  <div style={{ color: branding.text_muted, fontSize: 12, marginTop: 4 }}>
                    No nameserver change needed — provisioning will activate immediately.
                  </div>
                </div>
              )}

              {/* Case C: points elsewhere — the important warning */}
              {probe.looksTaken && !probe.pointsToCC && (
                <div style={{ background: '#451a03', border: '1px solid #92400e', borderRadius: 10, padding: 14, marginTop: 14, fontSize: 13, color: '#fcd34d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}>
                    <AlertTriangle size={16} /> This domain is currently active elsewhere
                  </div>
                  {/* Wave 61: wordBreak so long monospace hostnames wrap on narrow viewports. */}
                  {probe.existingNs.length > 0 && (
                    <div style={{ color: branding.text_muted, fontSize: 12, marginBottom: 6, wordBreak: 'break-all' }}>
                      Current nameservers: <span style={{ color: branding.text_primary, fontFamily: 'monospace' }}>{probe.existingNs.join(', ')}</span>
                    </div>
                  )}
                  {probe.existingA.length > 0 && (
                    <div style={{ color: branding.text_muted, fontSize: 12, marginBottom: 6, wordBreak: 'break-all' }}>
                      Current IP: <span style={{ color: branding.text_primary, fontFamily: 'monospace' }}>{probe.existingA.join(', ')}</span>
                    </div>
                  )}
                  {probe.existingMx.length > 0 && (
                    <div style={{ color: branding.text_muted, fontSize: 12, marginBottom: 6, wordBreak: 'break-all' }}>
                      Current mail flow: <span style={{ color: branding.text_primary, fontFamily: 'monospace' }}>{probe.existingMx.map(m => m.host).join(', ')}</span>
                    </div>
                  )}
                  <div style={{ color: branding.text_muted, fontSize: 12, marginTop: 8 }}>
                    When you update the nameservers to ours, your current website and email at this domain will stop working until DNS propagates (typically within 4 hours). Make sure you have a plan to migrate.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: branding.text_primary, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={acknowledgedExisting}
                      onChange={e => setAcknowledgedExisting(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    I understand this will replace my current hosting/email for this domain
                  </label>
                </div>
              )}
            </>
          )}

          <div style={{ background: '#0f2340', borderRadius: 10, padding: 16, marginTop: 16 }}>
            <div style={{ color: branding.text_muted, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AFTER SETUP, POINT YOUR NAMESERVERS TO:</div>
            <div style={{ color: branding.text_primary, fontSize: 14, fontFamily: 'monospace' }}>{probe?.ourNs?.[0] || 'ns1.capricorncorphosting.com'}</div>
            <div style={{ color: branding.text_primary, fontSize: 14, fontFamily: 'monospace' }}>{probe?.ourNs?.[1] || 'ns2.capricorncorphosting.com'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setStep(1)} style={{ padding: '12px 24px', background: '#1e293b', color: branding.text_secondary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              disabled={!isValidDomain(domain) || (probe?.looksTaken && !probe.pointsToCC && !acknowledgedExisting)}
              onClick={() => setStep(3)}
              title={
                !isValidDomain(domain) ? 'Enter a valid domain' :
                (probe?.looksTaken && !probe.pointsToCC && !acknowledgedExisting) ? 'Please acknowledge the existing-domain warning to continue' :
                ''
              }
              style={{
                padding: '12px 28px',
                background: (isValidDomain(domain) && (!probe?.looksTaken || probe.pointsToCC || acknowledgedExisting))
                  ? branding.primary_color : '#1e293b',
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: (isValidDomain(domain) && (!probe?.looksTaken || probe.pointsToCC || acknowledgedExisting)) ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Payment Summary */}
      {step === 3 && (
        <div style={cardStyle}>
          <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Order Summary</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${branding.border_color}` }}>
            <span style={{ color: branding.text_secondary, fontSize: 14 }}>Plan</span>
            <span style={{ color: branding.text_primary, fontSize: 14, fontWeight: 600 }}>{currentPlan?.name} ({period})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${branding.border_color}` }}>
            <span style={{ color: branding.text_secondary, fontSize: 14 }}>Domain</span>
            <span style={{ color: branding.text_primary, fontSize: 14, fontWeight: 600 }}>{domain}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${branding.border_color}` }}>
            <span style={{ color: branding.text_secondary, fontSize: 14 }}>Subtotal</span>
            <span style={{ color: branding.text_primary, fontSize: 14 }}>{'₹'}{(baseAmount / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${branding.border_color}` }}>
            <span style={{ color: branding.text_secondary, fontSize: 14 }}>GST ({gstPercent}%)</span>
            <span style={{ color: branding.text_primary, fontSize: 14 }}>{'₹'}{(tax / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}>
            <span style={{ color: branding.text_primary, fontSize: 16, fontWeight: 700 }}>Total</span>
            <span style={{ color: branding.primary_color, fontSize: 20, fontWeight: 800 }}>{'₹'}{(total / 100).toFixed(2)}</span>
          </div>
          {currentPlan?.trial && period === 'monthly' && (
            <div style={{ background: '#064e3b', color: '#34d399', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
              7-day free trial — no payment required today
            </div>
          )}
          {/* W131: payment-recipient trust block — presentation only; dynamic QR + reconciliation unchanged */}
          <div style={{ marginTop: 6, padding: '12px 14px', background: 'rgba(52,211,153,0.06)', border: `1px solid ${branding.border_color}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <ShieldCheck size={15} style={{ color: '#34d399' }} />
              <span style={{ color: branding.text_primary, fontSize: 13, fontWeight: 700 }}>Secure payment</span>
            </div>
            <p style={{ color: branding.text_secondary, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
              You&rsquo;re paying <strong style={{ color: branding.text_primary }}>{PAYMENT_MERCHANT_LEGAL_NAME}</strong>{PAYMENT_MERCHANT_BRAND ? ` (${PAYMENT_MERCHANT_BRAND})` : ''} via UPI through the Capricorncorp Payments Broker.{PAYMENT_MERCHANT_UPI ? <> UPI ID <strong style={{ color: branding.text_primary }}>{PAYMENT_MERCHANT_UPI}</strong>.</> : null} You&rsquo;ll see and confirm the recipient in your UPI app before approving.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setStep(2)} style={{ padding: '12px 24px', background: '#1e293b', color: branding.text_secondary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={handleCheckout} disabled={loading} style={{
              padding: '12px 32px', background: branding.primary_color, color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Processing…' : currentPlan?.trial && period === 'monthly' ? 'Start Free Trial' : `Pay ${'₹'}${(total / 100).toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Real-state Provisioning */}
      {step === 4 && (
        <ProvisioningView
          status={status}
          phase={provisioningPhase}
          domain={domain || status?.domain || ''}
          branding={branding}
          onComplete={onComplete}
          onStartOver={() => {
            try { sessionStorage.removeItem('hosting_onboarding_txn'); } catch { /* noop */ }
            try { window.history.replaceState({}, '', '/onboarding'); } catch { /* noop */ }
            setMerchantTransId(null);
            setStatus(null);
            setProvisioningPhase('waiting');
            setResumeChecked(true);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}

// ─── Provisioning view ────────────────────────────────────────────────────────
// Reads REAL state from the polled status. No setTimeout, no fake checks.
// Renders:
//   - Overall state chip (succeeded / pending / propagating / action_required / failed / retrying)
//   - Plain-language reason from backend
//   - Per-step state list (each row uses StatusChip)
//   - Honest "Coming next" guidance when action_required
//   - Retry/support CTAs on failure

function ProvisioningView({
  status, phase = 'waiting', domain, branding, onComplete, onStartOver,
}: {
  status: OnboardingStatus | null;
  phase?: 'waiting' | 'no_payment';
  domain: string;
  branding: ReturnType<typeof useTheme>['branding'];
  onComplete?: () => void;
  onStartOver?: () => void;
}) {
  const cardStyle = {
    background: branding.surface_card, borderRadius: 16, padding: 24,
    border: `1px solid ${branding.border_color}`,
  };

  // Initial poll hasn't returned yet
  if (!status) {
    // W129: no provisioning job behind this txn. Once the grace window elapses
    // there's no completed payment — say so honestly instead of a fake spinner.
    if (phase === 'no_payment') {
      return (
        <div style={cardStyle}>
          <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>Payment not confirmed</h3>
          <p style={{ color: branding.text_secondary, fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            We couldn&rsquo;t find a completed payment for this order, so there&rsquo;s nothing to set up yet.
          </p>
          <p style={{ color: branding.text_muted, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            If you just paid, give it a moment and refresh this page. Otherwise you can start a new order.
          </p>
          <button
            onClick={onStartOver}
            style={{ padding: '11px 18px', background: branding.primary_color, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Start a new order
          </button>
        </div>
      );
    }
    return (
      <div style={cardStyle}>
        <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>Setting Up Your Hosting</h3>
        <p style={{ color: branding.text_muted, fontSize: 13, marginBottom: 24 }}>{domain}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusChip state="pending" label="Connecting to provisioning service…" />
        </div>
      </div>
    );
  }

  const isTerminal = status.state === 'succeeded' || status.state === 'failed';
  const expectedSteps = [
    'create_account', 'configure_dns', 'install_ssl', 'create_admin_email', 'write_db_record',
  ];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <h3 style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700, margin: 0 }}>Setting Up Your Hosting</h3>
        <StatusChip state={status.state} />
      </div>
      <p style={{ color: branding.text_muted, fontSize: 13, marginBottom: 8 }}>{domain}</p>
      {status.reason && (
        <p style={{ color: branding.text_secondary, fontSize: 14, marginBottom: 20 }}>{status.reason}</p>
      )}
      {status.expected_resolution && (
        <p style={{ color: branding.text_muted, fontSize: 12, marginBottom: 20 }}>{status.expected_resolution}</p>
      )}

      {/* Per-step list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {expectedSteps.map((stepName, idx) => {
          const s = status.steps.find(x => x.name === stepName);
          const label = STEP_LABELS[stepName] || stepName;
          const chipState = stepStateToChipState(s?.state);
          const isInProgress = s?.state === 'in_progress';
          return (
            <div key={stepName} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 16px', background: '#0f2340', borderRadius: 10, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ color: branding.text_muted, fontSize: 12, fontWeight: 700, minWidth: 18 }}>{idx + 1}.</span>
                <span style={{ color: isInProgress ? branding.primary_color : (s?.state === 'succeeded' ? '#34d399' : branding.text_secondary), fontSize: 14, fontWeight: isInProgress ? 600 : 400 }}>
                  {label}
                </span>
              </div>
              <StatusChip
                state={chipState}
                size="sm"
                label={s?.state === 'in_progress' ? 'Working' : s?.state === 'skipped' ? 'Skipped' : undefined}
                reason={s?.reason || s?.error_message || undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Terminal / action-required CTAs */}
      {/* Wave 53: concrete "next steps" panel — replaces the previous bare
          success view that just had a single button. Customer just paid; they
          need clear what-to-do-next guidance, not a victory lap. */}
      {status.state === 'succeeded' && (
        <PostProvisioningSuccess
          status={status} domain={domain} branding={branding}
          onComplete={onComplete}
        />
      )}

      {status.state === 'action_required' && (
        <div style={{ marginTop: 24 }}>
          <div style={{ background: '#3f1d0a', border: '1px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ color: '#fbbf24', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Action needed: point your nameservers
            </div>
            <p style={{ color: branding.text_secondary, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              At your domain registrar (GoDaddy / Namecheap / Google Domains / wherever you registered <strong>{domain}</strong>), replace the existing nameservers with:
            </p>
            <div style={{ marginTop: 12, padding: 12, background: branding.surface_dark, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, color: branding.text_primary }}>
              ns1.capricorncorphosting.com<br />
              ns2.capricorncorphosting.com
            </div>
            <p style={{ color: branding.text_muted, fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              We check propagation every few minutes. SSL will be issued automatically once your domain points to us — typically within 4 hours of updating nameservers.
            </p>
          </div>
          {/* Wave 53: even in action_required the customer can still start
              setting things up (WordPress, email, etc) — those work locally
              and become public once DNS propagates. */}
          <PostProvisioningSuccess
            status={status} domain={domain} branding={branding}
            onComplete={onComplete}
            heading="While DNS propagates, you can start setting things up"
            ctaText="Go to Hosting Dashboard"
          />
        </div>
      )}

      {status.state === 'failed' && (
        <div style={{ marginTop: 24, background: '#451a1a', border: '1px solid #ef4444', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#f87171', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Provisioning didn't complete</div>
          <p style={{ color: branding.text_secondary, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            {status.reason || 'Something went wrong during setup.'}
          </p>
          <p style={{ color: branding.text_muted, fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Your payment is safe. Please contact <a href={`mailto:${branding.support_email}`} style={{ color: branding.primary_color }}>{branding.support_email}</a> with transaction id <code>{status.merchantTransId}</code> so we can resolve this.
          </p>
        </div>
      )}

      {status.state === 'retrying' && status.attempts > 0 && (
        <div style={{ marginTop: 16, color: branding.text_muted, fontSize: 12, textAlign: 'center' }}>
          Retry attempt {status.attempts} of {status.max_attempts}
        </div>
      )}

      {/* Polling indicator when still in flight */}
      {!isTerminal && (
        <div style={{ marginTop: 16, fontSize: 11, color: branding.text_muted, textAlign: 'center' }}>
          Refreshing every {Math.round(POLL_INTERVAL_MS / 1000)}s — last update {status.steps.length ? new Date().toLocaleTimeString() : 'pending'}
        </div>
      )}
    </div>
  );
}

// ─── Wave 53: Post-provisioning success quick-start ─────────────────────────
//
// When provisioning lands at `succeeded` (DNS already pointed) OR
// `action_required` (waiting on DNS propagation), the customer needs a clear
// "what to do next" panel — they just paid us, they want to start using it.
// Hostinger / HostPAPA / eWebGuru all show this same shape of guided next-steps
// panel; we mirror it for ecosystem-consistency per console-comparative-benchmarks.

function PostProvisioningSuccess({
  status, domain, branding, onComplete,
  heading, ctaText,
}: {
  status: OnboardingStatus;
  domain: string;
  branding: ReturnType<typeof useTheme>['branding'];
  onComplete?: () => void;
  heading?: string;
  ctaText?: string;
}) {
  // Wave 54: deep-link via ?tab= query string so each Quick Start card lands
  // the customer directly on the right sub-tab / dialog instead of the
  // overview tab.
  // Phase 4a §22.34 — customer leaves hosting.capricorncorp.com after
  // provisioning succeeds and goes to Console for ongoing management.
  // The hash/query indicates which sub-tab/dialog should open. Wave 53's
  // PostProvisioning success panel on Console handles these hashes.
  const goTab = (hash: string, search: string) => {
    const consoleUrl = new URL('https://console.capricorncorp.com/');
    consoleUrl.search = search;
    consoleUrl.hash = hash;
    window.location.href = consoleUrl.toString();
    if (onComplete) onComplete();
  };
  const goWordPress = () => goTab('#hosting', '?tab=wordpress');
  const goMail = () => goTab('#mail', '?tab=accounts&new=1');
  const goDomainHealth = () => goTab('#hosting', '?tab=health');
  const goCwp = () => goTab('#hosting', '?tab=cwp');

  // Per-step status the panel may want to reference.
  const sslStep = status.steps.find(s => s.name === 'install_ssl');
  const sslDeferred = sslStep?.state === 'skipped';

  const QuickStartCard = ({
    icon: Icon, title, description, ctaLabel, onClick, accentColor,
  }: {
    icon: any; title: string; description: string; ctaLabel: string;
    onClick: () => void; accentColor: string;
  }) => (
    <button onClick={onClick} style={{
      textAlign: 'left', width: '100%', padding: 16,
      background: branding.surface_dark, border: `1px solid ${branding.border_color}`,
      borderRadius: 12, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
      transition: 'border-color 0.2s, background 0.2s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accentColor; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = branding.border_color; }}
    >
      <div style={{
        background: '#0a1628', borderRadius: 8, padding: 8, flexShrink: 0,
      }}>
        <Icon size={18} color={accentColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: branding.text_primary, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ color: branding.text_muted, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
          {description}
        </div>
        <div style={{ color: accentColor, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {ctaLabel} <ArrowRight size={12} />
        </div>
      </div>
    </button>
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {status.state === 'succeeded' ? (
            <Check size={20} color="#10b981" />
          ) : (
            <Sparkles size={20} color="#fbbf24" />
          )}
          <div style={{ color: branding.text_primary, fontSize: 18, fontWeight: 700 }}>
            {heading || (status.state === 'succeeded' ? 'Your hosting is ready' : 'Setup is underway')}
          </div>
        </div>
        <div style={{ color: branding.text_muted, fontSize: 13 }}>
          {status.state === 'succeeded'
            ? `${domain} is live. Here's what to do next.`
            : `Once ${domain} starts pointing to our nameservers, everything below will be publicly reachable.`}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <QuickStartCard
          icon={Sparkles}
          title="Install WordPress"
          description="One-click WordPress install with database + admin user — ready in under a minute."
          ctaLabel="Open installer"
          onClick={goWordPress}
          accentColor="#21759b"
        />
        <QuickStartCard
          icon={Mail}
          title="Set up your first email"
          description={`Create yourname@${domain} so you can send and receive email at your domain.`}
          ctaLabel="Add email account"
          onClick={goMail}
          accentColor="#f59e0b"
        />
        <QuickStartCard
          icon={ShieldCheck}
          title="Check Domain Health"
          description={sslDeferred
            ? 'See live NS / MX / SPF / DKIM / DMARC status. SSL issues automatically once DNS resolves.'
            : 'See live NS / MX / SPF / DKIM / DMARC status — confirm everything is propagating correctly.'}
          ctaLabel="View Domain Health"
          onClick={goDomainHealth}
          accentColor="#10b981"
        />
        <QuickStartCard
          icon={ExternalLink}
          title="Open hosting control panel"
          description="Full CWP panel for advanced controls — file manager, databases, cron jobs, SSL."
          ctaLabel="Launch CWP"
          onClick={goCwp}
          accentColor={branding.primary_color}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
        <a
          href="https://capricorncorp.com/docs/getting-started"
          target="_blank" rel="noreferrer"
          style={{ color: branding.text_muted, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <BookOpen size={12} /> Getting-started guide
        </a>
        <button onClick={onComplete} style={{
          padding: '12px 24px', background: branding.primary_color, color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {ctaText || 'Go to Hosting Dashboard'} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
