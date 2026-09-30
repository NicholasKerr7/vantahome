import { useState } from 'react';
import { BedDouble, Clock3, ChevronDown, ChevronLeft, ChevronRight, Cloud, CloudLightning, CloudOff, CloudRain, CloudSun, Grid2X2, Home, Layers3, Moon, Settings2, Snowflake, Sofa, Sparkles, Sun, Utensils, type LucideIcon } from 'lucide-react';
import { DEVICES, ROOMS, getRoom, type RoomId } from './data';
import { useSceneCatalog } from './useSceneCatalog';
import { MODEL_SCENE_PRESETS } from './modelScenePresets';
import { useHomeStore } from './state';
import { paginateItems } from './dashboardPagination';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { weatherDescription } from './environment/weatherClient';

/** Keep room symbols familiar without coupling navigation to device geometry. */
export function roomIcon(id: RoomId): LucideIcon {
  return id === 'living' || id === 'family' ? Sofa : id === 'kitchen' ? Utensils : id === 'master' || id.startsWith('bedroom-') ? BedDouble : Home;
}

/** Match validated WMO conditions without implying weather when readings are absent. */
function weatherIcon(code: number | undefined): LucideIcon {
  if (code === undefined) return CloudOff;
  if (code >= 95) return CloudLightning;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return Snowflake;
  if (code >= 51) return CloudRain;
  if (code === 0) return Sun;
  return code <= 2 ? CloudSun : Cloud;
}

/** Let the native shell own identity while keeping time, weather, and lighting within reach. */
export function DashboardHeader({ onSettings, onEnvironment = onSettings, environment, embedded = false }: { onSettings: () => void; onEnvironment?: () => void; environment: Pick<LiveEnvironment, 'localTime' | 'weather' | 'status'>; embedded?: boolean }) {
  const mode = useHomeStore((state) => state.lightingMode);
  const setMode = useHomeStore((state) => state.setLightingMode);
  const setNight = useHomeStore((state) => state.setNight);
  const WeatherIcon = weatherIcon(environment.weather?.weatherCode);
  const weatherLabel = environment.weather ? `${weatherDescription(environment.weather.weatherCode)} · ${environment.status === 'live' ? 'Live weather' : 'Last available weather'}`
    : environment.status === 'loading' ? 'Checking local weather' : 'Weather unavailable';
  const contextLabel = `Property time and weather: ${weatherLabel}, ${environment.localTime}${environment.weather ? `, ${Math.round(environment.weather.tempC)} degrees Celsius` : ''}`;
  return <header className="app-header dashboard-header">
    {embedded ? <button className="dashboard-context" onClick={onEnvironment} aria-label={contextLabel}><span>HOPEWELL</span><span className="dashboard-context-weather"><WeatherIcon size={14} strokeWidth={1.6} aria-hidden="true" />{environment.weather ? <strong>{Math.round(environment.weather.tempC)}°</strong> : null}<time>{environment.localTime}</time></span></button> : <a className="dashboard-brand" href="#house-preview" aria-label="VantaHome house preview"><span className="dashboard-brand-mark"><Home size={21} strokeWidth={1.4} /></span><span>VANTA<span className="brand-light">HOME</span><small>HOPEWELL · {environment.localTime}</small></span></a>}
    {!embedded && <button className="dashboard-address" onClick={onEnvironment} aria-label={contextLabel}><WeatherIcon size={17} aria-hidden="true" />{environment.weather ? `${Math.round(environment.weather.tempC)}°C · ${weatherDescription(environment.weather.weatherCode)}` : 'Local time & weather'}</button>}
    <div className="header-actions"><div className="light-mode-switch" aria-label="Preview lighting"><button type="button" aria-label="Automatic local daylight" title="Follow Hopewell’s local sunrise and sunset" aria-pressed={mode === 'auto'} className={mode === 'auto' ? 'is-selected' : ''} onClick={() => setMode('auto')}><Clock3 size={18} /></button><button type="button" aria-label="Daylight preview" aria-pressed={mode === 'day'} className={mode === 'day' ? 'is-selected' : ''} onClick={() => setNight(false)}><Sun size={18} /></button><button type="button" aria-label="Night lighting preview" aria-pressed={mode === 'night'} className={mode === 'night' ? 'is-selected' : ''} onClick={() => setNight(true)}><Moon size={18} /></button></div><button className="dashboard-icon-button" aria-label="Home settings and help" onClick={onSettings}><Settings2 size={19} /></button></div>
  </header>;
}

/** Switch floors with explicit touch targets, retaining the existing navigation rules. */
export function DashboardFloorSwitch() {
  const floor = useHomeStore((state) => state.floor);
  const setFloor = useHomeStore((state) => state.setFloor);
  return <div className="floor-switch dashboard-floor-switch" aria-label="Choose floor"><button type="button" aria-pressed={floor === 'ground'} onClick={() => setFloor('ground')}>Ground</button><button type="button" aria-pressed={floor === 'upper'} onClick={() => setFloor('upper')}>Upper</button></div>;
}

