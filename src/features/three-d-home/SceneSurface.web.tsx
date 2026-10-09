import React, { useCallback, useEffect, useRef } from 'react';
import { consumeHomeChromeCommand, parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { useSceneSimulationSession } from './useSceneSimulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import { scenePresentationMessage } from '../../../packages/home-scene/src/scenePresentation';
import type { SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { SceneCatalogMessage } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import { useHomeWeatherSettings } from '../weather-settings/useHomeWeatherSettings';
import { EMPTY_WEATHER_CONFIGURATION, WEATHER_CONFIGURATION_CHANNEL, type PropertyWeatherConfiguration } from '../../../packages/home-scene/src/environment/propertyWeatherConfiguration';
import './scene-surface.css';
import { homeChromePreferencesMessage, parseHomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';
import { useHomeChromePreferences } from './useHomeChromePreferences';

/** Keep an optional save-status callback stable when callers do not display it. */
const ignoreSaveStatus = () => undefined;

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, onChromeSnapshot, chromeCommand, allowChromePreferencesWhileSuspended = false, suspended = false }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const documentReady = useRef(false);
  const consumedCommand = useRef(0);
  /** Stable deliveries reconnect permissions without navigating or replacing this iframe. */
  const deliverSnapshot = useCallback((message: SimulationSnapshotMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
  }, []);
  const deliverCatalog = useCallback((message: SceneCatalogMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
  }, []);
  const simulation = useSceneSimulationSession(deliverSnapshot, deliverCatalog, onSaveStatus);
  const chromePreferences = useHomeChromePreferences();
  const chromePreferencesRef = useRef(chromePreferences);
  chromePreferencesRef.current = chromePreferences;
  const propertyWeather = useHomeWeatherSettings();
  const weatherConfiguration = useRef<PropertyWeatherConfiguration>(EMPTY_WEATHER_CONFIGURATION);
  weatherConfiguration.current = {
    channel: WEATHER_CONFIGURATION_CHANNEL, version: 1,
    location: propertyWeather.location, configured: propertyWeather.configured,
    canManage: propertyWeather.canManage,
    status: propertyWeather.location ? 'ready' : propertyWeather.loading ? 'loading' : 'unavailable',
  };
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  /** Send again after document readiness so an early covering panel cannot lose its pause. */
  const publishPresentation = useCallback(() => {
    frame.current?.contentWindow?.postMessage(scenePresentationMessage(suspendedRef.current), '*');
    const preference = chromePreferencesRef.current;
    if (preference.ready && simulation.current?.canNavigate()) frame.current?.contentWindow?.postMessage(homeChromePreferencesMessage(preference.idleEnabled, preference.preferenceError), '*');
    frame.current?.contentWindow?.postMessage(weatherConfiguration.current, '*');
  }, [simulation]);
  useEffect(publishPresentation, [publishPresentation, suspended, propertyWeather.location, propertyWeather.configured, propertyWeather.loading, propertyWeather.canManage]);
  useEffect(() => {
    if (chromePreferences.ready && simulation.current?.canNavigate()) frame.current?.contentWindow?.postMessage(homeChromePreferencesMessage(chromePreferences.idleEnabled, chromePreferences.preferenceError), '*');
  }, [chromePreferences.ready, chromePreferences.idleEnabled, chromePreferences.preferenceError, simulation]);
  useEffect(() => {
    const message = consumeHomeChromeCommand(chromeCommand, consumedCommand, {
      ready: documentReady.current && chromePreferences.ready, canNavigate: simulation.current?.canNavigate() === true,
      suspended, allowPreferencesWhileSuspended: allowChromePreferencesWhileSuspended,
    });
    // Parent messages are ordered so the renderer resumes before an explicit detail-opening intent.
    if (message?.command.type === 'set-tour') chromePreferences.save(message.command.enabled);
    else if (message) frame.current?.contentWindow?.postMessage(message, '*');
  }, [chromeCommand, suspended, allowChromePreferencesWhileSuspended, chromePreferences.ready, chromePreferences.save, simulation]);
  useEffect(() => {
    /** Accept messages only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const chrome = parseHomeChromeSnapshot(event.data);
      if (chrome) {
        if (simulation.current?.canNavigate()) onChromeSnapshot?.(chrome.snapshot);
        return;
      }
      const status = parseSceneStatus(event.data);
      const navigation = parseRoutineNavigation(event.data);
      if (status) { documentReady.current = status === 'ready'; onStatus(status); publishPresentation(); }
      else if (navigation) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceRoutines?.(navigation.deviceId);
      }
      else simulation.current?.handleMessage(event.data);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatus, onDeviceRoutines, onChromeSnapshot, publishPresentation, simulation]);
  return <iframe
    ref={frame}
    className="vantahome-scene-frame"
    title="3D Home simulation"
    src="/home-scene/embedded.html"
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
    onLoad={publishPresentation}
    onError={() => { documentReady.current = false; onStatus('error'); }}
  />;
}
