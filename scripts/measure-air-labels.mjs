import { getTextWidth } from '@evenrealities/pretext'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', 'g2', 'locales')

// Container budget: CHART_TOTAL_W = 216, paddingLength = 4 each side → 208px
// usable. LVGL shows the scrollbar/wrap once content exceeds the inner area.
const USABLE_PX = 216 - 4 * 2

const EU_KEYS = ['good', 'fair', 'moderate', 'poor', 'very_poor', 'extremely_poor']
const US_KEYS = ['good', 'moderate', 'unhealthy_sensitive', 'unhealthy', 'very_unhealthy', 'hazardous']

const rows = []
for (const f of readdirSync(localesDir).sort()) {
  if (!f.endsWith('.json')) continue
  const locale = f.replace('.json', '')
  const dict = JSON.parse(readFileSync(join(localesDir, f), 'utf8'))
  const title = dict.glasses.label_air_quality
  const eu = EU_KEYS.map(k => dict.aqi_category[k])
  const us = US_KEYS.map(k => dict.us_aqi_category[k])
  for (const cat of [...eu, ...us]) {
    rows.push({ locale, text: cat, px: getTextWidth(cat) })
  }
}

rows.sort((a, b) => b.px - a.px)

console.log(`Usable width: ${USABLE_PX}px (CHART_TOTAL_W=216, padding=4 each)\n`)
console.log('TOP 15 WIDEST:')
for (const r of rows.slice(0, 15)) {
  const flag = r.px > USABLE_PX ? '  ✗ OVERFLOW' : ''
  console.log(`  ${String(r.px).padStart(4)}px  [${r.locale}]  "${r.text}"${flag}`)
}

const overflow = rows.filter(r => r.px > USABLE_PX)
console.log(`\nOverflowing combinations: ${overflow.length} / ${rows.length}`)
