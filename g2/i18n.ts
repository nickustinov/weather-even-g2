import en from './locales/en.json'
import ru from './locales/ru.json'

export type Locale = 'en' | 'ru'
export const SUPPORTED_LOCALES: Locale[] = ['en', 'ru']
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
}

type Dict = Record<string, unknown>
const dictionaries: Record<Locale, Dict> = { en: en as Dict, ru: ru as Dict }

let currentLocale: Locale = 'en'
const listeners: Array<(locale: Locale) => void> = []

export function getLocale(): Locale {
  return currentLocale
}

export function setLocaleSync(locale: Locale): boolean {
  if (!SUPPORTED_LOCALES.includes(locale)) return false
  if (currentLocale === locale) return false
  currentLocale = locale
  for (const cb of listeners) cb(locale)
  return true
}

export function onLocaleChange(cb: (locale: Locale) => void): void {
  listeners.push(cb)
}

export function detectBrowserLocale(): Locale {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en'
  const base = lang.split('-')[0].toLowerCase()
  return SUPPORTED_LOCALES.includes(base as Locale) ? (base as Locale) : 'en'
}

function lookup(dict: Dict, key: string): unknown {
  const parts = key.split('.')
  let val: unknown = dict
  for (const p of parts) {
    if (val === null || typeof val !== 'object') return undefined
    val = (val as Dict)[p]
  }
  return val
}

export function t(key: string, params?: Record<string, string | number>): string {
  let val = lookup(dictionaries[currentLocale], key)
  if (typeof val !== 'string') val = lookup(dictionaries.en, key)
  if (typeof val !== 'string') return key
  if (!params) return val
  return val.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k]
    return v === undefined ? `{${k}}` : String(v)
  })
}

export function tArr(key: string): string[] {
  const val = lookup(dictionaries[currentLocale], key)
  if (Array.isArray(val)) return val as string[]
  const fb = lookup(dictionaries.en, key)
  return Array.isArray(fb) ? (fb as string[]) : []
}
