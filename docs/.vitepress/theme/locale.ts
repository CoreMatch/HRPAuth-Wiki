export type SupportedLocale = 'en' | 'zh'

const LOCALE_STORAGE_KEY = 'samuelwiki-locale'
const ZH_PREFIX = '/zh'

function normalizePath(rawPath: string): string {
  const path = (rawPath || '/')
    .replace(/\/index\.html$/, '/')
    .replace(/index\.html$/, '/')
    .replace(/\/{2,}/g, '/')

  if (!path.startsWith('/')) {
    return `/${path}`
  }

  return path || '/'
}

export function getLocaleFromPath(path: string): SupportedLocale {
  const normalizedPath = normalizePath(path)
  return normalizedPath === ZH_PREFIX || normalizedPath.startsWith(`${ZH_PREFIX}/`)
    ? 'zh'
    : 'en'
}

export function getLocalizedPath(path: string, targetLocale: SupportedLocale): string {
  const normalizedPath = normalizePath(path)
  const englishPath =
    normalizedPath === ZH_PREFIX
      ? '/'
      : normalizedPath.startsWith(`${ZH_PREFIX}/`)
        ? normalizedPath.slice(ZH_PREFIX.length) || '/'
        : normalizedPath

  if (targetLocale === 'zh') {
    return englishPath === '/' ? '/zh/' : `${ZH_PREFIX}${englishPath}`
  }

  return englishPath
}

export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') {
    return 'en'
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh' : 'en'
}

export function getStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return storedLocale === 'en' || storedLocale === 'zh' ? storedLocale : null
}

export function setStoredLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
}

export function maybeRedirectByBrowserLocale(currentPath: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedPath = normalizePath(currentPath)

  // Only auto-redirect from the root entry to avoid hijacking deep links.
  if (normalizedPath !== '/') {
    return
  }

  const preferredLocale = getStoredLocale() ?? detectBrowserLocale()

  if (preferredLocale !== 'zh') {
    return
  }

  const targetPath = '/zh/'
  const nextUrl = `${targetPath}${window.location.search}${window.location.hash}`

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.location.replace(nextUrl)
  }
}
