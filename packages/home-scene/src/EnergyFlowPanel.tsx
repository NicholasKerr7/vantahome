import { useState } from 'react';
import { BatteryCharging, Power, Sun, UtilityPole, type LucideIcon } from 'lucide-react';
import { ENERGY_DEMO_DESCRIPTION, ENERGY_SHARED_PAUSED_DESCRIPTION, formatFlowPower, generatorPhaseLabel, storageFlowLabel, gridFlowLabel, type EnergyFlow } from './energyFlowPresentation';
import { describeEnergyFlow, sourceFlowDirection, type EnergySourceId } from './energyFlowInsights';
import { EnergyFlowArtwork } from './EnergyFlowArtwork';
import type { EnergyRuntime } from './energySimulation';

interface Props {
  flow: EnergyFlow | null; runtime?: EnergyRuntime | null; sharedPaused: boolean; pauseReason?: string; canManage: boolean; gridAvailable?: boolean | null;
  motionDisabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

/** Source inspection changes only the explanation, never equipment or simulation settings. */
function Source({ label, detail, value, icon: Icon, active, selected, onSelect }: {
  label: string; detail: string; value?: number; icon: LucideIcon; active: boolean; selected: boolean; onSelect: () => void;
}) {
  return <button type="button" className="energy-flow-source" data-active={active} aria-pressed={selected}
    aria-label={`${label}: ${formatFlowPower(value)}, ${detail}. Inspect power source`} onClick={onSelect}>
    <Icon size={17} aria-hidden="true" /><span>{label}<small>{detail}</small></span><strong>{formatFlowPower(value)}</strong>
  </button>;
}

/** A bounded vector power map explains the current model without adding an independent simulation. */
export function EnergyFlowPanel({ flow, runtime, sharedPaused, pauseReason = ENERGY_SHARED_PAUSED_DESCRIPTION, canManage, onEnabledChange, gridAvailable, motionDisabled = false }: Props) {
  const [selected, setSelected] = useState<EnergySourceId | null>(null);
  const enabled = runtime?.enabled === true;
  const insight = !flow && !runtime && canManage && !sharedPaused
    ? { title: 'Ready when you are', body: 'Start the simulation to see solar, storage and backup serve the property.', tone: 'calm', waitingNames: [] }
    : describeEnergyFlow(flow, runtime, selected);
  const sources: { id: EnergySourceId; label: string; detail: string; value?: number; icon: LucideIcon }[] = [
    { id: 'solar', label: 'Solar', detail: 'Production', value: flow?.solarKw, icon: Sun },
    { id: 'grid', label: 'JPS', detail: gridFlowLabel(flow, gridAvailable), value: flow?.gridKw, icon: UtilityPole },
    { id: 'battery', label: 'Storage', detail: storageFlowLabel(flow), value: flow?.batteryKw, icon: BatteryCharging },
    { id: 'generator', label: 'Generator', detail: runtime && flow ? generatorPhaseLabel(runtime) : 'Backup', value: flow?.generatorKw, icon: Power },
  ];
  return <section className="energy-flow-panel" aria-label="Property power flow simulation">
    <div className="energy-flow-heading"><span>PROPERTY POWER FLOW</span><strong>{sharedPaused ? 'Power flow paused' : runtime && !enabled ? 'Simulation paused' : flow?.sourceLabel ?? 'Your home, connected'}</strong></div>
    <div className="energy-flow-network">
      <EnergyFlowArtwork flow={flow} selected={selected} motionDisabled={motionDisabled || !enabled || sharedPaused} />
      <div className="energy-flow-home"><span>HOME SUPPLY<strong>{formatFlowPower(flow?.homeKw)}</strong></span><small>{flow ? `${Math.round(flow.batteryPercent)}% stored` : 'Simulation estimates'}</small></div>
    </div>
    <div className="energy-flow-sources" role="group" aria-label="Inspect a power source">
      {sources.map((source) => <Source key={source.id} {...source} active={sourceFlowDirection(flow, source.id) !== 'idle'} selected={selected === source.id}
        onSelect={() => setSelected(selected === source.id ? null : source.id)} />)}
    </div>
    <div className="energy-flow-status" role="note" aria-label={insight.waitingNames.length ? `${insight.title}. Waiting: ${insight.waitingNames.join(', ')}. ${insight.body}` : undefined} data-tone={sharedPaused ? 'attention' : insight.tone}>
      <strong>{sharedPaused ? 'Local simulation paused' : insight.title}</strong><p>{sharedPaused ? pauseReason : insight.body}</p>
    </div>
    <button type="button" className="energy-primary" disabled={!canManage || sharedPaused} onClick={() => onEnabledChange(!enabled)}>
      {enabled ? 'Pause energy simulation' : runtime && runtime.elapsedSeconds > 0 ? 'Resume energy simulation' : 'Start energy simulation'}
    </button>
    <p className="energy-flow-disclosure">{ENERGY_DEMO_DESCRIPTION}</p>
  </section>;
}
