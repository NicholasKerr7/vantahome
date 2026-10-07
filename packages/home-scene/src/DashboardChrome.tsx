import { canExploreInteriorLayout, canNavigateSceneRoom, canViewSceneRoom, canViewSceneDevice } from './sceneAccess';
import { useState } from 'react';
import { BedDouble, Clock3, ChevronDown, ChevronLeft, ChevronRight, Cloud, CloudLightning, CloudOff, CloudRain, CloudSun, Grid2X2, Home, Layers3, Moon, Settings2, Snowflake, Sofa, Sparkles, Sun, Utensils, type LucideIcon } from 'lucide-react';
import { DEVICES, ROOMS, getRoom, type RoomId } from './data';
import { useSceneCatalog } from './useSceneCatalog';
import { MODEL_SCENE_PRESETS } from './modelScenePresets';
import { useHomeStore } from './state';
import { paginateItems } from './dashboardPagination';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { weatherDescription } from './environment/weatherClient';
import { CinematicArtwork } from './CinematicCardArtwork';
import { roomArtwork, sceneArtwork } from './cinematicArtwork';
import vantahomeMark from '../../../assets/brand/vantahome-mark-256.png?inline';

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

/** Keep one time/weather entry point while the native shell owns embedded identity. */
export function DashboardHeader({ onSettings, onEnvironment = onSettings, environment, embedded = false }: { onSettings: () => void; onEnvironment?: () => void; environment: Pick<LiveEnvironment, 'localTime' | 'weather' | 'status'>; embedded?: boolean }) {
  const WeatherIcon = weatherIcon(environment.weather?.weatherCode);
  const weatherLabel = environment.weather ? `${weatherDescription(environment.weather.weatherCode)} · ${environment.status === 'live' ? 'Live weather' : 'Last available weather'}`
    : environment.status === 'loading' ? 'Checking local weather' : 'Weather unavailable';
  const contextLabel = `Property time and weather: ${weatherLabel}, ${environment.localTime}${environment.weather ? `, ${Math.round(environment.weather.tempC)} degrees Celsius` : ''}`;
  return <header className="app-header dashboard-header">
    {embedded ? (
      <button className="dashboard-context" onClick={onEnvironment} aria-label={contextLabel}>
        <span>HOPEWELL</span>
        <span className="dashboard-context-weather">
          <WeatherIcon size={14} strokeWidth={1.6} aria-hidden="true" />
          {environment.weather ? <strong>{Math.round(environment.weather.tempC)}°</strong> : null}
          <time>{environment.localTime}</time>
        </span>
      </button>
    ) : (
      <a className="dashboard-brand" href="#house-preview" aria-label="VantaHome house preview">
        <span className="dashboard-brand-mark"><img src={vantahomeMark} width={256} height={256} alt="" aria-hidden="true" /></span>
        <span>VANTA<span className="brand-light">HOME</span><small>HOPEWELL</small></span>
      </a>
    )}
    <div className="header-actions">
      {!embedded && (
        <button className="dashboard-address" onClick={onEnvironment} aria-label={contextLabel}>
          <Clock3 size={17} aria-hidden="true" />
          <time>{environment.localTime}</time>
          <span className="dashboard-address-weather">
            {environment.weather ? `${Math.round(environment.weather.tempC)}°C · ${weatherDescription(environment.weather.weatherCode)}` : 'Local time & weather'}
          </span>
        </button>
      )}
      <button className="dashboard-icon-button" aria-label="Home settings and help" onClick={onSettings}>
        <Settings2 size={19} />
      </button>
    </div>
  </header>;
}

/** Switch floors with explicit touch targets, retaining the existing navigation rules. */
export function DashboardFloorSwitch() {
  const floor = useHomeStore((state) => state.floor);
  const setFloor = useHomeStore((state) => state.setFloor);
  const layout = useHomeStore((state) => canExploreInteriorLayout(state.access));
  if (!layout) return null;
  return <div className="floor-switch dashboard-floor-switch" aria-label="Choose floor"><button type="button" aria-pressed={floor === 'ground'} onClick={() => setFloor('ground')}>Ground</button><button type="button" aria-pressed={floor === 'upper'} onClick={() => setFloor('upper')}>Upper</button></div>;
}

