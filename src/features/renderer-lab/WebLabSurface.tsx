import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { theme } from '../../theme/theme';
import { isAllowedSceneNavigation } from '../three-d-home/protocol';
import { labSettingsScript, parseLabEvent, type LabSurfaceProps, type LabView } from './protocol';

/** Materialize the bundled comparison afresh so app updates never reuse stale HTML. */
async function prepareComparison(view: LabView): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Scene cache is unavailable.');
  const asset = await Asset.fromModule(view === 'bedroom'
    ? require('../../../assets/renderer-lab/comparison-bedroom.vhscene')
    : require('../../../assets/renderer-lab/comparison-property.vhscene')).downloadAsync();
  if (!asset.localUri) throw new Error('The bundled comparison is unavailable.');
  const directory = `${FileSystem.cacheDirectory}renderer-lab/${asset.hash ?? 'preview'}/`;
  const uri = `${directory}index.html`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.copyAsync({ from: asset.localUri, to: uri });
  return uri;
}

/** Run the same prototype assets through the app's existing WebView rendering technology. */
export default function WebLabSurface({ settings, onEvent }: LabSurfaceProps) {
  const webView = useRef<WebView>(null);
  const latest = useRef(settings);
  latest.current = settings;
  const [uri, setUri] = useState<string>();
  useEffect(() => {
    let mounted = true;
    void prepareComparison(settings.view).then((documentUri) => {
      if (mounted) setUri(documentUri);
    }).catch(() => { if (mounted) onEvent({ type: 'error', message: 'The bundled comparison could not load.' }); });
    return () => { mounted = false; };
  }, [onEvent, settings.view]);
  useEffect(() => { webView.current?.injectJavaScript(labSettingsScript(settings)); }, [settings]);
  if (!uri) return null;
  return <WebView ref={webView} style={styles.surface} source={{ uri: `${uri}#${settings.view}` }}
    onLoadEnd={() => webView.current?.injectJavaScript(labSettingsScript(latest.current))}
    onMessage={({ nativeEvent }) => {
      const event = parseLabEvent(nativeEvent.data);
      if (event?.type === 'ready') webView.current?.injectJavaScript(labSettingsScript(latest.current));
      if (event) onEvent(event);
    }}
    onError={() => onEvent({ type: 'error', message: 'The WebView could not load.' })}
    onContentProcessDidTerminate={() => onEvent({ type: 'error', message: 'The WebView stopped. Try again.' })}
    onRenderProcessGone={() => onEvent({ type: 'error', message: 'The WebView stopped. Try again.' })}
    onShouldStartLoadWithRequest={(request) => isAllowedSceneNavigation(request.url, uri)}
    originWhitelist={['*']} allowingReadAccessToURL={uri} allowFileAccess
    allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    javaScriptEnabled domStorageEnabled={false} incognito mixedContentMode="never"
    sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} javaScriptCanOpenWindowsAutomatically={false}
    setSupportMultipleWindows={false} bounces={false} overScrollMode="never" scrollEnabled={false}
    accessibilityLabel="Three.js renderer comparison. Drag to orbit and pinch to zoom." />;
}

const styles = StyleSheet.create({ surface: { flex: 1, backgroundColor: theme.colors.bg0 } });
