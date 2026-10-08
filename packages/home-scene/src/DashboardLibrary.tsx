import { canNavigateSceneRoom, canViewSceneRoom, canViewSceneDevice } from './sceneAccess';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, CloudSun, Pause, Play, RotateCcw, Search, X } from 'lucide-react';
import { DEVICES, ROOMS, getRoom, type DeviceDefinition, type DeviceId, type RoomDefinition } from './data';
import { DEVICE_ICONS } from './DeviceControlCard';
import { deviceStatus } from './deviceCapabilities';
import { useHomeStore } from './state';
import { useCinematicStore } from './cinematicStore';
import { roomIcon } from './DashboardChrome';
import { paginateItems } from './dashboardPagination';
import { EnvironmentPanel } from './EnvironmentPanel';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { libraryCardPageSize } from './dashboardCardPresentation';
import { gasStatusTone } from './gasSimulation';
import { CinematicArtwork } from './CinematicCardArtwork';
import { deviceArtwork, roomArtwork } from './cinematicArtwork';
import './dashboard-cards.css';

export type DashboardLibraryView = 'rooms' | 'assigned-rooms' | 'devices' | 'settings' | 'environment';
interface DashboardLibraryProps {
  view: DashboardLibraryView;
  environment: LiveEnvironment;
  onEnvironment: () => void;
  reducedMotion: boolean;
  systemReducedMotion: boolean;
  onClose: () => void;
  onDevice: (id: DeviceId) => void;
}

