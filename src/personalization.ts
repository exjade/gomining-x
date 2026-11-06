import { useState, useEffect } from 'react'
import esLocale from './locales/es.json'
import enLocale from './locales/en.json'

export type Theme = 'dark' | 'light'
export type Language = 'es' | 'en'

const THEME_STORAGE_KEY = 'gomining_theme'
const LANG_STORAGE_KEY = 'gomining_lang'

const dictionaries: Record<Language, Record<string, any>> = {
  es: esLocale,
  en: enLocale,
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'es'
  const saved = localStorage.getItem(LANG_STORAGE_KEY)
  if (saved === 'es' || saved === 'en') return saved
  return 'es'
}

let currentTheme: Theme = getInitialTheme()
let currentLanguage: Language = getInitialLanguage()

const themeListeners = new Set<(theme: Theme) => void>()
const languageListeners = new Set<(lang: Language) => void>()

export function applyTheme(theme: Theme) {
  currentTheme = theme
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    if (theme === 'light') {
      document.body.classList.add('light-theme')
    } else {
      document.body.classList.remove('light-theme')
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  themeListeners.forEach((l) => l(theme))
}

export function applyLanguage(lang: Language) {
  currentLanguage = lang
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  }
  languageListeners.forEach((l) => l(lang))
}

// Initial application of theme on load
if (typeof document !== 'undefined') {
  applyTheme(currentTheme)
}

/**
 * Resolves a key using dot notation (e.g. "landing.hero_badge") in the current locale dictionary
 */
export function translate(key: string, lang: Language = currentLanguage): string {
  const dict = dictionaries[lang] || dictionaries.es
  const fallbackDict = dictionaries.es

  const resolve = (obj: any, path: string): string | undefined => {
    if (!obj || typeof obj !== 'object') return undefined
    // First try direct key
    if (typeof obj[path] === 'string') return obj[path]
    // Then try nested dot traversal
    const parts = path.split('.')
    let curr = obj
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part]
      } else {
        return undefined
      }
    }
    return typeof curr === 'string' ? curr : undefined
  }

  const val = resolve(dict, key)
  if (val !== undefined) return val

  const fallbackVal = resolve(fallbackDict, key)
  if (fallbackVal !== undefined) return fallbackVal

  return key
}

export function usePersonalization() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const [language, setLanguage] = useState<Language>(currentLanguage)

  useEffect(() => {
    const handleThemeChange = (t: Theme) => setTheme(t)
    const handleLangChange = (l: Language) => setLanguage(l)
    themeListeners.add(handleThemeChange)
    languageListeners.add(handleLangChange)
    return () => {
      themeListeners.delete(handleThemeChange)
      languageListeners.delete(handleLangChange)
    }
  }, [])

  const toggleTheme = () => {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const setAppLanguage = (lang: Language) => {
    applyLanguage(lang)
  }

  const setAppTheme = (t: Theme) => {
    applyTheme(t)
  }

  const t = (key: string, fallback?: string): string => {
    const res = translate(key, language)
    if (res === key && fallback) return fallback
    return res
  }

  return {
    theme,
    language,
    toggleTheme,
    setAppTheme,
    setAppLanguage,
    t,
  }
}
