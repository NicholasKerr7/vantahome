import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeAuthCallbackUri } from '../../config/authRedirects';
import { isValidInvitationCode } from '../../config/invitationCode';
import { supabase } from '../../services/supabaseClient';
import { beginAuthFlow, cancelAuthFlow, completeAuthCallback, verifyInvitationCode, waitForAuthExchange } from '../../services/authFlow';
import { fetchAuthProviderAvailability, type AuthProviderAvailability } from '../../services/authProviderAvailability';

export type EntryMode = 'login' | 'invite' | 'owner' | 'recovery';
export type AuthEntryProps = {
  initialMode?: 'login' | 'invite';
  onInvitationRequested?: () => void;
  onInvitationEnrollmentChange?: (active: boolean) => void;
  preview?: boolean;
  onClose?: () => void;
};

/** Coordinate explicit account entry without creating homes or accepting membership implicitly. */
export function useAuthEntry({ initialMode = 'login', preview = false, onInvitationRequested, onInvitationEnrollmentChange }: AuthEntryProps) {
  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [ownerPasswordStep, setOwnerPasswordStep] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [providers, setProviders] = useState<AuthProviderAvailability>({ apple: false, google: false, signupAllowed: false });
  const operation = useRef(false);
  const mounted = useRef(true);
  const configured = Boolean(supabase) && !preview;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 320;
  const detailsValid = name.trim().length >= 2 && name.trim().length <= 120 && emailValid;
  const canSubmit = configured && !busy && emailValid && (
    mode === 'recovery' || (mode === 'invite' ? isValidInvitationCode(code) : mode === 'owner' ? providers.signupAllowed && detailsValid && password.length >= 8 && password === confirm : password.length > 0)
  );

  useEffect(() => {
    mounted.current = true;
    if (configured) void fetchAuthProviderAvailability().then((next) => { if (mounted.current) setProviders(next); });
    return () => { mounted.current = false; };
  }, [configured]);
  useEffect(() => { if (initialMode === 'invite' && !operation.current) setMode('invite'); }, [initialMode]);

  /** Move between intentional entry paths without retaining passwords or invitation codes. */
  function chooseMode(next: EntryMode) {
    if (operation.current || (next === 'owner' && !providers.signupAllowed)) return;
    setMode(next);
    setOwnerPasswordStep(false);
    setPassword(''); setConfirm(''); setCode(''); setNotice(null);
    if (next === 'invite') onInvitationRequested?.();
  }

  /** Validate local owner details before showing the password step; no account exists yet. */
  function continueOwnerSetup() {
    if (providers.signupAllowed && detailsValid && !operation.current) setOwnerPasswordStep(true);
  }

  /** Authenticate only the selected path; membership remains a separate server-verified decision. */
  async function submit() {
    if (!supabase || !canSubmit || operation.current) return;
    operation.current = true; setBusy(true); setNotice(null);
    let enrolling = false;
    try {
      const safeEmail = email.trim();
      if (mode === 'invite') {
        onInvitationRequested?.();
        enrolling = true;
        onInvitationEnrollmentChange?.(true);
        await verifyInvitationCode(safeEmail, code);
        return;
      }
      if (mode === 'recovery') {
        await beginAuthFlow('recovery');
        const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, { redirectTo: makeAuthCallbackUri() });
        if (error) throw error;
        if (mounted.current) setNotice({ text: 'If an account uses this email, a password reset link is on its way. Open it on this device to continue.', error: false });
        return;
      }
      if (mode === 'owner') {
        await beginAuthFlow('signup');
        const { data, error } = await supabase.auth.signUp({ email: safeEmail, password, options: { data: { full_name: name.trim() }, emailRedirectTo: makeAuthCallbackUri() } });
        if (error) throw error;
        if (data.session) await cancelAuthFlow();
        else if (mounted.current) {
          setNotice({ text: 'Check your email to confirm your account on this device. You will choose your home after verification.', error: false });
          setPassword(''); setConfirm('');
        }
        return;
      }
      await cancelAuthFlow();
      await waitForAuthExchange();
      const { error } = await supabase.auth.signInWithPassword({ email: safeEmail, password });
      if (error) throw error;
    } catch {
      if (enrolling) onInvitationEnrollmentChange?.(false);
      else await cancelAuthFlow();
      if (mounted.current) setNotice({ text: mode === 'invite'
        ? 'That invitation could not be verified. Check the email and code, or ask the home owner for a new invitation.'
        : mode === 'login' ? 'We could not sign you in. Check your email and password, or use password recovery.'
        : 'We could not complete that request. Please try again. If you already have an account, sign in instead.', error: true });
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  /** Preserve the existing locally initiated PKCE checks for configured identity providers. */
  async function signInWithProvider(provider: 'apple' | 'google') {
    if (!supabase || !configured || !providers[provider] || operation.current) return;
    operation.current = true; setBusy(true); setNotice(null);
    try {
      await beginAuthFlow('oauth');
      const redirectTo = makeAuthCallbackUri();
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw error ?? new Error('Sign-in unavailable.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') { await cancelAuthFlow(); return; }
      if (!await completeAuthCallback(result.url)) throw new Error('Sign-in could not be verified.');
    } catch {
      await cancelAuthFlow();
      if (mounted.current) setNotice({ text: 'We could not complete provider sign-in. Please try again or use your email.', error: true });
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return { mode, chooseMode, ownerPasswordStep, setOwnerPasswordStep, continueOwnerSetup, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, code, setCode, busy, configured, detailsValid, canSubmit, notice, providers, submit, signInWithProvider };
}
