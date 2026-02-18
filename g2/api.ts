import type { City, WeatherData, HourlyPoint, DailyPoint } from './state'

const CITY_KEY = 'weather:city'

export function getSavedCity(): City | null {
  const raw = localStorage.getItem(CITY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as City
  } catch {
    return null
  }
}

export function saveCity(city: City): void {
  localStorage.setItem(CITY_KEY, JSON.stringify(city))
}

export async function searchCities(query: string): Promise<City[]> {
  if (query.length < 2) return []

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as {
    results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>
  }

  return (data.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}

function wmoDescription(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Unknown'
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

type OpenMeteoForecast = {
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    apparent_temperature?: number
    weather_code?: number
    wind_speed_10m?: number
    wind_direction_10m?: number
    surface_pressure?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    weather_code?: number[]
    precipitation_probability?: number[]
    precipitation?: number[]
    wind_speed_10m?: number[]
    wind_direction_10m?: number[]
    wind_gusts_10m?: number[]
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
    precipitation_sum?: number[]
    wind_speed_10m_max?: number[]
    uv_index_max?: number[]
    sunshine_duration?: number[]
    sunrise?: string[]
    sunset?: string[]
  }
}

export async function fetchWeather(city: City): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunshine_duration,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Forecast fetch failed: ${res.status}`)

  const data = (await res.json()) as OpenMeteoForecast
  const current = data.current ?? {}
  const hourly = data.hourly ?? {}
  const daily = data.daily ?? {}

  const now = new Date()
  const hourlyTimes: string[] = hourly.time ?? []
  const startIdx = hourlyTimes.findIndex((t) => new Date(t) >= now)
  const sliceStart = startIdx >= 0 ? startIdx : 0

  const hourlyPoints: HourlyPoint[] = hourlyTimes
    .slice(sliceStart, sliceStart + 24)
    .map((t, i) => {
      const idx = sliceStart + i
      return {
        time: formatTime(t),
        temp: Math.round(hourly.temperature_2m?.[idx] ?? 0),
        wmoCode: hourly.weather_code?.[idx] ?? 0,
        precipProb: hourly.precipitation_probability?.[idx] ?? 0,
        precipMm: hourly.precipitation?.[idx] ?? 0,
        windSpeed: Math.round(hourly.wind_speed_10m?.[idx] ?? 0),
        windDir: Math.round(hourly.wind_direction_10m?.[idx] ?? 0),
        windGust: Math.round(hourly.wind_gusts_10m?.[idx] ?? 0),
      }
    })

  const dailyPoints: DailyPoint[] = (daily.time ?? []).map((t, i) => ({
    day: WEEKDAYS[new Date(t + 'T00:00:00').getDay()],
    wmoCode: daily.weather_code?.[i] ?? 0,
    tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
    tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    precipProb: daily.precipitation_probability_max?.[i] ?? 0,
    precipSum: Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
    windMax: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
    uvMax: Math.round((daily.uv_index_max?.[i] ?? 0) * 10) / 10,
    sunshineHours: Math.round((daily.sunshine_duration?.[i] ?? 0) / 3600 * 10) / 10,
  }))

  const sunriseToday = daily.sunrise?.[0] ?? ''
  const sunsetToday = daily.sunset?.[0] ?? ''

  return {
    city: city.name,
    currentTemp: Math.round(current.temperature_2m ?? 0),
    currentWmoCode: current.weather_code ?? 0,
    currentDescription: wmoDescription(current.weather_code ?? 0),
    feelsLike: Math.round(current.apparent_temperature ?? 0),
    windSpeed: Math.round(current.wind_speed_10m ?? 0),
    windDirection: Math.round(current.wind_direction_10m ?? 0),
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    pressure: Math.round(current.surface_pressure ?? 0),
    sunrise: sunriseToday ? formatTime(sunriseToday) : '',
    sunset: sunsetToday ? formatTime(sunsetToday) : '',
    hourly: hourlyPoints,
    daily: dailyPoints,
  }
}
