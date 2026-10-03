import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import AuthScreen from '../AuthScreen';
import { supabase } from '../../services/supabaseClient';
import { beginAuthFlow, verifyInvitationCode } from '../../services/authFlow';
import type { Session, User } from '@supabase/supabase-js';

jest.mock('../../components/CinematicSurface', () => ({ children }: { children: React.ReactNode }) => children);
jest.mock('../../services/authProviderAvailability', () => ({ fetchAuthProviderAvailability: jest.fn(async () => ({ apple: false, google: false })) }));
jest.mock('../../services/supabaseClient', () => ({ supabase: { auth: {
  signInWithPassword: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn(),
} } }));
jest.mock('../../services/authFlow', () => ({
  beginAuthFlow: jest.fn(async () => undefined), cancelAuthFlow: jest.fn(async () => undefined),
  waitForAuthExchange: jest.fn(async () => undefined), verifyInvitationCode: jest.fn(), completeAuthCallback: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  const user: User = { id: 'test-account', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-03T00:00:00Z', email: 'person@example.com' };
  const session: Session = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
  jest.mocked(supabase!.auth.signInWithPassword).mockResolvedValue({ data: { user, session }, error: null });
  jest.mocked(supabase!.auth.signUp).mockResolvedValue({ data: { user: null, session: null }, error: null });
  jest.mocked(supabase!.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });
});

/** Flush provider discovery and submitted account operations without real requests. */
async function settle() { await act(async () => { await Promise.resolve(); }); }

test('starts with personal sign-in and keeps owner creation behind an explicit path', async () => {
  const screen = render(<AuthScreen />); await settle();
  expect(screen.getByText('Welcome home.')).toBeTruthy();
  expect(screen.queryByLabelText('Your name')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'existing-password');
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' })); await settle();
  expect(supabase!.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', password: 'existing-password' });
  expect(supabase!.auth.signUp).not.toHaveBeenCalled();
});

test('submits the complete eight-digit invitation after arming the password gate', async () => {
  const enrollment = jest.fn(); const requested = jest.fn();
  jest.mocked(verifyInvitationCode).mockImplementation(async () => {
    expect(enrollment).toHaveBeenCalledWith(true);
    throw new Error('Expired code');
  });
  const screen = render(<AuthScreen initialMode="invite" onInvitationRequested={requested} onInvitationEnrollmentChange={enrollment} />); await settle();
  fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.com');
  expect(screen.getByLabelText('Invitation code').props.maxLength).toBe(10);
  fireEvent.changeText(screen.getByLabelText('Invitation code'), '01234567');
  fireEvent.press(screen.getByRole('button', { name: 'Verify invitation' })); await settle();
  expect(verifyInvitationCode).toHaveBeenCalledWith('guest@example.com', '01234567');
  expect(enrollment.mock.calls.map(([active]) => active)).toEqual([true, false]);
  expect(requested).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/That invitation could not be verified/)).toBeTruthy();
  expect(supabase!.auth.signUp).not.toHaveBeenCalled();
});

test.each(['123456', '0123456789'])('allows the supported invitation length boundary %s', async (code) => {
  jest.mocked(verifyInvitationCode).mockRejectedValue(new Error('Invalid test token'));
  const screen = render(<AuthScreen initialMode="invite" />); await settle();
  fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.com');
  fireEvent.changeText(screen.getByLabelText('Invitation code'), code);
  fireEvent.press(screen.getByRole('button', { name: 'Verify invitation' })); await settle();
  expect(verifyInvitationCode).toHaveBeenCalledWith('guest@example.com', code);
});

test.each(['12345', '12345678901', '1234a678'])('keeps malformed invitation input %s out of the authentication flow', async (code) => {
  const enrollment = jest.fn();
  const screen = render(<AuthScreen initialMode="invite" onInvitationEnrollmentChange={enrollment} />); await settle();
  fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.com');
  fireEvent.changeText(screen.getByLabelText('Invitation code'), code);
  fireEvent.press(screen.getByRole('button', { name: 'Verify invitation' })); await settle();
  expect(verifyInvitationCode).not.toHaveBeenCalled();
  expect(enrollment).not.toHaveBeenCalled();
});

test('preview never performs authentication, email delivery or account creation', async () => {
  const screen = render(<AuthScreen preview />); await settle();
  fireEvent.changeText(screen.getByLabelText('Email'), 'preview@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'preview-password');
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.press(screen.getByText('Forgot password?'));
  fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
  fireEvent.press(screen.getByText('Back to sign in'));
  fireEvent.press(screen.getByRole('tab', { name: 'Accept invitation' }));
  fireEvent.changeText(screen.getByLabelText('Invitation code'), '123456');
  fireEvent.press(screen.getByRole('button', { name: 'Verify invitation' })); await settle();
  expect(supabase!.auth.signInWithPassword).not.toHaveBeenCalled();
  expect(supabase!.auth.signUp).not.toHaveBeenCalled();
  expect(supabase!.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(verifyInvitationCode).not.toHaveBeenCalled();
});

test('owner enrollment validates details before a locally initiated signup', async () => {
  const screen = render(<AuthScreen />); await settle();
  fireEvent.press(screen.getByText('Set up a new home'));
  fireEvent.changeText(screen.getByLabelText('Your name'), 'Alex');
  fireEvent.changeText(screen.getByLabelText('Email'), 'owner@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(supabase!.auth.signUp).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Create password'), 'a-new-password');
  fireEvent.changeText(screen.getByLabelText('Confirm password'), 'a-new-password');
  fireEvent.press(screen.getByRole('button', { name: 'Create account' })); await settle();
  expect(beginAuthFlow).toHaveBeenCalledWith('signup');
  expect(supabase!.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'owner@example.com', password: 'a-new-password' }));
  expect(screen.getByText(/Check your email to confirm your account/)).toBeTruthy();
});

test('recovery sends a scoped callback and avoids claiming an email account exists', async () => {
  const screen = render(<AuthScreen />); await settle();
  fireEvent.press(screen.getByText('Forgot password?'));
  fireEvent.changeText(screen.getByLabelText('Email'), 'someone@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Send reset link' })); await settle();
  expect(beginAuthFlow).toHaveBeenCalledWith('recovery');
  expect(supabase!.auth.resetPasswordForEmail).toHaveBeenCalledWith('someone@example.com', { redirectTo: 'vantahome://auth-callback' });
  expect(screen.getByText(/If an account uses this email/)).toBeTruthy();
});