/** Page through every room instead of growing a vertically scrolling sidebar. */
export function DashboardRooms({ onBrowse }: { onBrowse: () => void }) {
  const floor = useHomeStore((state) => state.floor);
  const roomId = useHomeStore((state) => state.roomId);
  const setRoom = useHomeStore((state) => state.setRoom);
  const access = useHomeStore((state) => state.access);
  const rooms = ROOMS.filter((room) => canNavigateSceneRoom(access, room.id) && (!canExploreInteriorLayout(access) || room.floor === floor || room.outdoor));
  const [requested, setRequested] = useState({ roomId, floor, page: 0 });
  const selectedPage = Math.floor(Math.max(0, rooms.findIndex((room) => room.id === roomId)) / 6);
  const page = paginateItems(rooms, requested.roomId === roomId && requested.floor === floor ? requested.page : selectedPage, 6);
  return <aside className="dashboard-room-rail" aria-label="Room navigation"><div className="dashboard-rail-title"><span className="eyebrow">YOUR SPACE</span><h2>Seaview House<span className="small-dot" /></h2></div><DashboardFloorSwitch /><div className="dashboard-section-label"><span>{canExploreInteriorLayout(access) ? 'Rooms & grounds' : 'Your rooms & property'}</span><span>{rooms.length}</span></div><nav className="dashboard-room-list" aria-label="Rooms">{page.items.map((room) => { const Icon = roomIcon(room.id); return <button key={room.id} data-room-id={room.id} aria-current={roomId === room.id ? 'true' : undefined} onClick={() => setRoom(room.id)}><CinematicArtwork artwork={roomArtwork(room)} presentation="thumbnail"><Icon strokeWidth={1.5} /></CinematicArtwork><span className="dashboard-room-name">{room.name}{!canViewSceneRoom(access, room.id) && !room.outdoor ? <small className="room-layout-label">Layout only</small> : null}</span>{roomId === room.id ? <span className="dashboard-selected-dot" /> : null}</button>; })}</nav><div className="dashboard-pager" aria-label="Room pages"><button aria-label="Previous room page" disabled={page.page === 0} onClick={() => setRequested({ roomId, floor, page: page.page - 1 })}><ChevronLeft size={17} /></button><span data-room-page role="status">{page.page + 1} / {page.pages}</span><button aria-label="Next room page" disabled={page.page + 1 === page.pages} onClick={() => setRequested({ roomId, floor, page: page.page + 1 })}><ChevronRight size={17} /></button></div><button className="dashboard-browse" onClick={onBrowse}><Grid2X2 size={17} />All rooms<ChevronRight size={15} /></button></aside>;
}

/** Portrait navigation gives the model its own full-width canvas. */
export function DashboardRoomBar({ onRooms }: { onRooms: () => void }) {
  const roomId = useHomeStore((state) => state.roomId);
  const room = getRoom(roomId);
  const Icon = roomIcon(roomId);
  return <div className="dashboard-room-bar"><button aria-label="Choose a room" className="dashboard-room-select" onClick={onRooms}><CinematicArtwork artwork={roomArtwork(room)} presentation="thumbnail"><Icon /></CinematicArtwork><span className="dashboard-room-choice"><small>EXPLORE YOUR HOME</small><span>{room.name}</span></span><ChevronDown size={15} /></button><DashboardFloorSwitch /></div>;
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
        const presetIndex = MODEL_SCENE_PRESETS.findIndex((preset) => preset.sceneId === scene.id);
        const Icon = icons[presetIndex] ?? Sparkles;
        const artwork = sceneArtwork({ name: scene.name, modelPreset: MODEL_SCENE_PRESETS[presetIndex]?.id });
        return <button key={scene.id} className="dashboard-preset has-cinematic-artwork" title={`${scene.name} · ${scene.scope}`} aria-pressed={catalog.activeSceneId === scene.id}
          onClick={() => runScene(scene.id)}><CinematicArtwork artwork={artwork} /><Icon size={17} strokeWidth={1.5} aria-hidden="true" /><span>{scene.name}</span></button>;
      })}
    </div>
    {paged && <button className="dashboard-scene-page" aria-label="Next scenes" disabled={page.page === page.pages - 1} onClick={() => setRequestedPage(page.page + 1)}><ChevronRight size={17} /></button>}
    {!catalog.scenes.length && <div className="dashboard-scenes-empty" role="status">{status === 'loading' ? 'Loading scenes…' : status === 'error' ? <button onClick={retry}>Retry scenes</button> : 'No saved scenes'}</div>}
  </section>;
}

/** Put room and device browsing within thumb reach without another page. */
export function DashboardDock({ onRooms, onDevices }: { onRooms: () => void; onDevices: () => void }) {
  const states = useHomeStore((state) => state.deviceStates);
  const access = useHomeStore((state) => state.access);
  const active = DEVICES.filter((device) => canViewSceneDevice(access, device.id) && states[device.id]?.on).length;
  return <nav className="dashboard-dock" aria-label="Home navigation"><button onClick={onRooms}><Layers3 size={18} /><span>Rooms</span></button><div><span className="status-dot" /><span>{active} devices active</span></div><button onClick={onDevices}><Grid2X2 size={18} /><span>Devices</span></button></nav>;
}
