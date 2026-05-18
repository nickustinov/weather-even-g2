import en from './locales/en.json'
import ru from './locales/ru.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import nl from './locales/nl.json'
import ko from './locales/ko.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

// Order by speaker population so the most-likely choice is at the top of the
// browser dropdown.
export type Locale = 'en' | 'zh' | 'es' | 'fr' | 'pt' | 'ru' | 'de' | 'ja' | 'ko' | 'it' | 'nl'
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh', 'es', 'fr', 'pt', 'ru', 'de', 'ja', 'ko', 'it', 'nl']
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  ru: 'Русский',
  de: 'Deutsch',
  ja: '日本語',
  ko: '한국어',
  it: 'Italiano',
  nl: 'Nederlands',
}

type Dict = Record<string, unknown>
const dictionaries: Record<Locale, Dict> = {
  en: en as Dict,
  ru: ru as Dict,
  fr: fr as Dict,
  de: de as Dict,
  it: it as Dict,
  es: es as Dict,
  pt: pt as Dict,
  nl: nl as Dict,
  ko: ko as Dict,
  ja: ja as Dict,
  zh: zh as Dict,
}

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
