import React, { useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Card,
  CardHeader,
  CardContent,
  Text,
  Input,
  Button,
} from '@jappyjan/even-realities-ui'
import { searchCities, getSavedCity, saveCity } from './api'
import { refreshWeather } from './app'
import type { City } from './state'

function CitySearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<City[]>([])
  const [current, setCurrent] = useState<City | null>(getSavedCity())
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)

    if (timerRef.current) clearTimeout(timerRef.current)

    if (value.length < 2) {
      setResults([])
      return
    }

    timerRef.current = setTimeout(async () => {
      setSearching(true)
      const cities = await searchCities(value)
      setResults(cities)
      setSearching(false)
    }, 300)
  }

  const handleSelect = (city: City) => {
    saveCity(city)
    setCurrent(city)
    setQuery('')
    setResults([])
    void refreshWeather()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {current && (
        <Text variant="body-2" style={{ color: 'var(--color-tc-2)' }}>
          Current: {current.name}, {current.country}
        </Text>
      )}
      <div>
        <Text as="label" variant="subtitle" style={{ display: 'block', marginBottom: '4px' }}>
          Search city
        </Text>
        <Input
          value={query}
          onChange={handleChange}
          placeholder="Type a city name..."
          style={{ width: '90%' }}
        />
      </div>
      {searching && (
        <Text variant="body-2" style={{ color: 'var(--color-tc-2)' }}>Searching...</Text>
      )}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {results.map((city, i) => (
            <Button
              key={i}
              variant="default"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => handleSelect(city)}
            >
              {city.name}, {city.country}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsPanel() {
  const handleRefresh = () => {
    void refreshWeather()
  }

  const handleConnect = () => {
    document.getElementById('connectBtn')?.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Card style={{ width: '100%' }}>
        <CardHeader>
          <Text variant="title-1">City</Text>
          <Text variant="body-2" style={{ color: 'var(--color-tc-2)', marginTop: '4px', display: 'block' }}>
            Search and select the city for your weather forecast.
          </Text>
        </CardHeader>
        <CardContent>
          <CitySearch />
        </CardContent>
      </Card>
      <Card style={{ width: '100%' }}>
        <CardContent>
          <Button variant="default" style={{ width: '100%' }} onClick={handleRefresh}>
            Refresh forecast
          </Button>
        </CardContent>
      </Card>
      <Card style={{ width: '100%' }}>
        <CardContent>
          <Button variant="primary" style={{ width: '100%' }} onClick={handleConnect}>
            Connect glasses
          </Button>
        </CardContent>
      </Card>
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
  const status = document.getElementById('status')
  if (heading) app.appendChild(heading)
  if (status) app.appendChild(status)

  const container = document.createElement('div')
  container.style.margin = '48px 0'
  app.insertBefore(container, heading)

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
