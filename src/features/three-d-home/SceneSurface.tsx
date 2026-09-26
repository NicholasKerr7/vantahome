import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { isAllowedSceneNavigation, parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { prepareNativeScene } from './prepareNativeScene';
import { NativeWeatherBroker, nativeWeatherResponseScript } from './nativeWeather';
import { SimulationSession, nativeSimulationSnapshotScript } from './simulationSession';

/** Keep the optional persistence notification from restarting a simulation session. */
const ignoreSaveStatus = () => undefined;

/** Load a packaged simulation without sharing cookies, tokens or real device commands. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus }: SceneSurfaceProps) {
  const [uri, setUri] = useState<string | null>(null);
  const webView = useRef<WebView>(null);
  const weather = useRef<NativeWeatherBroker | null>(null);
  const simulation = useRef<SimulationSession | null>(null);
  useEffect(() => {
    const session = new SimulationSession((message) => {
      webView.current?.injectJavaScript(nativeSimulationSnapshotScript(message));
    }, onSaveStatus);
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
      if (status) onStatus(status);
      else if (!simulation.current?.handleMessage(event.nativeEvent.data)) weather.current?.handleMessage(event.nativeEvent.data);
    }}
    onError={() => onStatus('error')}
    onHttpError={() => onStatus('error')}
    onContentProcessDidTerminate={() => onStatus('error')}
    onRenderProcessGone={() => onStatus('error')}
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

const styles = StyleSheet.create({ surface: { flex: 1, backgroundColor: '#101516' } });