/** Page through every room instead of growing a vertically scrolling sidebar. */
export function DashboardRooms({ onBrowse }: { onBrowse: () => void }) {
  const floor = useHomeStore((state) => state.floor);
  const roomId = useHomeStore((state) => state.roomId);
  const setRoom = useHomeStore((state) => state.setRoom);
  const rooms = ROOMS.filter((room) => room.floor === floor || room.outdoor);
  const [requested, setRequested] = useState({ roomId, floor, page: 0 });
  const selectedPage = Math.floor(Math.max(0, rooms.findIndex((room) => room.id === roomId)) / 6);
  const page = paginateItems(rooms, requested.roomId === roomId && requested.floor === floor ? requested.page : selectedPage, 6);
  return <aside className="dashboard-room-rail" aria-label="Room navigation"><div className="dashboard-rail-title"><span className="eyebrow">YOUR SPACE</span><h2>Seaview House<span className="small-dot" /></h2></div><DashboardFloorSwitch /><div className="dashboard-section-label"><span>Rooms & grounds</span><span>{rooms.length}</span></div><nav className="dashboard-room-list" aria-label="Rooms">{page.items.map((room) => { const Icon = roomIcon(room.id); return <button key={room.id} data-room-id={room.id} aria-current={roomId === room.id ? 'true' : undefined} onClick={() => setRoom(room.id)}><Icon size={18} strokeWidth={1.5} /><span>{room.name}</span>{roomId === room.id ? <span className="dashboard-selected-dot" /> : null}</button>; })}</nav><div className="dashboard-pager" aria-label="Room pages"><button aria-label="Previous room page" disabled={page.page === 0} onClick={() => setRequested({ roomId, floor, page: page.page - 1 })}><ChevronLeft size={17} /></button><span data-room-page role="status">{page.page + 1} / {page.pages}</span><button aria-label="Next room page" disabled={page.page + 1 === page.pages} onClick={() => setRequested({ roomId, floor, page: page.page + 1 })}><ChevronRight size={17} /></button></div><button className="dashboard-browse" onClick={onBrowse}><Grid2X2 size={17} />All rooms<ChevronRight size={15} /></button></aside>;
}

/** Portrait navigation gives the model its own full-width canvas. */
export function DashboardRoomBar({ onRooms }: { onRooms: () => void }) {
  const roomId = useHomeStore((state) => state.roomId);
  const room = getRoom(roomId);
  const Icon = roomIcon(roomId);
  return <div className="dashboard-room-bar"><button aria-label="Choose a room" className="dashboard-room-select" onClick={onRooms}><Icon size={18} /><span className="dashboard-room-choice"><small>EXPLORE YOUR HOME</small><span>{room.name}</span></span><ChevronDown size={15} /></button><DashboardFloorSwitch /></div>;
}

/** Page through the same saved scenes as the native collection without enlarging the home layout. */
export function DashboardScenes() {
  const { catalog, status, runScene, retry } = useSceneCatalog();
  const [requestedPage, setRequestedPage] = useState(0);
  const paged = catalog.scenes.length > 4;
  const page = paginateItems(catalog.scenes, requestedPage, paged ? 3 : 4);
  const icons = [Sun, Sparkles, Moon, Home];
  return <section className="dashboard-scenes" aria-label="Home scenes">
    <div className="dashboard-scenes-label"><Sparkles size={16} /><span>Scenes</span></div>
    {paged && <button className="dashboard-scene-page" aria-label="Previous scenes" disabled={page.page === 0} onClick={() => setRequestedPage(page.page - 1)}><ChevronLeft size={17} /></button>}
    <div className={`preset-grid${paged ? ' has-scene-pages' : ''}`}>
      {page.items.map((scene) => {
        const Icon = icons[MODEL_SCENE_PRESETS.findIndex((preset) => preset.sceneId === scene.id)] ?? Sparkles;
        return <button key={scene.id} className="dashboard-preset" title={`${scene.name} · ${scene.scope}`} aria-pressed={catalog.activeSceneId === scene.id}
          onClick={() => runScene(scene.id)}><Icon size={17} strokeWidth={1.5} /><span>{scene.name}</span></button>;
      })}
    </div>
    {paged && <button className="dashboard-scene-page" aria-label="Next scenes" disabled={page.page === page.pages - 1} onClick={() => setRequestedPage(page.page + 1)}><ChevronRight size={17} /></button>}
    {!catalog.scenes.length && <div className="dashboard-scenes-empty" role="status">{status === 'loading' ? 'Loading scenes…' : status === 'error' ? <button onClick={retry}>Retry scenes</button> : 'No saved scenes'}</div>}
  </section>;
}

/** Put room and device browsing within thumb reach without another page. */
export function DashboardDock({ onRooms, onDevices }: { onRooms: () => void; onDevices: () => void }) {
  const states = useHomeStore((state) => state.deviceStates);
  const active = DEVICES.filter((device) => states[device.id]?.on).length;
  return <nav className="dashboard-dock" aria-label="Home navigation"><button onClick={onRooms}><Layers3 size={18} /><span>Rooms</span></button><div><span className="status-dot" /><span>{active} devices active</span></div><button onClick={onDevices}><Grid2X2 size={18} /><span>Devices</span></button></nav>;
}
