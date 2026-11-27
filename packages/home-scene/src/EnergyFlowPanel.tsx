import { BatteryCharging, House, Power, Sun, UtilityPole, type LucideIcon } from 'lucide-react';
import { ENERGY_DEMO_DESCRIPTION, ENERGY_SHARED_PAUSED_DESCRIPTION, energyFlowSummary, formatFlowPower, generatorPhaseLabel, storageFlowLabel, gridFlowLabel, type EnergyFlow } from './energyFlowPresentation';
import type { EnergyRuntime } from './energySimulation';

interface Props {
  flow: EnergyFlow | null; runtime?: EnergyRuntime | null; sharedPaused: boolean; pauseReason?: string; canManage: boolean; gridAvailable?: boolean | null;
  onEnabledChange: (enabled: boolean) => void;
}

/** Source nodes display direction in words as well as color, with no independent animation loop. */
function Source({ label, detail, value, icon: Icon, active }: { label: string; detail: string; value?: number; icon: LucideIcon; active: boolean }) {
  return <div className="energy-flow-source" data-active={active}>
    <Icon size={19} aria-hidden="true" /><span>{label}<small>{detail}</small></span><strong>{formatFlowPower(value)}</strong>
  </div>;
}

/** Explain the coordinated electrical preview in a bounded, touch-friendly console panel. */
export function EnergyFlowPanel({ flow, runtime, sharedPaused, pauseReason = ENERGY_SHARED_PAUSED_DESCRIPTION, canManage, onEnabledChange, gridAvailable }: Props) {
  const enabled = runtime?.enabled === true;
  return <section className="energy-flow-panel" aria-label="Property power flow simulation">
    <div className="energy-flow-heading"><span>PROPERTY POWER FLOW</span><strong>{sharedPaused ? 'Power flow paused' : flow?.sourceLabel ?? 'Your home, connected'}</strong></div>
    <div className="energy-flow-network">
      <div className="energy-flow-sources">
        <Source label="Solar" detail="Production" value={flow?.solarKw} icon={Sun} active={Boolean(flow && flow.solarKw > 0)} />
        <Source label="Storage" detail={storageFlowLabel(flow)} value={flow?.batteryKw} icon={BatteryCharging} active={Boolean(flow && Math.abs(flow.batteryKw) > 0.01)} />
        <Source label="JPS" detail={gridFlowLabel(flow, gridAvailable)} value={flow?.gridKw} icon={UtilityPole} active={Boolean(flow && flow.gridKw > 0)} />
        <Source label="Generator" detail={runtime && flow ? generatorPhaseLabel(runtime) : 'Backup'} value={flow?.generatorKw} icon={Power} active={Boolean(flow && flow.generatorKw > 0)} />
      </div>
      <div className="energy-flow-home" data-active={Boolean(flow && flow.homeKw > 0)}><House size={27} aria-hidden="true" /><span>HOME SUPPLY</span><strong>{formatFlowPower(flow?.homeKw)}</strong><small>{flow ? `${Math.round(flow.batteryPercent)}% stored` : 'Simulation estimates'}</small></div>
    </div>
    <p className="energy-flow-status">{sharedPaused ? pauseReason : energyFlowSummary(flow, runtime ?? undefined)}</p>
    <button type="button" className="energy-primary" disabled={!canManage || sharedPaused} onClick={() => onEnabledChange(!enabled)}>
      {enabled ? 'Pause energy simulation' : runtime && runtime.elapsedSeconds > 0 ? 'Resume energy simulation' : 'Start energy simulation'}
    </button>
    <p className="energy-flow-disclosure">{ENERGY_DEMO_DESCRIPTION}</p>
  </section>;
}
