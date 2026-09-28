import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudSun, Pause, Play, RotateCcw, Search, X } from 'lucide-react';
import { DEVICES, ROOMS, getRoom, type DeviceId } from './data';
import { DEVICE_ICONS } from './DeviceControlCard';
import { deviceStatus } from './deviceCapabilities';
import { useHomeStore } from './state';
import { roomIcon } from './DashboardChrome';
import { paginateItems } from './dashboardPagination';
import { EnvironmentPanel } from './EnvironmentPanel';
import type { LiveEnvironment } from './environment/useLiveEnvironment';

export type DashboardLibraryView = 'rooms' | 'devices' | 'settings' | 'environment';
interface DashboardLibraryProps {
  view: DashboardLibraryView;
  environment: LiveEnvironment;
  onEnvironment: () => void;
  reducedMotion: boolean;
  systemReducedMotion: boolean;
  onClose: () => void;
  onDevice: (id: DeviceId) => void;
}

/** Browse the complete inventory in bounded pages without scrolling the dashboard. */
export function DashboardLibrary({ environment, onEnvironment, view, onClose, onDevice, reducedMotion, systemReducedMotion }: DashboardLibraryProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [requestedPage, setRequestedPage] = useState(0);
  const roomId = useHomeStore((state) => state.roomId);
  const setRoom = useHomeStore((state) => state.setRoom);
  const states = useHomeStore((state) => state.deviceStates);
  const setMotionDisabled = useHomeStore((state) => state.setMotionDisabled);
  const reset = useHomeStore((state) => state.reset);
  const search = query.trim().toLocaleLowerCase();
  const rooms = ROOMS.filter((room) => `${room.name} ${room.floor} ${room.outdoor ? 'outdoors' : ''}`.toLocaleLowerCase().includes(search));
  const devices = DEVICES.filter((device) => `${device.name} ${device.kind} ${getRoom(device.roomId).name}`.toLocaleLowerCase().includes(search));
  const roomPage = paginateItems(rooms, requestedPage, 6);
  const devicePage = paginateItems(devices, requestedPage, 6);
  const current = view === 'rooms' ? roomPage : devicePage;
  const title = view === 'rooms' ? 'Explore your spaces.' : view === 'devices' ? 'Device library.' : view === 'environment' ? 'Time & atmosphere.' : 'Scene preferences.';

  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    element?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} id="dashboard-library" className={`dashboard-library library-${view}`} aria-labelledby="dashboard-library-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="library-heading"><div><span className="eyebrow">{view === 'environment' ? 'TIME & WEATHER' : view === 'settings' ? 'HOME PREFERENCES' : `YOUR ${view.toUpperCase()}`}</span><h2 id="dashboard-library-title" tabIndex={-1}>{title}</h2></div><button className="dashboard-icon-button" aria-label="Close home browser" onClick={onClose}><X size={21} /></button></header>
    {view === 'environment' ? <EnvironmentPanel environment={environment} /> : view === 'settings' ? <div className="dashboard-preferences"><p>Explore the house, tap a device, and make it yours. This is a local simulation; no real hardware is connected.</p><button className="dashboard-preference" disabled={systemReducedMotion} aria-pressed={reducedMotion} onClick={() => setMotionDisabled(!reducedMotion)}>{reducedMotion ? <Pause size={20} /> : <Play size={20} />}<span>{systemReducedMotion ? 'Reduced motion · system' : reducedMotion ? 'Motion paused' : 'Motion on'}<small>Camera movement and animated devices</small></span></button><button className="dashboard-preference" aria-label="Reset simulation to Morning" onClick={() => { reset(environment.isNight); onClose(); }}><RotateCcw size={20} /><span>Reset your home<small>Reset devices and follow local daylight</small></span></button><button className="dashboard-preference" onClick={onEnvironment}><CloudSun size={20} /><span>Time & weather<small>Hopewell · automatic daylight and live conditions</small></span></button><p className="dashboard-help-copy">Drag to orbit. Pinch to zoom. Use the view bar to explore the floor plan, landscape or immersive view. Changes stay in this browser.</p></div> : <>
      <label className="library-search"><Search size={18} /><span className="sr-only">{view === 'rooms' ? 'Find a room' : 'Find a device'}</span><input autoComplete="off" type="search" id={view === 'rooms' ? 'room-search' : 'device-search'} value={query} placeholder={view === 'rooms' ? 'Search rooms or floors' : 'Search name, room or type'} onChange={(event) => { setQuery(event.currentTarget.value); setRequestedPage(0); }} /></label>
      <div className="library-result-summary"><span>{current.total} {view}</span><span>Choose to {view === 'rooms' ? 'explore' : 'control'}</span></div>
      <div className="library-results" data-library-view={view}>{view === 'rooms' ? roomPage.items.map((room) => { const Icon = roomIcon(room.id); return <button key={room.id} className="library-item" data-library-room={room.id} aria-current={room.id === roomId ? 'true' : undefined} onClick={() => { setRoom(room.id); onClose(); }}><Icon size={23} strokeWidth={1.4} /><span><strong>{room.name}</strong><small>{room.outdoor ? 'Outdoors' : `${room.floor === 'ground' ? 'Ground' : 'Upper'} floor`}</small></span><ChevronRight size={15} /></button>; }) : devicePage.items.map((device) => { const Icon = DEVICE_ICONS[device.kind]; return <button key={device.id} className="library-item" data-library-device={device.id} onClick={() => onDevice(device.id)}><Icon size={23} strokeWidth={1.4} /><span><strong>{device.name}</strong><small>{getRoom(device.roomId).name}</small><small className={states[device.id]?.on ? 'library-active' : ''}>{deviceStatus(device, states[device.id])}</small></span></button>; })}{current.total === 0 ? <p className="library-empty" role="status">No matches. Try another room or device name.</p> : null}</div>
      <footer className="library-pagination"><button aria-label="Previous results page" disabled={current.page === 0} onClick={() => setRequestedPage(current.page - 1)}><ChevronLeft size={18} /><span>Previous</span></button><span role="status" data-library-page>{current.page + 1} / {current.pages}</span><button aria-label="Next results page" disabled={current.page + 1 === current.pages} onClick={() => setRequestedPage(current.page + 1)}><span>Next</span><ChevronRight size={18} /></button></footer>
    </>}
  </dialog>;
}
