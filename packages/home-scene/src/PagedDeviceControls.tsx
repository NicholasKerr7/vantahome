import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CapabilityControls } from './CapabilityControls';
import { getInspectorPages } from './deviceRoutinePages';
import { isEmbeddedScene, requestDeviceRoutines } from './embeddedHost';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './state';
import { useControlPageCapacity } from './useControlPageCapacity';
import './paged-device-controls.css';

const GROUPS = [
  { id: 'controls', label: 'Controls' }, { id: 'modes', label: 'Modes' },
  { id: 'schedule', label: 'Routines' }, { id: 'status', label: 'Status' },
] as const;
type GroupId = typeof GROUPS[number]['id'];

/** Reserve space for touch targets and safe areas on a short phone or tablet. */
function useShortControlPages(): boolean {
  const [short, setShort] = useState(() => window.matchMedia('(max-height: 680px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-height: 680px)');
    const update = () => setShort(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  return short;
}

/** Present the shared control pages with visible navigation and accessible category tabs. */
export function PagedDeviceControls({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const short = useShortControlPages();
  const panel = useRef<HTMLDivElement>(null);
  const capacity = useControlPageCapacity(panel, short);
  const pages = getInspectorPages(device, capacity.fields, capacity.actions);
  const availableGroups = GROUPS.filter(({ id }) => pages.some((page) => page.group === id));
  const [selectedGroup, setSelectedGroup] = useState<GroupId>(pages[0]?.group ?? 'controls');
  const [pageAnchor, setPageAnchor] = useState<string | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const groupPages = pages.filter((page) => page.group === selectedGroup);
  // Retain the currently visible capability if a resize repartitions its category.
  const currentIndex = Math.max(0, groupPages.findIndex((candidate) => candidate.id === 'shared-routines' && pageAnchor === candidate.id || candidate.capabilities.some((capability) => capability.id === pageAnchor)));
  const page = groupPages[currentIndex];
  const panelId = `sheet-pages-${device.id}`;

  /** Start each category at its first shared page; keep focus on the selected tab. */
  function selectGroup(group: GroupId) {
    setSelectedGroup(group);
    setPageAnchor(null);
  }

  /** Provide the standard arrow, Home and End behavior for a horizontal tab list. */
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const focusedGroup = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>('[role="tab"]')?.dataset.controlGroup : undefined;
    const index = availableGroups.findIndex(({ id }) => id === (focusedGroup ?? selectedGroup));
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % availableGroups.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + availableGroups.length) % availableGroups.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = availableGroups.length - 1;
    else return;
    const group = availableGroups[next];
    if (!group) return;
    event.preventDefault();
    selectGroup(group.id);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-control-group="${group.id}"]`)?.focus({ preventScroll: true });
  }

  /** Focus the changed panel so keyboard users can continue into its first field. */
  function changePage(next: number) {
    const nextPage = groupPages[next];
    setPageAnchor(nextPage?.capabilities[0]?.id ?? nextPage?.id ?? null);
    panel.current?.focus({ preventScroll: true });
  }

  /** Keep the focused field or action mounted when resizing repartitions its category. */
  function anchorFocusedCapability(event: FocusEvent<HTMLDivElement>) {
    const capabilityId = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-capability-id]')?.dataset.capabilityId : undefined;
    if (capabilityId) setPageAnchor(capabilityId);
  }

  return <section className="paged-device-controls" aria-label="Device settings">
    <div ref={tabs} className="device-control-tabs" role="tablist" aria-label="Control categories" onKeyDown={navigateTabs}>
      {GROUPS.map(({ id, label }) => <button key={id} id={`sheet-tab-${device.id}-${id}`} type="button" role="tab" data-control-group={id} aria-selected={selectedGroup === id} aria-controls={panelId} disabled={!availableGroups.some((group) => group.id === id)} tabIndex={selectedGroup === id ? 0 : -1} onClick={() => selectGroup(id)}>{label}</button>)}
    </div>
    <div ref={panel} id={panelId} className={`device-control-page ${page?.compact ? 'is-compact' : ''}`} role="tabpanel" aria-labelledby={`sheet-tab-${device.id}-${selectedGroup}`} tabIndex={-1} onFocusCapture={anchorFocusedCapability}>
      {selectedGroup === 'schedule' && page?.id !== 'shared-routines' ? <p className="device-control-context">Device timer preferences · Simulation only</p> : null}
      {selectedGroup === 'status' ? <p className="device-control-context">Simulation readings</p> : null}
      {page?.id === 'shared-routines' ? <div className="device-routine-entry">
        <h3>One place for every routine</h3>
        <p>Schedules and automatic actions are managed together in VantaHome. Device linking is required.</p>
        <button type="button" className="device-routine-open" disabled={!isEmbeddedScene()} onClick={() => requestDeviceRoutines(device.id)}>View device routines</button>
        <small>{isEmbeddedScene() ? 'Preview routines run while the app is open. An always-on hub is not connected.' : 'Open the VantaHome app to manage routines.'}</small>
      </div> : page ? <CapabilityControls device={device} current={current} capabilities={page.capabilities} prefix="sheet-" /> : <p className="device-control-empty">No additional settings for this device.</p>}
    </div>
    <footer className="device-control-pagination">
      <button type="button" aria-label="Previous controls page" aria-controls={panelId} disabled={currentIndex === 0} onClick={() => changePage(currentIndex - 1)}><ChevronLeft size={16} aria-hidden="true" /><span>Previous</span></button>
      <p role="status" aria-live="polite" aria-atomic="true">{currentIndex + 1} / {Math.max(1, groupPages.length)}<span className="sr-only"> {selectedGroup} pages</span></p>
      <button type="button" aria-label="Next controls page" aria-controls={panelId} disabled={currentIndex >= groupPages.length - 1} onClick={() => changePage(currentIndex + 1)}><span>Next</span><ChevronRight size={16} aria-hidden="true" /></button>
    </footer>
  </section>;
}
