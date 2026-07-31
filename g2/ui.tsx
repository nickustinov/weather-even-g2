import React, { useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { SegmentedControl } from 'even-toolkit/web/segmented-control'
import { SearchBar } from 'even-toolkit/web/search-bar'
import { Select } from 'even-toolkit/web/select'
import {
  searchCities, onSettingsLoaded,
  getCities, getActiveCity, cityKey, addCity, removeCity, setActiveCity, setCities, onCitiesChanged,
  isCurrentLocationStale,
  getScreenPrefs, saveScreenPrefs, onScreenPrefsChanged,
  getUnitPrefs, setUnitPrefs, onUnitPrefsChanged,
  getActiveLocale, setActiveLocale, onLocaleChanged,
} from './api'
import { refreshWeather } from './app'
import { LOCALE_LABELS, SUPPORTED_LOCALES, t, type Locale } from './i18n'
import type { City, ScreenPref, UnitPrefs } from './state'
import appManifest from '../app.json'

function cityLabel(city: City): string {
  const parts = [city.name]
  if (city.admin1) parts.push(city.admin1)
  parts.push(city.country)
  return parts.join(', ')
}

const cityRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-default)',
}

// Shared by the draggable city rows and by the hidden spacer on the pinned
// current-location row, so both reserve identical width and the radio buttons
// line up down the column.
const dragHandleStyle: React.CSSProperties = {
  color: 'var(--color-text-dim)',
  fontSize: 18,
  lineHeight: 1,
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'none',
  padding: '6px 4px',
  flexShrink: 0,
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--color-text-dim)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  lineHeight: 1,
  flexShrink: 0,
}

