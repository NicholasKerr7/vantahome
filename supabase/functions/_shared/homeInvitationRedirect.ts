const NATIVE_INVITATION_REDIRECT = "vantahome://join-home";

/** Accept only a server-configured invitation entry page, without credentials or redirect parameters. */
export function getHomeInvitationRedirect(configuredUrl?: string) {
  if (configuredUrl === undefined || configuredUrl === "")
    return NATIVE_INVITATION_REDIRECT;
  if (configuredUrl === NATIVE_INVITATION_REDIRECT)
    return NATIVE_INVITATION_REDIRECT;
  try {
    const parsed = new URL(configuredUrl);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname &&
      !parsed.port &&
      parsed.pathname === "/join-home" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    ) return parsed.href;
  } catch {
    // Configuration failures stop the operation before an invitation is sent.
  }
  throw new Error("VANTAHOME_INVITE_REDIRECT_URL must be vantahome://join-home or an approved HTTPS /join-home page.");
}
