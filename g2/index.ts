import { createWeatherActions } from './main'
import type { AppModule } from '../_shared/app-types'

export const app: AppModule = {
  id: 'weather',
  name: 'Weather',
  pageTitle: 'Settings',
  connectLabel: 'Connect glasses',
  actionLabel: 'Refresh',
  initialStatus: 'Weather ready',
  createActions: createWeatherActions,
}

export default app
