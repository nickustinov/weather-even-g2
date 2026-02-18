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
    <div className="flex flex-col gap-4">
      {current && (
        <Text variant="body-2" className="text-tc-2">
          Current: {current.name}, {current.country}
        </Text>
      )}
      <div>
        <Text as="label" variant="subtitle" className="block mb-1">
          Search city
        </Text>
        <Input
          value={query}
          onChange={handleChange}
          placeholder="Type a city name..."
          className="w-full"
        />
      </div>
      {searching && (
        <Text variant="body-2" className="text-tc-2">Searching...</Text>
      )}
      {results.length > 0 && (
        <div className="flex flex-col gap-1">
          {results.map((city, i) => (
            <Button
              key={i}
              variant="default"
              className="w-full text-left"
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
    <div className="flex flex-col gap-2">
      <Card className="w-full">
        <CardHeader>
          <Text variant="title-1">City</Text>
          <Text variant="body-2" className="text-tc-2 mt-1 block">
            Search and select the city for your weather forecast.
          </Text>
        </CardHeader>
        <CardContent>
          <CitySearch />
        </CardContent>
      </Card>
      <Card className="w-full">
        <CardContent>
          <Button variant="default" className="w-full" onClick={handleRefresh}>
            Refresh forecast
          </Button>
        </CardContent>
      </Card>
      <Card className="w-full">
        <CardContent>
          <Button variant="primary" className="w-full" onClick={handleConnect}>
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
  container.className = 'my-12'
  app.insertBefore(container, heading)

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
