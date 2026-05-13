import React, { useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Select } from 'even-toolkit/web/select'
import { searchCities, getSavedCity, saveCity, getSavedUnit, saveUnit, onSettingsLoaded } from './api'
import { refreshWeather } from './app'
import type { City, UnitSystem } from './state'

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

function SettingsPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 className="text-large-title" style={{ margin: '0 0 var(--spacing-cross)' }}>City</h2>
      <CitySearch />

      <h2 className="text-large-title" style={{ margin: 'var(--spacing-cross) 0' }}>Units</h2>
      <UnitPicker />

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
