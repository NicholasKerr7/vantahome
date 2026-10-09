import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { WebView } from 'react-native-webview';
import { consumeHomeChromeCommand, isAllowedSceneNavigation, isCurrentSceneDocument, parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { prepareNativeScene } from './prepareNativeScene';
import { NativeWeatherBroker, nativeWeatherResponseScript } from './nativeWeather';
import { nativeSimulationSnapshotScript } from './simulationSession';
import { useSceneSimulationSession } from './useSceneSimulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import { nativeScenePresentationScript } from '../../../packages/home-scene/src/scenePresentation';
import { nativeSceneCatalogScript } from './modelSceneCatalog';
import type { SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { SceneCatalogMessage } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import { useHomeWeatherSettings } from '../weather-settings/useHomeWeatherSettings';
import { EMPTY_WEATHER_CONFIGURATION, WEATHER_CONFIGURATION_CHANNEL, nativePropertyWeatherScript, type PropertyWeatherConfiguration } from '../../../packages/home-scene/src/environment/propertyWeatherConfiguration';
import { homeChromePreferencesMessage, nativeHomeChromeCommandScript, nativeHomeChromePreferencesScript, parseHomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';
import { useHomeChromePreferences } from './useHomeChromePreferences';

/** Keep the optional persistence notification from restarting a simulation session. */
const ignoreSaveStatus = () => undefined;

/** Load a packaged simulation without sharing cookies, tokens or real device commands. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, onChromeSnapshot, chromeCommand, allowChromePreferencesWhileSuspended = false, suspended = false }: SceneSurfaceProps) {
  const [uri, setUri] = useState<string | null>(null);
  const source = useMemo(() => uri ? { uri } : undefined, [uri]);
  const webView = useRef<WebView>(null);
  const weather = useRef<NativeWeatherBroker | null>(null);
  const documentReady = useRef(false);
  const consumedCommand = useRef(0);
  /** Stable delivery callbacks let authorization reconnect without rebuilding the WebView. */
  const deliverSnapshot = useCallback((message: SimulationSnapshotMessage) => {
    webView.current?.injectJavaScript(nativeSimulationSnapshotScript(message));
  }, []);
  const deliverCatalog = useCallback((message: SceneCatalogMessage) => {
    webView.current?.injectJavaScript(nativeSceneCatalogScript(message));
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
  /** Reapply current presentation state after a document load without reconnecting device controls. */
  const publishPresentation = useCallback(() => {
    weather.current?.setLocation(weatherConfiguration.current.location);
    const preference = chromePreferencesRef.current;
    const preferenceScript = preference.ready && simulation.current?.canNavigate()
      ? nativeHomeChromePreferencesScript(homeChromePreferencesMessage(preference.idleEnabled, preference.preferenceError)) : '';
    webView.current?.injectJavaScript(nativeScenePresentationScript(suspendedRef.current) + nativePropertyWeatherScript(weatherConfiguration.current) + preferenceScript);
  }, [simulation]);
  useEffect(publishPresentation, [publishPresentation, suspended, propertyWeather.location, propertyWeather.configured, propertyWeather.loading, propertyWeather.canManage]);
  useEffect(() => {
    if (chromePreferences.ready && simulation.current?.canNavigate()) webView.current?.injectJavaScript(nativeHomeChromePreferencesScript(homeChromePreferencesMessage(chromePreferences.idleEnabled, chromePreferences.preferenceError)));
  }, [chromePreferences.ready, chromePreferences.idleEnabled, chromePreferences.preferenceError, simulation]);
  useEffect(() => {
    const message = consumeHomeChromeCommand(chromeCommand, consumedCommand, {
      ready: documentReady.current && chromePreferences.ready, canNavigate: simulation.current?.canNavigate() === true,
      suspended, allowPreferencesWhileSuspended: allowChromePreferencesWhileSuspended,
    });
    // Publish the cover state first when one tap closes a native panel and opens scene details.
    if (message?.command.type === 'set-tour') chromePreferences.save(message.command.enabled);
    else if (message) webView.current?.injectJavaScript(nativeHomeChromeCommandScript(message));
  }, [chromeCommand, suspended, allowChromePreferencesWhileSuspended, chromePreferences.ready, chromePreferences.save, simulation]);
  useEffect(() => {
    const broker = new NativeWeatherBroker((response) => {
      webView.current?.injectJavaScript(nativeWeatherResponseScript(response));
    }, { location: weatherConfiguration.current.location });
    weather.current = broker;
    return () => { broker.dispose(); weather.current = null; };
  }, []);
  useEffect(() => {
    let active = true;
    void prepareNativeScene().then((documentUri) => {
      if (active) setUri(documentUri);
    }).catch(() => { if (active) onStatus('error'); });
    return () => { active = false; };
  }, [onStatus]);
  if (!uri || !source) return null;
  return <WebView
    ref={webView}
    style={styles.surface}
    source={source}
    originWhitelist={['*']}
    allowingReadAccessToURL={uri}
    allowFileAccess
    allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false}
    onShouldStartLoadWithRequest={(request) => isAllowedSceneNavigation(request.url, uri)}
    onMessage={(event) => {
      const chrome = parseHomeChromeSnapshot(event.nativeEvent.data);
      if (chrome) {
        if (isCurrentSceneDocument(event.nativeEvent.url, uri) && simulation.current?.canNavigate()) onChromeSnapshot?.(chrome.snapshot);
        return;
      }
      const status = parseSceneStatus(event.nativeEvent.data);
      const navigation = parseRoutineNavigation(event.nativeEvent.data);
      if (status) {
        documentReady.current = status === 'ready' && isCurrentSceneDocument(event.nativeEvent.url, uri);
        onStatus(status); publishPresentation();
      }
      else if (navigation) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceRoutines?.(navigation.deviceId);
      }
      else if (!simulation.current?.handleMessage(event.nativeEvent.data)) weather.current?.handleMessage(event.nativeEvent.data);
    }}
    onError={() => { documentReady.current = false; onStatus('error'); }}
    onHttpError={() => { documentReady.current = false; onStatus('error'); }}
    onContentProcessDidTerminate={() => { documentReady.current = false; onStatus('error'); }}
    onRenderProcessGone={() => { documentReady.current = false; onStatus('error'); }}
    onLoadStart={() => { documentReady.current = false; }}
    onLoadEnd={publishPresentation}
    javaScriptEnabled
    domStorageEnabled={false}
    sharedCookiesEnabled={false}
    thirdPartyCookiesEnabled={false}
    incognito
    mixedContentMode="never"
    javaScriptCanOpenWindowsAutomatically={false}
    setSupportMultipleWindows={false}
    bounces={false}
    overScrollMode="never"
    scrollEnabled={false}
    accessibilityLabel="3D Home simulation"
  />;
}

const styles = StyleSheet.create({ surface: { flex: 1, backgroundColor: theme.colors.bg0 } });
