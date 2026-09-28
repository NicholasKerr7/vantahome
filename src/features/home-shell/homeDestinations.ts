/** Stable destinations keep the home menu independent of screen implementation. */
export type HomeDestination = 'scenes' | 'automations' | 'cameras' | 'notifications'
  | 'rooms' | 'devices' | 'household' | 'settings' | 'integrations' | 'activity' | 'audit' | 'renderer';

export const HOME_MENU_PAGES = [
  { title: 'Everyday', description: 'Your home, at a glance.', items: [
    { id: 'scenes', title: 'Scenes', detail: 'Set the mood', icon: 'sparkles-outline' },
    { id: 'automations', title: 'Automations', detail: 'Build your routines', icon: 'git-branch-outline' },
    { id: 'cameras', title: 'Cameras', detail: 'Views & recordings', icon: 'videocam-outline' },
    { id: 'notifications', title: 'Notifications', detail: 'What needs attention', icon: 'notifications-outline' },
  ] },
  { title: 'Manage', description: 'Everything has its place.', items: [
    { id: 'rooms', title: 'Rooms', detail: 'Organize your spaces', icon: 'grid-outline' },
    { id: 'devices', title: 'Home devices', detail: 'Your device registry', icon: 'hardware-chip-outline' },
    { id: 'household', title: 'Household', detail: 'Profile & permissions', icon: 'people-outline' },
    { id: 'settings', title: 'Settings', detail: 'Your preferences', icon: 'options-outline' },
  ] },
  { title: 'Connections', description: 'Connect, review, and fine-tune.', items: [
    { id: 'integrations', title: 'Integrations', detail: 'Assistants & bridges', icon: 'link-outline' },
    { id: 'activity', title: 'Command activity', detail: 'Delivery & failures', icon: 'pulse-outline' },
    { id: 'audit', title: 'History', detail: 'Your home’s audit log', icon: 'time-outline' },
    { id: 'renderer', title: 'Renderer preview', detail: 'Compare 3D engines', icon: 'cube-outline' },
  ] },
] as const;
