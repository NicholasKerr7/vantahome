import { parseDeviceEditingRequest } from '../../../packages/home-scene/src/deviceEditingNavigation';
import React, { useCallback, useEffect, useRef } from 'react';
import { consumeHomeChromeCommand, consumeScenePreviewCommand, parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { parseScenePreviewReport } from '../../../packages/home-scene/src/scenePreviewProtocol';
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
import { useHomeStore } from '../../store/useHomeStore';
import { homeEditorScope } from '../home-shell/homeEditorScope';

/** Keep an optional save-status callback stable when callers do not display it. */
const ignoreSaveStatus = () => undefined;

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, onDeviceEdit, onChromeSnapshot, chromeCommand, previewCommand, onPreviewReport, allowChromePreferencesWhileSuspended = false, suspended = false }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const documentReady = useRef(false);
  const consumedCommand = useRef(0);
  const consumedPreview = useRef(0);
  const publishedPreferences = useRef<string | null>(null);
  const publishPreferences = useRef<(force?: boolean) => void>(() => undefined);
  /** Stable deliveries reconnect permissions without navigating or replacing this iframe. */
  const deliverSnapshot = useCallback((message: SimulationSnapshotMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
    publishPreferences.current();
  }, []);
  const deliverCatalog = useCallback((message: SceneCatalogMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
  }, []);
  const simulation = useSceneSimulationSession(deliverSnapshot, deliverCatalog, onSaveStatus);
  const chromePreferences = useHomeChromePreferences();
  const tempUnit = useHomeStore((state) => state.profile.tempUnit === 'F' ? 'F' : 'C');
  const preferenceScope = useHomeStore(homeEditorScope);
  const chromePreferencesRef = useRef<typeof chromePreferences & { tempUnit: 'C' | 'F' }>({ ...chromePreferences, tempUnit });
  chromePreferencesRef.current = { ...chromePreferences, tempUnit };
  /** Hydrated snapshots can arrive after a scope effect; publish the latest verified preferences once. */
  publishPreferences.current = (force = false) => {
    const preference = chromePreferencesRef.current;
    if (!frame.current?.contentWindow || !preference.ready || !simulation.current?.canNavigate()) return;
    const message = homeChromePreferencesMessage(preference.idleEnabled, preference.preferenceError, preference.tempUnit);
    const publication = JSON.stringify([preferenceScope, message]);
    if (!force && publishedPreferences.current === publication) return;
    publishedPreferences.current = publication;
    frame.current.contentWindow.postMessage(message, '*');
  };
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
    publishPreferences.current(true);
    frame.current?.contentWindow?.postMessage(weatherConfiguration.current, '*');
  }, [simulation]);
  useEffect(publishPresentation, [publishPresentation, suspended, propertyWeather.location, propertyWeather.configured, propertyWeather.loading, propertyWeather.canManage]);
  useEffect(() => {
    // Reapply after fresh membership as well as unit changes; this never replaces the document.
    publishPreferences.current();
  }, [chromePreferences.ready, chromePreferences.idleEnabled, chromePreferences.preferenceError, tempUnit, preferenceScope, simulation]);
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
    const message = consumeScenePreviewCommand(previewCommand, consumedPreview, {
      ready: documentReady.current, canNavigate: simulation.current?.canNavigate() === true, suspended,
    });
    if (message) frame.current?.contentWindow?.postMessage(message, '*');
  }, [previewCommand, suspended, simulation]);
  useEffect(() => {
    /** Accept messages only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const preview = parseScenePreviewReport(event.data);
      if (preview) {
        if (simulation.current?.canNavigate()) onPreviewReport?.(preview);
        return;
      }
      const chrome = parseHomeChromeSnapshot(event.data);
      if (chrome) {
        if (simulation.current?.canNavigate()) onChromeSnapshot?.(chrome.snapshot);
        return;
      }
      const status = parseSceneStatus(event.data);
      const navigation = parseRoutineNavigation(event.data);
      const editing = parseDeviceEditingRequest(event.data);
      if (status) { documentReady.current = status === 'ready'; onStatus(status); publishPresentation(); }
      else if (editing) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceEdit?.(editing.deviceId);
      }
      else if (navigation) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceRoutines?.(navigation.deviceId);
      }
      else simulation.current?.handleMessage(event.data);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatus, onDeviceRoutines, onDeviceEdit, onChromeSnapshot, onPreviewReport, publishPresentation, simulation]);
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
