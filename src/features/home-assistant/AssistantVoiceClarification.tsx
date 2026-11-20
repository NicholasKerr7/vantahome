import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Pressable from '../../components/Pressable';
import { assistantVoiceClarificationStyles as styles } from './assistantVoiceClarificationStyles';

type Props = {
  question: string;
  choices: readonly { id: string; label: string; reply: string }[];
  disabled?: boolean;
  onChoose: (reply: string) => void;
  onCancel: () => void;
};

/** Offer the permitted room replies without executing or interpreting a device command. */
export default function AssistantVoiceClarification({ question, choices, disabled = false, onChoose, onCancel }: Props) {
  return <View style={styles.card} testID="assistant-voice-clarification">
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.title}>Choose a room or device</Text>
        <Text style={styles.status}>Nothing changed</Text>
      </View>
      <Pressable accessibilityLabel="Cancel room choice" onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.question}>{question}</Text>
    <ScrollView horizontal style={styles.choicesViewport} contentContainerStyle={styles.choices}
      showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never"
      directionalLockEnabled decelerationRate="normal" keyboardShouldPersistTaps="handled">
      {choices.map((choice) => <Pressable key={choice.id} accessibilityLabel={`Choose ${choice.label}`}
        disabled={disabled} accessibilityState={{ disabled }} onPress={() => onChoose(choice.reply)}
        style={[styles.choice, disabled && styles.disabled]}>
        <Text numberOfLines={1} style={styles.choiceText}>{choice.label}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}