function ActiveRadio({ active, onSelect, disabled }: { active: boolean; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      style={{
        width: 20,
        height: 20,
        flexShrink: 0,
        border: '2px solid var(--color-accent)',
        background: 'transparent',
        borderRadius: '50%',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {active && (
        <span
          style={{
            width: 10,
            height: 10,
            background: 'var(--color-accent)',
            borderRadius: '50%',
            display: 'block',
          }}
        />
      )}
    </button>
  )
}

function CitiesEditor() {
  const [cities, setCitiesState] = useState<City[]>(() => getCities())
  const [active, setActive] = useState<City | null>(() => getActiveCity())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<City[]>([])
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const startY = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // No connect call here: src/main.ts already auto-connects unconditionally
    // on page load. Doing it again from this effect started a second, parallel
    // init whose image sends interleaved with the first's.
    const sync = () => {
      setCitiesState(getCities())
      setActive(getActiveCity())
    }
    onSettingsLoaded(sync)
    onCitiesChanged(sync)
  }, [])

  const insertIndexAtY = (clientY: number, fromIndex: number): number => {
    const list = listRef.current
    if (!list) return fromIndex
    const rows = Array.from(list.children) as HTMLElement[]
    let originalInsert = rows.length
    for (let i = 0; i < rows.length; i++) {
      if (i === fromIndex) continue
      const r = rows[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) {
        originalInsert = i
        break
      }
    }
    return originalInsert > fromIndex ? originalInsert - 1 : originalInsert
  }

  // The GPS entry takes part in the reorder like any other row. setCities
  // records where it landed and strips it before persisting, so it stays
  // draggable without becoming a saved city.
  const saved = cities.filter(c => c.kind !== 'current')

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= cities.length || to >= cities.length) return
    const next = cities.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setCitiesState(next)
    void setCities(next)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setResults(await searchCities(value))
    }, 300)
  }

  const handleAdd = async (city: City) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setQuery('')
    setResults([])
    const inputEl = document.getElementById('city-search') as HTMLInputElement | null
    inputEl?.blur()
    await addCity(city)
    // Deliberately no reconnect here — the bridge is already connected from
    // boot. Re-triggering the SDK connect flow has been observed to lock
    // browser-side page scrolling on the Even webview.
    void refreshWeather()
  }

  const handleSelect = async (city: City) => {
    await setActiveCity(cityKey(city))
    void refreshWeather()
  }

  const handleRemove = async (city: City) => {
    await removeCity(cityKey(city))
    if (active && cityKey(active) === cityKey(city)) {
      void refreshWeather()
    }
  }

  // Filter out cities already saved from the search results.
  const savedKeys = new Set(saved.map(cityKey))
  const filteredResults = results.filter(r => !savedKeys.has(cityKey(r)))

  return (
    <div className="weather-card">
      {cities.length > 0 && (
        <ul
          ref={listRef}
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--spacing-cross)' }}
        >
          {cities.map((city, index) => {
            const key = cityKey(city)
            const isActive = !!active && cityKey(active) === key
            const isDragging = dragKey === key
            const isCurrent = city.kind === 'current'
            return (
              <li
                key={key}
                style={{
                  ...cityRowStyle,
                  transform: isDragging ? `translateY(${dragOffsetY}px)` : undefined,
                  position: isDragging ? 'relative' : undefined,
                  zIndex: isDragging ? 10 : undefined,
                  boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
                  opacity: isDragging ? 0.92 : 1,
                  touchAction: isDragging ? 'none' : undefined,
                }}
              >
                <span
                  onPointerDown={(e) => {
                    if (e.button !== undefined && e.button !== 0) return
                    e.preventDefault()
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    startY.current = e.clientY
                    setDragOffsetY(0)
                    setDragKey(key)
                    setTargetIndex(index)
                  }}
                  onPointerMove={(e) => {
                    if (dragKey !== key) return
                    setDragOffsetY(e.clientY - startY.current)
                    const idx = insertIndexAtY(e.clientY, index)
                    if (idx !== targetIndex) setTargetIndex(idx)
                  }}
                  onPointerUp={(e) => {
                    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                    if (dragKey === key && targetIndex !== null && targetIndex !== index) {
                      move(index, targetIndex)
                    }
                    setDragKey(null)
                    setTargetIndex(null)
                    setDragOffsetY(0)
                  }}
                  onPointerCancel={() => {
                    setDragKey(null)
                    setTargetIndex(null)
                    setDragOffsetY(0)
                  }}
                  aria-label={t('browser.drag_city', { city: cityLabel(city) })}
                  style={{ ...dragHandleStyle, cursor: dragKey === key ? 'grabbing' : 'grab' }}
                >
                  ⋮⋮
                </span>
                <ActiveRadio active={isActive} onSelect={() => handleSelect(city)} />
                <span
                  className="text-medium-body"
                  style={{ flex: 1, color: 'var(--color-text)', cursor: 'pointer' }}
                  onClick={() => handleSelect(city)}
                >
                  {isCurrent ? `⌖ ${city.name ? cityLabel(city) : t('browser.location_unavailable')}` : cityLabel(city)}
                  {isCurrent && (
                    <span style={{ display: 'block', color: 'var(--color-text-dim)', fontSize: '0.78em' }}>
                      {isCurrentLocationStale()
                        ? t('browser.location_last_known')
                        : t('browser.location_current')}
                    </span>
                  )}
                </span>
                {/* The GPS entry is permanent, so it gets no delete button. No
                    spacer is needed: the label above is flex:1 and simply
                    absorbs the width, unlike the drag-handle column on the
                    left where an omission would visibly shift the row. */}
                {!isCurrent && (
                  <button
                    onClick={() => handleRemove(city)}
                    aria-label={t('browser.remove_city', { city: cityLabel(city) })}
                    style={iconBtnStyle}
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <SearchBar
        id="city-search"
        value={query}
        onChange={handleSearchChange}
        placeholder={saved.length === 0 ? t('browser.search_first') : t('browser.search_more')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {filteredResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-same)', marginTop: 'var(--spacing-cross)' }}>
          {filteredResults.map((city, i) => (
            <button
              key={i}
              className="weather-btn weather-btn--ghost text-normal-body"
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => handleAdd(city)}
            >
              {cityLabel(city)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const unitOpt = (v: string) => ({ value: v, label: t(`unit_value.${v}`) })

function UnitRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  // flexShrink:0 wrapper keeps the toolkit SegmentedControl at its natural
  // content width — its inner buttons are `flex-1` and will collapse below
  // their text when the parent row squeezes them. whitespace-nowrap on the
  // control prevents per-button text wrapping for longer localized labels
  // (e.g. "км/ч", "мм рт").
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
      <span className="text-medium-body" style={{ color: 'var(--color-text)', minWidth: 0 }}>{label}</span>
      <div style={{ flexShrink: 0 }}>
        <SegmentedControl options={options} value={value} onValueChange={onChange} size="small" className="whitespace-nowrap" />
      </div>
    </div>
  )
}

function UnitPicker() {
  const [prefs, setPrefs] = useState<UnitPrefs>(() => getUnitPrefs())

  useEffect(() => {
    const sync = () => setPrefs(getUnitPrefs())
    onSettingsLoaded(sync)
    onUnitPrefsChanged(sync)
  }, [])

  const update = async (patch: Partial<UnitPrefs>) => {
    await setUnitPrefs(patch)
    void refreshWeather()
  }

  // Rebuild option arrays on every render so unit labels stay in sync with
  // the active locale (SettingsPanel re-renders the picker via useLocaleTick).
  const tempOpts = ['C', 'F'].map(unitOpt)
  const windOpts = ['kmh', 'mph', 'ms'].map(unitOpt)
  const precipOpts = ['mm', 'in'].map(unitOpt)
  const pressureOpts = ['hPa', 'inHg', 'mmHg'].map(unitOpt)
  const timeOpts = ['24h', '12h'].map(unitOpt)
  const aqiOpts = ['eu', 'us'].map(unitOpt)

  return (
    <div className="weather-card">
      <UnitRow label={t('browser.temperature')} options={tempOpts} value={prefs.temp} onChange={(v) => void update({ temp: v as UnitPrefs['temp'] })} />
      <UnitRow label={t('browser.wind_speed')} options={windOpts} value={prefs.wind} onChange={(v) => void update({ wind: v as UnitPrefs['wind'] })} />
      <UnitRow label={t('browser.precipitation')} options={precipOpts} value={prefs.precip} onChange={(v) => void update({ precip: v as UnitPrefs['precip'] })} />
      <UnitRow label={t('browser.pressure')} options={pressureOpts} value={prefs.pressure} onChange={(v) => void update({ pressure: v as UnitPrefs['pressure'] })} />
      <UnitRow label={t('browser.time')} options={timeOpts} value={prefs.time} onChange={(v) => void update({ time: v as UnitPrefs['time'] })} />
      <UnitRow label={t('screen_label.air')} options={aqiOpts} value={prefs.aqi} onChange={(v) => void update({ aqi: v as UnitPrefs['aqi'] })} />
    </div>
  )
}

// Plain button styled like the toolkit Checkbox. We can't use the toolkit
// component here because it wraps the button in a <label>, and label's
// implicit-control-association fires a second synthetic click that cancels
// the first toggle. A bare button has neither problem.
function ScreenCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 20,
        height: 20,
        flexShrink: 0,
        background: checked ? 'var(--color-accent)' : 'var(--color-surface-lighter, #E4E4E4)',
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <svg viewBox="0 0 12 12" width="14" height="14" fill="none">
          <polyline
            points="2.5,6.5 5,9 9.5,3.5"
            stroke="var(--color-text-highlight, #fff)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

const screenRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-default)',
}

function ScreensEditor() {
  const [prefs, setPrefs] = useState<ScreenPref[]>(() => getScreenPrefs())
  const [dragId, setDragId] = useState<string | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const startY = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    onScreenPrefsChanged(() => setPrefs(getScreenPrefs()))
    onSettingsLoaded(() => setPrefs(getScreenPrefs()))
  }, [])

  const enabledCount = prefs.filter(p => p.enabled).length

  const commit = (next: ScreenPref[]) => {
    setPrefs(next)
    void saveScreenPrefs(next)
  }

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= prefs.length || to >= prefs.length) return
    const next = prefs.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  const toggle = (id: string) => {
    // Refuse to disable the last enabled screen — at least one must remain
    // so navigation has somewhere to go.
    const idx = prefs.findIndex(p => p.id === id)
    if (idx < 0) return
    if (prefs[idx].enabled && enabledCount === 1) return
    const next = prefs.slice()
    next[idx] = { ...next[idx], enabled: !next[idx].enabled }
    commit(next)
  }

  // Returns the insert index in the post-removal array used by move(from, to).
  const insertIndexAtY = (clientY: number, fromIndex: number): number => {
    const list = listRef.current
    if (!list) return fromIndex
    const rows = Array.from(list.children) as HTMLElement[]
    let originalInsert = rows.length
    for (let i = 0; i < rows.length; i++) {
      if (i === fromIndex) continue
      const r = rows[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) {
        originalInsert = i
        break
      }
    }
    return originalInsert > fromIndex ? originalInsert - 1 : originalInsert
  }

  return (
    <div className="weather-card">
      <ul
        ref={listRef}
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {prefs.map((pref, index) => {
          const isDragging = dragId === pref.id
          const isLastEnabled = pref.enabled && enabledCount === 1
          return (
            <li
              key={pref.id}
              style={{
                ...screenRowStyle,
                transform: isDragging ? `translateY(${dragOffsetY}px)` : undefined,
                position: isDragging ? 'relative' : undefined,
                zIndex: isDragging ? 10 : undefined,
                boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
                opacity: isDragging ? 0.92 : pref.enabled ? 1 : 0.55,
                // touchAction lives on the drag handle only — applying it
                // to the whole row would block page scrolling when the
                // user starts a touch anywhere on this row.
                touchAction: isDragging ? 'none' : undefined,
              }}
            >
              <span
                onPointerDown={(e) => {
                  if (e.button !== undefined && e.button !== 0) return
                  e.preventDefault()
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  startY.current = e.clientY
                  setDragOffsetY(0)
                  setDragId(pref.id)
                  setTargetIndex(index)
                }}
                onPointerMove={(e) => {
                  if (dragId !== pref.id) return
                  setDragOffsetY(e.clientY - startY.current)
                  const idx = insertIndexAtY(e.clientY, index)
                  if (idx !== targetIndex) setTargetIndex(idx)
                }}
                onPointerUp={(e) => {
                  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                  if (dragId === pref.id && targetIndex !== null && targetIndex !== index) {
                    move(index, targetIndex)
                  }
                  setDragId(null)
                  setTargetIndex(null)
                  setDragOffsetY(0)
                }}
                onPointerCancel={() => {
                  setDragId(null)
                  setTargetIndex(null)
                  setDragOffsetY(0)
                }}
                aria-label={t('browser.drag_screen', { screen: t(`screen_label.${pref.id}`) })}
                style={{
                  color: 'var(--color-text-dim)',
                  fontSize: 18,
                  lineHeight: 1,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
                  cursor: dragId === pref.id ? 'grabbing' : 'grab',
                  padding: '6px 4px',
                  flexShrink: 0,
                }}
              >
                ⋮⋮
              </span>
              <ScreenCheckbox
                checked={pref.enabled}
                disabled={isLastEnabled}
                onChange={() => toggle(pref.id)}
              />
              <span
                className="text-medium-body"
                style={{
                  flex: 1,
                  color: 'var(--color-text)',
                  cursor: isLastEnabled ? 'not-allowed' : 'pointer',
                }}
                onClick={() => { if (!isLastEnabled) toggle(pref.id) }}
              >
                {t(`screen_label.${pref.id}`)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LanguagePicker() {
  const [locale, setLocale] = useState<Locale>(() => getActiveLocale())

  useEffect(() => {
    const sync = () => setLocale(getActiveLocale())
    onSettingsLoaded(sync)
    onLocaleChanged(sync)
  }, [])

  const onValueChange = (next: string) => {
    void setActiveLocale(next as Locale).then(() => {
      setLocale(next as Locale)
      // Redraw glasses with the new locale (wmo descriptions, weekday labels,
      // moon phase names, etc. all change). City list itself is already
      // refreshed by setActiveLocale, which re-resolves saved cities.
      void refreshWeather()
    })
  }

  const options = SUPPORTED_LOCALES.map(l => ({ value: l, label: LOCALE_LABELS[l] }))

  return (
    <div className="weather-card">
      <Select value={locale} options={options} onValueChange={onValueChange} />
    </div>
  )
}

// Forces SettingsPanel + children to re-render when locale changes so every
// inline t() call picks up the new dictionary. Children that already
// subscribe (Cities, Screens, Units) would re-render on their own listeners,
// but headings and labels rendered inline would not.
function useLocaleTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    onLocaleChanged(() => setTick(n => n + 1))
  }, [])
  return tick
}

function SettingsPanel() {
  useLocaleTick()
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 className="text-large-title" style={{ margin: '0 0 var(--spacing-cross)' }}>{t('browser.language')}</h2>
      <LanguagePicker />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>{t('browser.cities')}</h2>
      <CitiesEditor />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>{t('browser.units')}</h2>
      <UnitPicker />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>{t('browser.screens')}</h2>
      <ScreensEditor />

      <AboutCard />
    </div>
  )
}

function AboutCard() {
  const linkStyle: React.CSSProperties = { color: 'var(--color-accent, #007aff)', textDecoration: 'none' }
  const para: React.CSSProperties = { margin: '0 0 12px' }
  return (
    <div className="weather-card" style={{ marginTop: 'var(--spacing-cross)' }}>
      <h2 className="text-large-title" style={{ margin: '0 0 12px' }}>
        {t('browser.about_title')}{' '}
        <span style={{ color: 'var(--color-text-dim)' }}>v{appManifest.version}</span>
      </h2>
      <p className="text-normal-body" style={para}>{t('browser.about_description')}</p>
      <p className="text-normal-body" style={para}>{t('browser.about_data')}</p>
      <p className="text-normal-body" style={{ margin: 0 }}>
        {t('browser.about_by')}
        <a href="mailto:nick@ustinov.cc" style={linkStyle}>nick@ustinov.cc</a>
      </p>
    </div>
  )
}

export function initUI(): void {
  const app = document.getElementById('app')
  if (!app) return

  const connectBtn = document.getElementById('connectBtn')
  if (connectBtn) connectBtn.style.display = 'none'

  const status = document.getElementById('status')
  if (status) status.remove()

  const actionBtn = document.getElementById('actionBtn')
  if (actionBtn) actionBtn.remove()

  const container = document.createElement('div')
  app.appendChild(container)

  // Re-append the log panel so it appears below the React-rendered settings
  // (it lives in index.html before initUI runs so appendEventLog can write
  // to it before the bridge is ready).
  const logPanel = document.getElementById('log-panel')
  if (logPanel) app.appendChild(logPanel)

  const logSummary = document.getElementById('log-summary')
  if (logSummary) logSummary.textContent = t('browser.show_log')
  onLocaleChanged(() => {
    const s = document.getElementById('log-summary')
    if (s) s.textContent = t('browser.show_log')
  })

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
