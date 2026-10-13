import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHomeStore } from '../../store/useHomeStore';

type RouteAccess = { userId: string | null; ready: boolean; credentialSetup: boolean };

/** Keep account recovery navigation independent of home admission and bound to one prepared identity. */
export function useAccountSecurityRoute({ userId, ready, credentialSetup }: RouteAccess) {
  const account = useHomeStore(useShallow((state) => ({
    authenticatedUserId: state.authenticatedUserId,
    accountUserId: state.accountUserId,
    sessionEpoch: state.sessionEpoch,
  })));
  const eligible = Boolean(ready && !credentialSetup && userId
    && account.authenticatedUserId === userId && account.accountUserId === userId);
  const key = eligible ? JSON.stringify([userId, account.sessionEpoch]) : null;
  const availableKey = useRef(key);
  availableKey.current = key;
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    if (requested !== null && requested !== key) setRequested(null);
  }, [key, requested]);

  /** Recheck the prepared identity before opening a route from a retained UI callback. */
  function open() {
    const current = useHomeStore.getState();
    if (key && availableKey.current === key && current.authenticatedUserId === userId && current.accountUserId === userId
      && current.sessionEpoch === account.sessionEpoch) setRequested(key);
  }

  return { eligible, isOpen: key !== null && requested === key, open,
    close: () => setRequested((previous) => previous === key ? null : previous) };
}
