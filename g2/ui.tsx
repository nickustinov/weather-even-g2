import React, { useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { searchCities, getSavedCity, saveCity, getSavedUnit, saveUnit } from './api'
import { refreshWeather } from './app'
import type { City, TemperatureUnit } from './state'

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)

    if (timerRef.current) clearTimeout(timerRef.current)

    if (value.length < 2) {
      setResults([])
      return
    }

    timerRef.current = setTimeout(async () => {
      const cities = await searchCities(value)
      setResults(cities)
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
        <p className="text-sm text-muted-foreground">
          Current: {cityLabel(current)}
        </p>
      )}
      <div>
        <Label htmlFor="city-search">Search city</Label>
        <Input
          id="city-search"
          value={query}
          onChange={handleChange}
          placeholder="Type a city name..."
          className="mt-1.5"
        />
      </div>
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((city, i) => (
            <Button
              key={i}
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleSelect(city)}
            >
              {cityLabel(city)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function UnitPicker() {
  const [unit, setUnit] = useState<TemperatureUnit>(getSavedUnit())

  const handleChange = (value: string) => {
    const v = value as TemperatureUnit
    setUnit(v)
    saveUnit(v)
    void refreshWeather()
  }

  return (
    <RadioGroup value={unit} onValueChange={handleChange} className="flex gap-6">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="celsius" id="unit-c" />
        <Label htmlFor="unit-c">°C</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="fahrenheit" id="unit-f" />
        <Label htmlFor="unit-f">°F</Label>
      </div>
    </RadioGroup>
  )
}

function SettingsPanel() {
  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>City</CardTitle>
          <CardDescription>
            Search and select the city for your weather forecast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CitySearch />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Temperature unit</CardTitle>
        </CardHeader>
        <CardContent>
          <UnitPicker />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => document.getElementById('connectBtn')?.click()}>
            Connect glasses
          </Button>
          <Button variant="outline" className="w-full" onClick={() => void refreshWeather()}>
            Refresh forecast
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
