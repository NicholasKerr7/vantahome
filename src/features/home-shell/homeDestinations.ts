/** Stable destinations keep the home menu independent of screen implementation. */
export type HomeDestination = 'scenes' | 'automations' | 'cameras' | 'notifications'
  | 'rooms' | 'devices' | 'household' | 'settings' | 'integrations' | 'activity' | 'audit' | 'renderer';

export const HOME_MENU_PAGES = [
  { title: 'House', description: 'The spaces, people, and preferences that make it yours.', items: [
    { id: 'rooms', title: 'Rooms', detail: 'Organize your spaces', icon: 'grid-outline' },
    { id: 'cameras', title: 'Cameras', detail: 'Views & recordings', icon: 'videocam-outline' },
    { id: 'household', title: 'Household', detail: 'Profile & permissions', icon: 'people-outline' },
    { id: 'settings', title: 'Settings', detail: 'Your preferences', icon: 'options-outline' },
  ] },
  { title: 'Connections', description: 'Bring your home and its services together.', items: [
    { id: 'integrations', title: 'Integrations', detail: 'Assistants & bridges', icon: 'link-outline' },
    { id: 'renderer', title: 'Renderer preview', detail: 'Compare 3D engines', icon: 'cube-outline' },
  ] },
  { title: 'Activity', description: 'Keep up with what is happening at home.', items: [
    { id: 'notifications', title: 'Notifications', detail: 'What needs attention', icon: 'notifications-outline' },
    { id: 'activity', title: 'Command activity', detail: 'Delivery & failures', icon: 'pulse-outline' },
    { id: 'audit', title: 'History', detail: 'Your home’s audit log', icon: 'time-outline' },
  ] },
] as const;
