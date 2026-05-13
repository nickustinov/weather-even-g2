import React, { useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Select } from 'even-toolkit/web/select'
import {
  searchCities, getSavedCity, saveCity, getSavedUnit, saveUnit, onSettingsLoaded,
  getScreenPrefs, saveScreenPrefs, onScreenPrefsChanged,
} from './api'
import { refreshWeather } from './app'
import { SCREEN_LABELS } from './state'
import type { City, ScreenPref, UnitSystem } from './state'

function autoConnect() {
  document.getElementById('connectBtn')?.click()
}

function cityLabel(city: City): string {
  const parts = [city.name]
  if (city.admin1) parts.push(city.admin1)
  parts.push(city.country)
  return parts.join(', ')
}

function CitySearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<City[]>([])
  const [current, setCurrent] = useState<City | null>(getSavedCity())
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (current) autoConnect()
    onSettingsLoaded(() => {
      setCurrent(getSavedCity())
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setResults(await searchCities(value))
    }, 300)
  }

  const handleSelect = async (city: City) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setCurrent(city)
    setQuery('')
    setResults([])
    await saveCity(city)
    void refreshWeather()
    autoConnect()
  }

  return (
    <div className="weather-card">
      {current && (
        <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: 0 }}>
          Current: {cityLabel(current)}
        </p>
      )}
      <input
        id="city-search"
        className="weather-input text-normal-body"
        style={{ marginTop: current ? 'var(--spacing-cross)' : 0 }}
        value={query}
        onChange={handleChange}
        placeholder="Search city..."
      />
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-same)', marginTop: 'var(--spacing-cross)' }}>
          {results.map((city, i) => (
            <button
              key={i}
              className="weather-btn weather-btn--ghost text-normal-body"
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => handleSelect(city)}
            >
              {cityLabel(city)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const UNIT_OPTIONS = [
  { value: 'metric', label: 'Metric (°C, km/h, mm)' },
  { value: 'imperial', label: 'Imperial (°F, mph, in)' },
]

function UnitPicker() {
  const [unit, setUnit] = useState<UnitSystem>(getSavedUnit())

  useEffect(() => {
    onSettingsLoaded(() => setUnit(getSavedUnit()))
  }, [])

  const handleChange = async (value: string) => {
    const u = value as UnitSystem
    setUnit(u)
    await saveUnit(u)
    void refreshWeather()
  }

  return (
    <div className="weather-card">
      <Select value={unit} options={UNIT_OPTIONS} onValueChange={handleChange} />
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
                touchAction: 'none',
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
                aria-label={`Drag ${SCREEN_LABELS[pref.id]}`}
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
              <span className="text-medium-body" style={{ flex: 1, color: 'var(--color-text)' }}>
                {SCREEN_LABELS[pref.id]}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SettingsPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 className="text-large-title" style={{ margin: '0 0 var(--spacing-cross)' }}>City</h2>
      <CitySearch />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>Units</h2>
      <UnitPicker />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>Screens</h2>
      <ScreensEditor />

      <button
        className="weather-btn text-medium-title"
        style={{ width: '100%', marginTop: 'var(--spacing-section)' }}
        onClick={() => void refreshWeather()}
      >
        Refresh forecast
      </button>
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

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
