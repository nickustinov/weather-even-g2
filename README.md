# Weather Even G2

> See also: [G2 development notes](https://github.com/nickustinov/even-g2-notes/blob/main/G2.md) – hardware specs, UI system, input handling and practical patterns for Even Realities G2.

Weather forecast for [Even Realities G2](https://www.evenrealities.com/) smart glasses, powered by the free [Open-Meteo](https://open-meteo.com/) API (no API key required).

## Features

- **Nine swipeable screens** of forecast data, each user-orderable and individually toggleable from the phone settings.
- **Multiple cities** with an on-glasses tap-to-switch picker.
- **Per-variable units** – pick `°C / °F`, `km/h / mph / m/s`, `mm / in`, `hPa / inHg / mmHg`, `24h / 12h` independently.
- **Pollen** counts and **air quality** sub-screen using Open-Meteo's air-quality endpoint (Europe-only for pollen, AQI everywhere).
- **Phosphor weather icons** rendered to canvas for crisp 4-bit greyscale output.
- **Custom dotted-LED digit font** for big-headline numbers (current temp, current humidity, current UV, EU AQI, today's precipitation, current wind).

## Screens

Default swipe order – every screen can be reordered or hidden in settings:

1. **Today** – current temp (big dotted), feels-like, wind, humidity, pressure, sunrise/sunset, UV
2. **10-day forecast** – day, condition icon, written condition, low, range bar, high
3. **Rain** – next 8 hourly precipitation chance bars + today's total mm/in
4. **Wind** – next 8 hourly wind bars with arrows + current speed + gusts
5. **Humidity** – next 8 hourly relative humidity + dew point + comfort band
6. **UV index** – next 8 hourly UV bars with category labels + protection window
7. **Air quality** – pollen rows (alder, birch, grass, mugwort, olive, ragweed) for European locations, falling back to pollutant rows (pm2.5, pm10, NO2, O3, SO2, CO) elsewhere, with the EU AQI as the big number
8. **Sun & moon** – sunrise/sunset times, day-length progress bar, moon phase with rise/set/distance/next full moon
9. **Hourly** – two columns of 8 hours each: time, weather icon, temperature, precip chance

A single tap on any screen opens a full-screen city picker (when two or more cities are saved). Double-tap shows the system exit dialog.

## Architecture

```
[G2 glasses] <--BLE--> [Even app / webview] <--HTTP--> [Open-Meteo]
```

No backend. The webview calls Open-Meteo directly (free, CORS-enabled). Phone UI and glasses rendering both run in the same webview process, sharing the in-memory cache for cities / unit prefs / screen prefs.

```
g2/
  index.ts          App module registration
  main.ts           Bridge connection + settings UI bootstrap
  app.ts            Lifecycle: initApp, refreshWeather, onForegroundEnter
  state.ts          Types + app state singleton + bridge holder
  api.ts            Open-Meteo geocoding/forecast/air-quality + local storage
  events.ts         SDK event normalisation + tap/swipe routing
  renderer.ts       Screen dispatcher + navigation helpers
  render-shared.ts  Shared chart layout constants + image/text helpers
  dot-digits.ts     Custom 6×7 dotted-cell font used for big headlines
  weather-icons.ts  Phosphor SVG → canvas rasterisation + cache
  moon.ts           Moon phase math + canvas-rendered terminator
  icons.ts          Canvas → 4-bit greyscale byte packing
  layout.ts         Display dimension constants (576 × 288)
  ui.tsx            React settings panel: cities, units, screen order
  screens/          One module per swipable screen (today.ts, forecast.ts, …)

_shared/
  app-types.ts      AppModule contract
  log.ts            Event log helper that writes to #event-log in the phone UI
```

## Navigation

| Input | Action |
|---|---|
| Swipe down | Next screen |
| Swipe up | Previous screen |
| Single tap | Open city picker (when >1 city saved) |
| Double tap | System exit dialog |

## URL query overrides

Useful for previewing edge cases in the simulator without waiting for matching real conditions:

| Param | Effect |
|---|---|
| `temp`, `feels`, `wind`, `gust`, `winddir`, `humidity`, `pressure` | Override current-conditions values |
| `precip`, `hi`, `lo`, `today_hi`, `today_lo` | Override daily forecast values |
| `wmo` | Override current WMO weather code (0=clear, 2=partly cloudy, 3=overcast, 45=fog, 61=rain, 71=snow, 95=thunderstorm) |
| `uv`, `aqi`, `pm25`, `pm10`, `no2`, `o3`, `so2`, `co` | Override UV / air quality values |
| `alder`, `birch`, `grass`, `mugwort`, `olive`, `ragweed` | Override pollen counts |

Example: `?wmo=95&temp=-12&humidity=92` previews a sub-zero stormy day.

## Setup

```bash
npm install
```

### Development server

```bash
npm run dev      # vite, host 0.0.0.0:5173
npm run qr       # QR code pointing at the dev server (scan in the Even app)
```

### Package for distribution

```bash
npm run pack     # creates weather.ehpk for upload
```

## Tech stack

- [Open-Meteo](https://open-meteo.com/) – weather + air quality + geocoding
- [@evenrealities/even_hub_sdk](https://www.npmjs.com/package/@evenrealities/even_hub_sdk) – glasses bridge
- [@evenrealities/pretext](https://www.npmjs.com/package/@evenrealities/pretext) – pixel-accurate firmware-font measurement
- [even-toolkit](https://www.npmjs.com/package/even-toolkit) – settings UI primitives (Checkbox, SearchBar, SegmentedControl, Select)
- [@phosphor-icons/core](https://phosphoricons.com/) – weather icon SVGs
- [suncalc](https://github.com/mourner/suncalc) – moon rise/set/distance/phase
- [Tailwind CSS v4](https://tailwindcss.com/) – settings-panel utility classes
- [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
