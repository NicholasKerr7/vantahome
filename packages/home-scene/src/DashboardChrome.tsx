import { canExploreInteriorLayout, canNavigateSceneRoom, canViewSceneRoom, canViewSceneDevice } from './sceneAccess';
import { useId, useState } from 'react';
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
import { HorizontalCardScroller } from './HorizontalCardScroller';
import { useSceneCardPage } from './useSceneCardPage';
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
export function DashboardHeader({ onSettings, onEnvironment = onSettings, environment, embedded = false }: { onSettings: () => void; onEnvironment?: () => void; environment: Pick<LiveEnvironment, 'localTime' | 'weather' | 'status'> & Partial<Pick<LiveEnvironment, 'location'>>; embedded?: boolean }) {
  const WeatherIcon = weatherIcon(environment.weather?.weatherCode);
  const weatherLabel = environment.weather ? `${weatherDescription(environment.weather.weatherCode)} · ${environment.status === 'live' ? 'Current regional estimate' : 'Saved regional estimate'}`
    : environment.status === 'loading' ? 'Checking local weather' : 'Weather unavailable';
  const locationLabel = environment.location?.name ?? 'Hopewell';
  const contextLabel = `Property time and weather: ${weatherLabel}, ${environment.localTime}${environment.weather ? `, ${Math.round(environment.weather.tempC)} degrees Celsius` : ''}`;
  return <header className="app-header dashboard-header">
    {embedded ? (
      <button className="dashboard-context" onClick={onEnvironment} aria-label={contextLabel}>
        <span>{locationLabel}</span>
        <span className="dashboard-context-weather">
          <WeatherIcon size={14} strokeWidth={1.6} aria-hidden="true" />
          {environment.weather ? <strong>{Math.round(environment.weather.tempC)}°</strong> : null}
          <time>{environment.localTime}</time>
        </span>
      </button>
    ) : (
      <a className="dashboard-brand" href="#house-preview" aria-label="VantaHome house preview">
        <span className="dashboard-brand-mark"><img src={vantahomeMark} width={256} height={256} alt="" aria-hidden="true" /></span>
        <span>VANTA<span className="brand-light">HOME</span><small>{locationLabel}</small></span>
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
export function DashboardRooms({ onBrowse, inert = false }: { onBrowse: () => void; inert?: boolean }) {
  const floor = useHomeStore((state) => state.floor);
  const roomId = useHomeStore((state) => state.roomId);
  const setRoom = useHomeStore((state) => state.setRoom);
  const access = useHomeStore((state) => state.access);
  const rooms = ROOMS.filter((room) => canNavigateSceneRoom(access, room.id) && (!canExploreInteriorLayout(access) || room.floor === floor || room.outdoor));
  const [requested, setRequested] = useState({ roomId, floor, page: 0 });
  const selectedPage = Math.floor(Math.max(0, rooms.findIndex((room) => room.id === roomId)) / 6);
  const page = paginateItems(rooms, requested.roomId === roomId && requested.floor === floor ? requested.page : selectedPage, 6);
  return <aside inert={inert} className="dashboard-room-rail" aria-label="Room navigation"><div className="dashboard-rail-title"><span className="eyebrow">YOUR SPACE</span><h2>Seaview House<span className="small-dot" /></h2></div><DashboardFloorSwitch /><div className="dashboard-section-label"><span>{canExploreInteriorLayout(access) ? 'Rooms & grounds' : 'Your rooms & property'}</span><span>{rooms.length}</span></div><HorizontalCardScroller className="dashboard-room-list" page={page.page} count={page.pages} pageSize={6} columns={1} onChange={(next) => setRequested({ roomId, floor, page: next })} label="Room navigation cards" resetKey={`${roomId}:${floor}:${rooms.map((room) => room.id).join('|')}`}>{rooms.map((room) => { const Icon = roomIcon(room.id); return <button key={room.id} data-room-id={room.id} aria-current={roomId === room.id ? 'true' : undefined} onClick={() => setRoom(room.id)}><CinematicArtwork artwork={roomArtwork(room)} presentation="thumbnail"><Icon strokeWidth={1.5} /></CinematicArtwork><span className="dashboard-room-name">{room.name}{!canViewSceneRoom(access, room.id) && !room.outdoor ? <small className="room-layout-label">Layout only</small> : null}</span>{roomId === room.id ? <span className="dashboard-selected-dot" /> : null}</button>; })}</HorizontalCardScroller><div className="dashboard-pager" aria-label="Room pages"><button aria-label="Previous room page" disabled={page.page === 0} onClick={() => setRequested({ roomId, floor, page: page.page - 1 })}><ChevronLeft size={17} /></button><span data-room-page role="status">{page.page + 1} / {page.pages}</span><button aria-label="Next room page" disabled={page.page + 1 === page.pages} onClick={() => setRequested({ roomId, floor, page: page.page + 1 })}><ChevronRight size={17} /></button></div><button className="dashboard-browse" onClick={onBrowse}><Grid2X2 size={17} />All rooms<ChevronRight size={15} /></button></aside>;
}

/** Portrait navigation gives the model its own full-width canvas. */
export function DashboardRoomBar({ onRooms, inert = false }: { onRooms: () => void; inert?: boolean }) {
  const roomId = useHomeStore((state) => state.roomId);
  const room = getRoom(roomId);
  const Icon = roomIcon(roomId);
  return <div inert={inert} className="dashboard-room-bar"><button aria-label="Choose a room" className="dashboard-room-select" onClick={onRooms}><CinematicArtwork artwork={roomArtwork(room)} presentation="thumbnail"><Icon /></CinematicArtwork><span className="dashboard-room-choice"><small>EXPLORE YOUR HOME</small><span>{room.name}</span></span><ChevronDown size={15} /></button><DashboardFloorSwitch /></div>;
}

/** Fit saved scene shortcuts to a clean scrolling row with native touch and keyboard browsing. */
export function DashboardScenes({ inert = false }: { inert?: boolean } = {}) {
  const { catalog, status, runScene, retry } = useSceneCatalog();
  const { rowRef, page, pageCount, pageSize, goToPage, onFocusCapture, onBlurCapture, onKeyDown } = useSceneCardPage(catalog.scenes);
  const keyboardHintId = useId();
  const paged = pageCount > 1;
  const icons = [Sun, Sparkles, Moon, Home];
  return <section inert={inert} ref={rowRef} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture} onKeyDown={onKeyDown} tabIndex={-1} className="dashboard-scenes" aria-label="Home scenes">
    <div className="dashboard-scenes-label"><Sparkles size={16} /><span>Scenes</span></div>
    {catalog.scenes.length > 0 && <HorizontalCardScroller className="preset-grid" page={page} count={pageCount} pageSize={pageSize} columns={pageSize} onChange={goToPage} label="Scene cards" resetKey={`${pageSize}:${catalog.scenes.map((scene) => scene.id).join('|')}`}>
      {catalog.scenes.map((scene) => {
        const presetIndex = MODEL_SCENE_PRESETS.findIndex((preset) => preset.sceneId === scene.id);
        const Icon = icons[presetIndex] ?? Sparkles;
        const artwork = sceneArtwork({ name: scene.name, modelPreset: MODEL_SCENE_PRESETS[presetIndex]?.id });
        return <button key={scene.id} data-scene-id={scene.id} className="dashboard-preset has-cinematic-artwork" title={`${scene.name} · ${scene.scope}`} aria-pressed={catalog.activeSceneId === scene.id} aria-describedby={paged ? keyboardHintId : undefined}
          onClick={() => runScene(scene.id)}><CinematicArtwork artwork={artwork} /><Icon size={17} strokeWidth={1.5} aria-hidden="true" /><span>{scene.name}</span></button>;
      })}
    </HorizontalCardScroller>}
    {paged && <span className="sr-only" id={keyboardHintId}>Use Left and Right arrow keys to browse scenes. Home and End move to the first and last scene.</span>}
    {paged && <span className="sr-only" role="status">Scene page {page + 1} of {pageCount}</span>}
    {!catalog.scenes.length && <div className="dashboard-scenes-empty" role="status">{status === 'loading' ? 'Loading scenes…' : status === 'error' ? <button onClick={retry}>Retry scenes</button> : 'No saved scenes'}</div>}
  </section>;
}

/** Put room and device browsing within thumb reach without another page. */
export function DashboardDock({ onRooms, onDevices, inert = false }: { onRooms: () => void; onDevices: () => void; inert?: boolean }) {
  const states = useHomeStore((state) => state.deviceStates);
  const access = useHomeStore((state) => state.access);
  const active = DEVICES.filter((device) => canViewSceneDevice(access, device.id) && states[device.id]?.on).length;
  return <nav inert={inert} className="dashboard-dock" aria-label="Home navigation"><button onClick={onRooms}><Layers3 size={18} /><span>Rooms</span></button><div><span className="status-dot" /><span>{active} devices active</span></div><button onClick={onDevices}><Grid2X2 size={18} /><span>Devices</span></button></nav>;
}
