import React, { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import ModalCard from './ModalCard';
import Pressable from './Pressable';
import { theme } from '../theme/theme';
import { useHomeStore } from '../store/useHomeStore';
import { dismissFeedback, getFeedback, reconcileFeedback, respondToFeedback, subscribeToFeedback } from '../services/appFeedback';

/** Render confirmations and failures on web, where React Native's Alert is a no-op. */
export function AppFeedbackHost() {
  const message = useSyncExternalStore(subscribeToFeedback, getFeedback, getFeedback);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unsubscribe = useHomeStore.subscribe(reconcileFeedback);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') dismissFeedback();
    });
    return () => { unsubscribe(); subscription?.remove(); dismissFeedback(); };
  }, []);
  if (Platform.OS !== 'web' || !message || !message.isCurrent()) return null;
  return (
    <ModalCard visible onRequestClose={dismissFeedback} animationType="none"
      backdropAccessibilityLabel="Dismiss message" colors={[theme.colors.surface, theme.colors.surface]}
      cardStyle={styles.card}>
      <ScrollView bounces={false} overScrollMode="never" style={styles.body} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{message.title}</Text>
        {message.message ? <Text style={styles.message}>{message.message}</Text> : null}
      </ScrollView>
      <View style={styles.actions}>
        {message.buttons.map((button, index) => (
          <Pressable key={index} accessibilityRole="button" accessibilityLabel={button.text || 'OK'}
            onPress={() => respondToFeedback(message, button)}
            style={[styles.button, button.style === 'cancel' && styles.cancel]}>
            <Text style={[styles.buttonText, button.style === 'destructive' && styles.destructive]}>{button.text || 'OK'}</Text>
          </Pressable>
        ))}
      </View>
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderColor: theme.colors.stroke },
  body: { flexShrink: 1 },
  content: { padding: 24, gap: 12 },
  title: { color: theme.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '600' },
  message: { color: theme.colors.subtext, fontSize: 15, lineHeight: 23 },
  actions: { paddingHorizontal: 24, paddingBottom: 24, gap: 10, flexDirection: 'row', flexWrap: 'wrap' },
  button: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, backgroundColor: theme.colors.card, justifyContent: 'center', alignItems: 'center', flexGrow: 1 },
  cancel: { backgroundColor: theme.colors.card2 },
  buttonText: { color: theme.colors.accentText, fontSize: 15, fontWeight: '600' },
  destructive: { color: theme.colors.alarmText },
});
