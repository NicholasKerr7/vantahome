import { useSyncExternalStore } from 'react';
import { useHomeStore } from '../../store/useHomeStore';
import { weatherScopeKey } from '../../services/homeWeatherScope';
import { getRoutineTimeZone, subscribeSharedHomeWeatherSettings } from '../../services/sharedHomeWeatherSettings';

/** Share the executor's verified property timezone without starting another weather request or timer. */
export function useRoutineTimeZone(): string {
  useHomeStore(weatherScopeKey);
  const timeZone = useSyncExternalStore(subscribeSharedHomeWeatherSettings, getRoutineTimeZone, getRoutineTimeZone);
  return timeZone ? `Property time · ${timeZone.replace(/_/g, ' ')}` : 'Property timezone unavailable · Time-based routines paused';
}
