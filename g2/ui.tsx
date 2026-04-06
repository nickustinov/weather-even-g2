import React, { useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { searchCities, getSavedCity, saveCity, getSavedUnit, saveUnit, onSettingsLoaded } from './api'
import { refreshWeather } from './app'
import type { City, UnitSystem } from './state'

/* ── shared styles ─────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-default)',
  padding: 'var(--spacing-card-margin)',
}

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  background: 'var(--color-input-bg)',
  color: 'var(--color-text)',
  border: 'none',
  borderRadius: 'var(--radius-default)',
  padding: '0 16px',
  fontFamily: 'var(--font-body)',
  outline: 'none',
}

const resultBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: 40,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-default)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  padding: '0 16px',
  cursor: 'pointer',
  textAlign: 'left' as const,
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 48,
  border: 'none',
  borderRadius: 'var(--radius-default)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
}

/* ── helpers ────────────────────────────────────────────── */

function autoConnect() {
  document.getElementById('connectBtn')?.click()
}

function cityLabel(city: City): string {
  const parts = [city.name]
  if (city.admin1) parts.push(city.admin1)
  parts.push(city.country)
  return parts.join(', ')
}

/* ── components ─────────────────────────────────────────── */

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

  const handleSelect = (city: City) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    saveCity(city)
    setCurrent(city)
    setQuery('')
    setResults([])
    void refreshWeather()
    autoConnect()
  }

  return (
    <div style={cardStyle}>
      {current && (
        <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: 0 }}>
          Current: {cityLabel(current)}
        </p>
      )}
      <input
        id="city-search"
        className="text-medium-body"
        style={{ ...inputStyle, marginTop: current ? 'var(--spacing-cross)' : 0 }}
        value={query}
        onChange={handleChange}
        placeholder="Search city..."
      />
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-same)', marginTop: 'var(--spacing-cross)' }}>
          {results.map((city, i) => (
            <button key={i} className="text-normal-body" style={resultBtnStyle} onClick={() => handleSelect(city)}>
              {cityLabel(city)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const toggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  borderRadius: 'var(--radius-default)',
  overflow: 'hidden',
  border: '1px solid var(--color-border, #333)',
}

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  background: active ? 'var(--color-accent, #007AFF)' : 'var(--color-input-bg, #2a2a2a)',
  color: active ? 'var(--color-text-highlight, #fff)' : 'var(--color-text-dim, #888)',
})

function UnitPicker() {
  const [unit, setUnit] = useState<UnitSystem>(getSavedUnit())

  useEffect(() => {
    onSettingsLoaded(() => setUnit(getSavedUnit()))
  }, [])

  const handleChange = (value: UnitSystem) => {
    setUnit(value)
    saveUnit(value)
    void refreshWeather()
  }

  return (
    <div style={cardStyle}>
      <div style={toggleStyle}>
        <button style={toggleBtnStyle(unit === 'metric')} onClick={() => handleChange('metric')}>Metric</button>
        <button style={toggleBtnStyle(unit === 'imperial')} onClick={() => handleChange('imperial')}>Imperial</button>
      </div>
    </div>
  )
}

function SettingsPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 className="text-large-title" style={{ margin: `0 0 var(--spacing-cross)` }}>City</h2>
      <CitySearch />

      <h2 className="text-large-title" style={{ margin: `var(--spacing-cross) 0` }}>Units</h2>
      <UnitPicker />

      <button
        className="text-medium-title"
        style={{ ...actionBtnStyle, marginTop: 'var(--spacing-section)' }}
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

  for (const id of ['actionBtn']) {
    const el = document.getElementById(id)
    if (el) el.remove()
  }

  const connectBtn = document.getElementById('connectBtn')
  if (connectBtn) connectBtn.style.display = 'none'

  const heading = app.querySelector('h1')
  if (heading) heading.remove()

  const status = document.getElementById('status')
  if (status) status.remove()

  const container = document.createElement('div')
  app.appendChild(container)

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
