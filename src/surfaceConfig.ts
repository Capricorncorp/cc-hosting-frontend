const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env

export const MOONSHOT_PROFILE = env?.VITE_ACQUISITION_PROFILE === 'moonshot'
export const OIDC_ORIGIN = env?.VITE_OIDC_URL || 'https://auth.capricorncorp.com'
export const CONSOLE_ORIGIN = MOONSHOT_PROFILE ? 'https://console.moonshot-ai.in' : 'https://console.capricorncorp.com'
export const COMPANY_ORIGIN = MOONSHOT_PROFILE ? 'https://moonshot-ai.in' : 'https://capricorncorp.com'
export const SESSION_COOKIE_DOMAIN = MOONSHOT_PROFILE ? '.moonshot-ai.in' : '.capricorncorp.com'
export const STOREFRONT_ORIGIN = MOONSHOT_PROFILE
  ? 'https://hosting.moonshot-ai.in'
  : 'https://hosting.capricorncorp.com'

export function surfaceBrand(name?: string, logo?: string) {
  if (MOONSHOT_PROFILE && (!name || /^(capricorncorp|moonshot ai)$/i.test(name.trim()))) {
    return { name: 'Moonshot AI', logo: undefined }
  }
  return { name: name || 'Capricorncorp', logo }
}
