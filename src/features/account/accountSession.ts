import { cancelAuthFlow, waitForAuthExchange } from '../../services/authFlow';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';

/** End only the account the user reviewed, after pending authentication work has settled. */
export async function signOutAccount(scope: AccountScope): Promise<boolean> {
  if (!supabase || !scope.authenticatedUserId || !isAccountScopeCurrent(scope, useHomeStore.getState())) return false;
  await cancelAuthFlow();
  await waitForAuthExchange();
  if (!isAccountScopeCurrent(scope, useHomeStore.getState())) return false;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== scope.authenticatedUserId || !isAccountScopeCurrent(scope, useHomeStore.getState())) return false;
  const result = await supabase.auth.signOut({ scope: 'local' });
  if (result.error) throw result.error;
  return true;
}
