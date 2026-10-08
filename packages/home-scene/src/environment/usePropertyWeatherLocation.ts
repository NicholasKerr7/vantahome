import { useEffect, useSyncExternalStore } from 'react';
import { isEmbeddedScene } from '../embeddedHost';
import { PROPERTY_LOCATION } from './types';
import { connectPropertyWeatherConfiguration, getPropertyWeatherConfiguration, subscribePropertyWeatherConfiguration } from './propertyWeatherConfiguration';

/** Wait for household settings in embeds; the standalone model retains its explicit town default. */
export function usePropertyWeatherLocation() {
  const embedded = isEmbeddedScene();
  const config = useSyncExternalStore(subscribePropertyWeatherConfiguration, getPropertyWeatherConfiguration, getPropertyWeatherConfiguration);
  useEffect(() => embedded ? connectPropertyWeatherConfiguration(window) : undefined, [embedded]);
  return {
    location: embedded ? config.location ?? PROPERTY_LOCATION : PROPERTY_LOCATION,
    ready: !embedded || config.status === 'ready',
    configured: embedded && config.configured,
    canManage: embedded && config.canManage,
    status: embedded ? config.status : 'ready',
  };
}
