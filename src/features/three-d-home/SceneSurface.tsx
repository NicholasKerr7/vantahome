import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { WebView } from 'react-native-webview';
import { isAllowedSceneNavigation, parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { prepareNativeScene } from './prepareNativeScene';
import { NativeWeatherBroker, nativeWeatherResponseScript } from './nativeWeather';
import { SimulationSession, nativeSimulationSnapshotScript } from './simulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import { nativeScenePresentationScript } from '../../../packages/home-scene/src/scenePresentation';
import { nativeSceneCatalogScript } from './modelSceneCatalog';

/** Keep the optional persistence notification from restarting a simulation session. */
const ignoreSaveStatus = () => undefined;

/** Load a packaged simulation without sharing cookies, tokens or real device commands. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, suspended = false }: SceneSurfaceProps) {
  const [uri, setUri] = useState<string | null>(null);
  const webView = useRef<WebView>(null);
  const weather = useRef<NativeWeatherBroker | null>(null);
  const simulation = useRef<SimulationSession | null>(null);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  /** Reapply current presentation state after a document load without reconnecting device controls. */
  const publishPresentation = useCallback(() => {
    webView.current?.injectJavaScript(nativeScenePresentationScript(suspendedRef.current));
  }, []);
  useEffect(publishPresentation, [publishPresentation, suspended]);
  useEffect(() => {
    const session = new SimulationSession((message) => {
      webView.current?.injectJavaScript(nativeSimulationSnapshotScript(message));
    }, onSaveStatus, { onSceneCatalog: (message) => webView.current?.injectJavaScript(nativeSceneCatalogScript(message)) });
    simulation.current = session;
    return () => { session.dispose(); simulation.current = null; };
  }, [onSaveStatus]);
  useEffect(() => {
    const broker = new NativeWeatherBroker((response) => {
      webView.current?.injectJavaScript(nativeWeatherResponseScript(response));
    });
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
  if (!uri) return null;
  return <WebView
    ref={webView}
    style={styles.surface}
    source={{ uri }}
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
      else if (navigation) onDeviceRoutines?.(navigation.deviceId);
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
