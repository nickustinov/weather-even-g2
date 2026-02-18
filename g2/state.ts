import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

export type City = {
  name: string
  country: string
  latitude: number
  longitude: number
}

export type HourlyPoint = {
  time: string
  temp: number
  wmoCode: number
  precipProb: number
  precipMm: number
  windSpeed: number
  windDir: number
  windGust: number
}

export type DailyPoint = {
  day: string
  wmoCode: number
  tempMax: number
  tempMin: number
  precipProb: number
  precipSum: number
  windMax: number
  uvMax: number
  sunshineHours: number
}

export type WeatherData = {
  city: string
  currentTemp: number
  currentWmoCode: number
  currentDescription: string
  feelsLike: number
  windSpeed: number
  windDirection: number
  humidity: number
  pressure: number
  sunrise: string
  sunset: string
  hourly: HourlyPoint[]
  daily: DailyPoint[]
}

export const SCREENS = ['forecast', 'now', 'rain', 'wind', 'hours'] as const
export type Screen = (typeof SCREENS)[number]

export type State = {
  screen: Screen
  screenIndex: number
  startupRendered: boolean
  weather: WeatherData | null
}

export const state: State = {
  screen: 'forecast',
  screenIndex: 0,
  startupRendered: false,
  weather: null,
}

export let bridge: EvenAppBridge | null = null

export function setBridge(b: EvenAppBridge): void {
  bridge = b
}
