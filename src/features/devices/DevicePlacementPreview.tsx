import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { prepareNativeScene } from '../three-d-home/prepareNativeScene';
import { isAllowedSceneNavigation, isCurrentSceneDocument } from '../three-d-home/protocol';
import { getRuntimePlacements } from '../../../packages/home-scene/src/devicePlacement';
import { nativePlacementScript, parsePlacementMessage, PLACEMENT_CHANNEL } from '../../../packages/home-scene/src/placement/placementProtocol';
import { theme } from '../../theme/theme';
import Pressable from '../../components/Pressable';
import type { DevicePlacementPreviewProps } from './devicePlacementPreviewTypes';
import { usePlacementPreviewReadiness } from './usePlacementPreviewReadiness';

/** Mount an isolated, on-demand 3D editor; only validated placement drafts can return to the wizard. */
export default function DevicePlacementPreview({ placement, onChange, disabled = false }: DevicePlacementPreviewProps) {
  const frame = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = usePlacementPreviewReadiness(attempt, placement.modelRoomId);
  const current = useRef({ placement, onChange, disabled });
  current.current = { placement, onChange, disabled };
  const source = useMemo(() => uri ? { uri } : undefined, [uri]);
  const publish = useCallback(() => {
    const draft = current.current;
    frame.current?.injectJavaScript(nativePlacementScript({ channel: PLACEMENT_CHANNEL, version: 1, type: 'configure', placement: draft.placement, disabled: draft.disabled, devices: getRuntimePlacements() }));
  }, []);
  useEffect(() => {
    let active = true;
    void prepareNativeScene().then((value) => { if (active) setUri(`${value}#placement`); }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(publish, [publish, placement, disabled]);
  return <View style={styles.container}>
    {source && uri && <WebView key={attempt} ref={frame} source={source} style={styles.surface}
      originWhitelist={['*']} allowingReadAccessToURL={uri.split('#')[0]} allowFileAccess
      allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      onShouldStartLoadWithRequest={(request) => isAllowedSceneNavigation(request.url, uri.split('#')[0]!)}
      onMessage={(event) => {
        if (!isCurrentSceneDocument(event.nativeEvent.url, uri.split('#')[0]!)) return;
        const message = parsePlacementMessage(event.nativeEvent.data);
        if (message?.type === 'ready') publish();
        else if (message?.type === 'rendered') setStatus('ready');
        else if (message?.type === 'error') setStatus('error');
        else if (message?.type === 'change' && !current.current.disabled
          && message.placement.templateId === current.current.placement.templateId
          && message.placement.modelRoomId === current.current.placement.modelRoomId) current.current.onChange(message.placement);
      }}
      onLoadEnd={publish} onError={() => setStatus('error')} onContentProcessDidTerminate={() => setStatus('error')} onRenderProcessGone={() => setStatus('error')}
      javaScriptEnabled domStorageEnabled={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito
      mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
      bounces={false} overScrollMode="never" scrollEnabled={false} accessibilityLabel="Device placement preview" />}
    {status !== 'ready' && <View style={styles.cover}>
      {status === 'loading' ? <><ActivityIndicator color={theme.colors.accent} /><Text style={styles.caption}>Preparing your room…</Text></>
        : <><Text style={styles.caption}>The placement preview could not load.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry placement preview" onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.caption}>Try again</Text></Pressable></>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.bg0 },
  surface: { flex: 1, backgroundColor: theme.colors.bg0 },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, backgroundColor: theme.colors.bg0 },
  caption: { color: theme.colors.text, fontSize: 13, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, backgroundColor: theme.colors.card2 },
});
