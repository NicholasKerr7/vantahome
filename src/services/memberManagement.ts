import { supabase } from './supabaseClient';
import { withMembershipMutation } from './membershipRevision';

/** Remove one member only after the checked server operation confirms the exact target. */
export async function removeHomeMember(homeId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await withMembershipMutation(async () => supabase!.rpc('remove_home_member', {
    target_home_id: homeId, target_user_id: userId,
  }));
  if (error) throw new Error(error.message);
  if (data !== userId) throw new Error('The server did not confirm removal. Refresh home access.');
}
