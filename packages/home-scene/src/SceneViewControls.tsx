import { Home, Layers3, MoveUpRight } from 'lucide-react';
import { canExploreInteriorLayout, canViewPropertyOverview } from './sceneAccess';
import { useHomeStore } from './state';

/** Keep the property and assigned-room entry points available without granting interior access. */
export function SceneViewControls({ onRooms }: { onRooms: () => void }) {
  const access = useHomeStore((state) => state.access);
  const view = useHomeStore((state) => state.view);
  const floor = useHomeStore((state) => state.floor);
  const roomId = useHomeStore((state) => state.roomId);
  const setView = useHomeStore((state) => state.setView);
  const overview = canViewPropertyOverview(access);
  const layout = canExploreInteriorLayout(access);
  if (!overview && !layout) return null;
  return <div className={`view-controls${!access.fullHome ? ' scoped-view-controls' : ''}`} aria-label="House view">
    {overview && <button aria-pressed={view === 'exterior'} onClick={() => setView(access.fullHome && view === 'exterior' ? floor : 'exterior')}><Home size={15} aria-hidden="true" /><span>{access.fullHome ? 'Landscape' : 'Property'}</span></button>}
    {!access.fullHome && access.roomIds.length > 0 && <button onClick={onRooms}><Layers3 size={15} aria-hidden="true" /><span>My rooms</span></button>}
    {layout && <button aria-pressed={view === 'ground' || view === 'upper'} onClick={() => setView(floor)}><Layers3 size={15} aria-hidden="true" /><span>Floor plan</span></button>}
    {layout && <button aria-pressed={view === 'immersive'} onClick={() => setView(view === 'immersive' ? floor : 'immersive')}><MoveUpRight size={15} aria-hidden="true" /><span>{roomId === 'grounds' ? 'Gate view' : 'Immersive'}</span></button>}
  </div>;
}