/** Resize card pages with the embedded viewport, including a mobile keyboard. */
function useLibraryPageSize(): 2 | 4 {
  const [pageSize, setPageSize] = useState<2 | 4>(() => libraryCardPageSize(typeof window === 'undefined' ? 700 : window.innerHeight));
  useEffect(() => {
    const resize = () => setPageSize(libraryCardPageSize(window.innerHeight));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return pageSize;
}

/** Room cards describe a place and its real inventory before opening the model. */
function LibraryRoomCard({ room, selected, onSelect }: { room: RoomDefinition; selected: boolean; onSelect: () => void }) {
  const Icon = roomIcon(room.id);
  const access = useHomeStore((state) => state.access);
  const count = DEVICES.filter((device) => device.roomId === room.id && canViewSceneDevice(access, device.id)).length;
  return <button className="library-item library-space-card has-cinematic-artwork" data-library-room={room.id} aria-current={selected ? 'true' : undefined} onClick={onSelect}>
    <CinematicArtwork artwork={roomArtwork(room)} />
    <span className="library-card-top"><span className="library-card-symbol"><Icon size={22} strokeWidth={1.4} aria-hidden="true" /></span><span className="library-card-location">{room.outdoor ? 'Outdoors' : `${room.floor === 'ground' ? 'Ground' : 'Upper'} floor`}</span></span>
    <span className="library-card-identity"><strong>{room.name}</strong></span>
    <span className="library-card-footer"><span>{canViewSceneRoom(access, room.id) ? `${count} ${count === 1 ? 'device' : 'devices'}` : room.outdoor ? 'Exterior overview' : 'Layout only'}</span><span className="library-card-destination">Explore<ChevronRight size={14} aria-hidden="true" /></span></span>
  </button>;
}

/** Each device card follows its own simulation state and opens every detailed control. */
function LibraryDeviceCard({ device, onSelect }: { device: DeviceDefinition; onSelect: () => void }) {
  const storedState = useHomeStore((state) => state.deviceStates[device.id]);
  const current = storedState ?? { on: device.defaultOn, level: device.defaultLevel };
  const Icon = DEVICE_ICONS[device.kind];
  return <button className="library-item library-device-card has-cinematic-artwork" data-library-device={device.id} data-device-active={current.on} data-device-tone={gasStatusTone(device.kind, current)} aria-label={`${device.name}, ${getRoom(device.roomId).name}, ${deviceStatus(device, current)}. Open full controls`} onClick={onSelect}>
    <CinematicArtwork artwork={deviceArtwork(device)} />
    <span className="library-card-top"><span className="library-card-symbol"><Icon size={22} strokeWidth={1.4} aria-hidden="true" /></span><span className="library-card-destination">Controls<ChevronRight size={14} aria-hidden="true" /></span></span>
    <span className="library-card-identity"><small>{getRoom(device.roomId).name}</small><strong>{device.name}</strong></span>
    <span className={`library-card-footer library-card-state ${current.on ? 'library-active' : ''}`}><span className="library-card-state-dot" aria-hidden="true" />{deviceStatus(device, current)}</span>
  </button>;
}

/** Browse the complete inventory in bounded pages without scrolling the dashboard. */
export function DashboardLibrary({ environment, onEnvironment, view, onClose, onDevice, reducedMotion, systemReducedMotion }: DashboardLibraryProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [requestedPage, setRequestedPage] = useState(0);
  const pageSize = useLibraryPageSize();
  const roomId = useHomeStore((state) => state.roomId);
  const setRoom = useHomeStore((state) => state.setRoom);
  const setMotionDisabled = useHomeStore((state) => state.setMotionDisabled);
  const idleEnabled = useCinematicStore((state) => state.idleEnabled);
  const setIdleEnabled = useCinematicStore((state) => state.setIdleEnabled);
  const preferenceError = useCinematicStore((state) => state.preferenceError);
  const reset = useHomeStore((state) => state.reset);
  const access = useHomeStore((state) => state.access);
  const roomsView = view === 'rooms' || view === 'assigned-rooms';
  const assignedOnly = view === 'assigned-rooms';
  const search = query.trim().toLocaleLowerCase();
  const rooms = ROOMS.filter((room) => (assignedOnly ? canViewSceneRoom(access, room.id) : canNavigateSceneRoom(access, room.id)) && `${room.name} ${room.floor} ${room.outdoor ? 'outdoors' : ''}`.toLocaleLowerCase().includes(search)).sort((a, b) => Number(canViewSceneRoom(access, b.id)) - Number(canViewSceneRoom(access, a.id)));
  const devices = DEVICES.filter((device) => canViewSceneDevice(access, device.id) && `${device.name} ${device.kind} ${getRoom(device.roomId).name}`.toLocaleLowerCase().includes(search));
  const roomPage = paginateItems(rooms, requestedPage, pageSize);
  const devicePage = paginateItems(devices, requestedPage, pageSize);
  const current = roomsView ? roomPage : devicePage;
  const title = roomsView ? assignedOnly ? 'Your assigned rooms.' : 'Explore your spaces.' : view === 'devices' ? 'Device library.' : view === 'environment' ? 'Time & atmosphere.' : 'Scene preferences.';

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

  return <dialog ref={dialog} id="dashboard-library" className={`dashboard-library card-library library-${view}`} aria-labelledby="dashboard-library-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="library-heading"><div><span className="eyebrow">{view === 'environment' ? 'TIME & WEATHER' : view === 'settings' ? 'HOME PREFERENCES' : roomsView ? 'YOUR ROOMS' : `YOUR ${view.toUpperCase()}`}</span><h2 id="dashboard-library-title" tabIndex={-1}>{title}</h2></div><button className="dashboard-icon-button" aria-label="Close home browser" onClick={onClose}><X size={21} /></button></header>
    {view === 'environment' ? <EnvironmentPanel environment={environment} /> : view === 'settings' ? <div className="dashboard-preferences"><p>Explore the house, tap a device, and make it yours. This is a local simulation; no real hardware is connected.</p><button className="dashboard-preference" disabled={systemReducedMotion} aria-pressed={reducedMotion} onClick={() => setMotionDisabled(!reducedMotion)}>{reducedMotion ? <Pause size={20} /> : <Play size={20} />}<span>{systemReducedMotion ? 'Reduced motion · system' : reducedMotion ? 'Motion paused' : 'Motion on'}<small>Camera movement and animated devices</small></span></button><button className="dashboard-preference" aria-pressed={idleEnabled} aria-label="Automatic property tour" onClick={() => setIdleEnabled(!idleEnabled)}><Clapperboard size={20} aria-hidden="true" /><span>Automatic property tour · {idleEnabled ? 'On' : 'Off'}<small>{reducedMotion ? 'Paused by your motion preference' : 'After 90 seconds of inactivity · touch to return'}</small></span></button>{preferenceError ? <p role="status">Your tour preference could not be saved. This choice lasts for this session.</p> : null}<button className="dashboard-preference" disabled={!access.fullHome || access.controllableDeviceIds.length !== DEVICES.length} aria-label="Reset simulation to Morning" onClick={() => { reset(environment.isNight); onClose(); }}><RotateCcw size={20} /><span>Reset your home<small>Reset devices and follow local daylight</small></span></button><button className="dashboard-preference" onClick={onEnvironment}><CloudSun size={20} /><span>Time & weather<small>Hopewell · automatic daylight and live conditions</small></span></button><p className="dashboard-help-copy">Drag to orbit. Pinch to zoom. Use the view bar to explore the floor plan, landscape or immersive view. Changes stay in this browser.</p></div> : <>
      <label className="library-search"><Search size={18} /><span className="sr-only">{roomsView ? 'Find a room' : 'Find a device'}</span><input autoComplete="off" type="search" id={roomsView ? 'room-search' : 'device-search'} value={query} placeholder={roomsView ? 'Search rooms or floors' : 'Search name, room or type'} onChange={(event) => { setQuery(event.currentTarget.value); setRequestedPage(0); }} /></label>
      <div className="library-result-summary"><span>{current.total} {roomsView ? 'rooms' : view}</span><span>Choose to {roomsView ? 'explore' : 'control'}</span></div>
      <div className="library-results library-card-grid" data-library-view={roomsView ? 'rooms' : view} data-page-size={pageSize}>{roomsView
        ? roomPage.items.map((room) => <LibraryRoomCard key={room.id} room={room} selected={room.id === roomId} onSelect={() => { setRoom(room.id); onClose(); }} />)
        : devicePage.items.map((device) => <LibraryDeviceCard key={device.id} device={device} onSelect={() => onDevice(device.id)} />)}
        {current.total === 0 ? <p className="library-empty" role="status">No matches. Try another room or device name.</p> : null}</div>
      <footer className="library-pagination"><button aria-label="Previous results page" disabled={current.page === 0} onClick={() => setRequestedPage(current.page - 1)}><ChevronLeft size={18} /><span>Previous</span></button><span role="status" data-library-page>{current.page + 1} / {current.pages}</span><button aria-label="Next results page" disabled={current.page + 1 === current.pages} onClick={() => setRequestedPage(current.page + 1)}><span>Next</span><ChevronRight size={18} /></button></footer>
    </>}
  </dialog>;
}
