type SessionProfileUser = {
  email?: unknown;
  user_metadata?: unknown;
};

/** Accept display text only; auth metadata may contain arbitrary JSON values. */
function nonemptyText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

/** Preserve this account's hydrated local name while keeping its login email authoritative. */
export function resolveSessionProfile(savedName: unknown, user: SessionProfileUser): {
  name: string;
  email: string | undefined;
} {
  const metadata = user.user_metadata && typeof user.user_metadata === 'object' && !Array.isArray(user.user_metadata)
    ? user.user_metadata as Record<string, unknown>
    : {};
  const email = nonemptyText(user.email);
  return {
    name: nonemptyText(savedName)
      ?? nonemptyText(metadata.full_name)
      ?? nonemptyText(metadata.name)
      ?? nonemptyText(email?.split('@')[0])
      ?? 'Home',
    email,
  };
}
