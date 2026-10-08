import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { WebView } from 'react-native-webview';
import { isAllowedSceneNavigation, parseSceneStatus, type SceneSurfaceProps } from './protocol';
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

/** Keep the optional persistence notification from restarting a simulation session. */
const ignoreSaveStatus = () => undefined;

/** Load a packaged simulation without sharing cookies, tokens or real device commands. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, suspended = false }: SceneSurfaceProps) {
  const [uri, setUri] = useState<string | null>(null);
  const source = useMemo(() => uri ? { uri } : undefined, [uri]);
  const webView = useRef<WebView>(null);
  const weather = useRef<NativeWeatherBroker | null>(null);
  /** Stable delivery callbacks let authorization reconnect without rebuilding the WebView. */
  const deliverSnapshot = useCallback((message: SimulationSnapshotMessage) => {
    webView.current?.injectJavaScript(nativeSimulationSnapshotScript(message));
  }, []);
  const deliverCatalog = useCallback((message: SceneCatalogMessage) => {
    webView.current?.injectJavaScript(nativeSceneCatalogScript(message));
  }, []);
  const simulation = useSceneSimulationSession(deliverSnapshot, deliverCatalog, onSaveStatus);
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
    webView.current?.injectJavaScript(nativeScenePresentationScript(suspendedRef.current) + nativePropertyWeatherScript(weatherConfiguration.current));
  }, []);
  useEffect(publishPresentation, [publishPresentation, suspended, propertyWeather.location, propertyWeather.configured, propertyWeather.loading, propertyWeather.canManage]);
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
      const status = parseSceneStatus(event.nativeEvent.data);
      const navigation = parseRoutineNavigation(event.nativeEvent.data);
      if (status) { onStatus(status); publishPresentation(); }
      else if (navigation) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceRoutines?.(navigation.deviceId);
      }
      else if (!simulation.current?.handleMessage(event.nativeEvent.data)) weather.current?.handleMessage(event.nativeEvent.data);
    }}
    onError={() => onStatus('error')}
    onHttpError={() => onStatus('error')}
    onContentProcessDidTerminate={() => onStatus('error')}
    onRenderProcessGone={() => onStatus('error')}
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
