import React, { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { DeepScreen } from '../components/deep/DeepScreen';
import { AccountSecurityPage } from '../features/account/AccountSecurityPage';

/** Offer account-only controls without mounting profile, household, or device workspaces. */
export default function AccountSecurityScreen({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => listener.remove();
  }, [onBack]);

  return <DeepScreen title="Security & sessions" eyebrow="YOUR ACCOUNT"
    subtitle="Manage your sign-ins independently of your home access." onBack={onBack}>
    <AccountSecurityPage />
  </DeepScreen>;
}
