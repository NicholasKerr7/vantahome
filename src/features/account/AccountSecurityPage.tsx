import React, { useState } from 'react';
import { View } from 'react-native';
import { DeepTabs } from '../../components/deep/DeepScreen';
import { householdStyles as styles } from '../household/householdStyles';
import { AccountSessionsPanel } from './AccountSessionsPanel';
import { AccountRecoveryPanel } from './AccountRecoveryPanel';

const SECTIONS = [
  { id: 'sessions', label: 'Sessions', icon: 'shield-checkmark-outline' },
  { id: 'recovery', label: 'Password recovery', icon: 'key-outline' },
] as const;

/** Separate private sign-in inventory from deliberate email recovery within one bounded workspace. */
export function AccountSecurityPage() {
  const [section, setSection] = useState<'sessions' | 'recovery'>('sessions');
  return <View style={styles.body}>
    <DeepTabs items={SECTIONS} selectedId={section} onSelect={setSection} />
    {section === 'sessions' ? <AccountSessionsPanel /> : <AccountRecoveryPanel />}
  </View>;
}
