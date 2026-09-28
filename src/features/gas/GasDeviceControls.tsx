import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { gasActionFeedback, gasDeviceStatus, gasStatusTone } from "../../../packages/home-scene/src/gasSimulation";
import Pressable from "../../components/Pressable";
import { runtimePolicy } from "../../config/runtimeMode";
import { useHomeStore, type Device } from "../../store/useHomeStore";
import { theme } from "../../theme/theme";
import { canShareDemoDevices } from "../three-d-home/simulationSession";
import { GAS_DEMO_IDS, projectGasDevice } from "./gasDemoDevices";
import { gasDemoState, runGasDemoIntent } from "./gasDemoControls";

type GasControlsProps = { device: Device };
type Page = "overview" | "actions" | "budget" | "alerts";
const METER_PAGES: readonly { id: Page; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "actions", label: "Scenarios" },
  { id: "budget", label: "Budget" }, { id: "alerts", label: "Alerts" },
];
const DETECTOR_PAGES = METER_PAGES.filter((page) => page.id !== "budget");

/** Format finite local samples without making missing readings look like measurements. */
function sample(value: number | undefined, unit: string, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : "—";
}

/** Keep compact readouts aligned on phone and tablet widths. */
function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

/** Render a thumb-sized, clearly labeled local simulation action. */
function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>;
}

/** Keep alert preferences separate from acknowledgement and active leak state. */
function Preference({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)} style={styles.preference}>
    <Text style={styles.preferenceLabel}>{label}</Text><Text style={[styles.preferenceValue, value && styles.preferenceEnabled]}>{value ? "On" : "Off"}</Text>
  </Pressable>;
}

/** Edit bounded sample preferences with an accessible native slider. */
function Range({ label, value, min, max, step, unit, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; disabled: boolean; onChange: (value: number) => void }) {
  return <View style={styles.range}><View style={styles.rangeHeading}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{sample(value, unit, 0)}</Text></View>
    <Slider accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: `${value} ${unit}` }} minimumValue={min} maximumValue={max} step={step} value={value} disabled={disabled} onSlidingComplete={onChange} minimumTrackTintColor={theme.colors.accent2} maximumTrackTintColor="#DDD6EC" thumbTintColor={theme.colors.accent2} />
  </View>;
}

/** Show working gas sample controls while keeping hardware transport and safety controls unavailable. */
export default function GasDeviceControls({ device }: GasControlsProps) {
  const [selectedPage, setSelectedPage] = useState<Page>("overview");
  const localDemo = useHomeStore((home) => canShareDemoDevices(home, runtimePolicy.mode));
  const editable = localDemo && ((device.kind === "gas-meter" && device.id === GAS_DEMO_IDS.meter)
    || (device.kind === "gas-leak" && device.id === GAS_DEMO_IDS.detector));
  const meter = device.kind === "gas-meter";
  const gasKind = meter ? "gas-meter" : "gas-leak";
  const gasState = gasDemoState(device);
  const gas = projectGasDevice(device, gasState);
  const pages = meter ? METER_PAGES : DETECTOR_PAGES;
  const page = pages.some((candidate) => candidate.id === selectedPage) ? selectedPage : "overview";
  const tone = gasStatusTone(gasKind, gasState);
  const alert = meter ? !!gas.gasLeakInterlock : !!gas.gasLeakDetected;
  const status = gasDeviceStatus(gasKind, gasState);

  /** Route a catalogued action directly to the guarded local reducer. */
  function act(actionId: string): void { runGasDemoIntent(device.id, { type: "action", actionId }); }
  /** Write only schema-validated sample preferences through the same local reducer. */
  function set(field: string, value: number | boolean): void { runGasDemoIntent(device.id, { type: "setting", field, value }); }

  return <View style={styles.layout}>
    <View style={styles.tabs} accessibilityRole="tablist">
      {pages.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${item.label} gas controls`} accessibilityState={{ selected: page === item.id }} onPress={() => setSelectedPage(item.id)} style={[styles.tab, page === item.id && styles.tabSelected]}>
        <Text style={[styles.tabText, page === item.id && styles.tabTextSelected]}>{item.label}</Text>
      </Pressable>)}
    </View>
    {page === "overview" ? <>
    <View style={[styles.hero, tone === "warning" && styles.heroWarning, alert && styles.heroAlert]}>
      <Text style={styles.eyebrow}>LOCAL SIMULATION</Text>
      <Text style={styles.title}>{meter ? "LPG supply" : "Gas leak detector"}</Text>
      <Text style={styles.heroValue}>{meter ? sample(gas.gasRemainingKg, "kg") : sample(gas.gasConcentrationPercentLel, "% LEL", 0)}</Text>
      <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
      <Text style={styles.caption}>{meter ? `${sample(gas.gasRemainingPercent, "%", 0)} remaining · 12.5 kg sample · exterior service wall` : "Kitchen sample sensor · LEL means lower explosive limit"}</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{meter ? "Consumption & supply" : "Sensor & alarm"}</Text>
      <View style={styles.metrics}>
        {meter ? <>
          <Metric label="Flow" value={sample(gas.gasFlowKgH, "kg/h", 2)} />
          <Metric label="Used today" value={sample(gas.gasTodayKg, "kg", 2)} />
          <Metric label="Used this month" value={sample(gas.gasMonthKg, "kg", 2)} />
        </> : <>
          <Metric label="Battery" value={sample(gas.gasBatteryPercent, "%", 0)} />
          <Metric label="Self-tests" value={String(gas.gasTestCount ?? 0)} />
          <Metric label="Last test" value={gas.gasTestResult === "passed" ? "Passed" : "Not run"} />
        </>}
      </View>
    </View>
    </> : <View style={[styles.compactStatus, alert && styles.heroAlert]}>
      <Text style={styles.eyebrow}>LOCAL SIMULATION</Text><Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
    </View>}

    {page === "actions" && <View style={styles.card}>
      <Text style={styles.sectionTitle}>Try a scenario</Text>
      <View style={styles.actions}>
        {meter ? <>
          <Action label="Simulate usage" disabled={!editable || !gas.gasValveOpen || alert} onPress={() => act("gas-meter-use-sample")} />
          <Action label="Refill sample cylinder" disabled={!editable} onPress={() => act("gas-meter-refill")} />
          <Action label="Open simulated valve" disabled={!editable || alert || gas.gasValveOpen} onPress={() => act("gas-meter-open-valve")} />
          <Action label="Close simulated valve" disabled={!editable || !gas.gasValveOpen} onPress={() => act("gas-meter-close-valve")} />
        </> : <>
          <Action label="Run self-test" disabled={!editable} onPress={() => act("gas-leak-self-test")} />
          <Action label="Simulate a leak" disabled={!editable || alert} onPress={() => act("gas-leak-simulate-leak")} />
          <Action label="Silence demo alarm" disabled={!editable || !alert || gas.gasAlarmSilenced} onPress={() => act("gas-leak-silence")} />
          <Action label="Clear leak scenario" disabled={!editable || !alert} onPress={() => act("gas-leak-clear-leak")} />
        </>}
      </View>
      <Text style={styles.note} accessibilityLiveRegion="polite">{gasActionFeedback(gasKind, gasState)}</Text>
      <Text style={styles.note}>{meter ? "Leak active: reopening is blocked. Clearing a leak never reopens the valve."
        : "Silencing and self-tests keep the leak active. Clear the scenario separately."}</Text>
    </View>}

    {(page === "budget" || page === "alerts") && <View style={styles.card}>
      <Text style={styles.sectionTitle}>{meter ? "Budget & reminders" : "Demo alert preferences"}</Text>
      {page === "budget" ? <>
        <Range label="Monthly usage budget" value={gas.gasBudgetKg ?? 25} min={5} max={100} step={1} unit="kg" disabled={!editable} onChange={(value) => set("gasBudgetKg", value)} />
        <Range label="Refill reminder threshold" value={gas.gasRefillAlertPercent ?? 20} min={5} max={50} step={1} unit="%" disabled={!editable} onChange={(value) => set("gasRefillAlertPercent", value)} />
        <Text style={styles.note}>{gas.gasBudgetExceeded ? "Sample usage budget exceeded." : "Sample usage is within budget."} {gas.gasRefillDue ? "Sample supply reached the refill threshold." : "Sample supply is above the refill threshold."}</Text>
      </> : meter ? <>
        <Preference label="Usage budget alerts" value={gas.gasUsageAlerts ?? true} disabled={!editable} onChange={(value) => set("gasUsageAlerts", value)} />
        <Preference label="Refill reminders" value={gas.gasRefillAlerts ?? true} disabled={!editable} onChange={(value) => set("gasRefillAlerts", value)} />
      </> : <>
        <Preference label="Leak alert preference" value={gas.gasLeakAlerts ?? true} disabled={!editable} onChange={(value) => set("gasLeakAlerts", value)} />
        <Preference label="Simulated automatic shutoff" value={gas.gasAutoShutoff ?? true} disabled={!editable} onChange={(value) => set("gasAutoShutoff", value)} />
      </>}
    </View>}
    <Text style={styles.note}>{editable ? "Local demo · no connected gas hardware." : "Controls require the offline Owner demo. No hardware control."}</Text>
  </View>;
}

const styles = StyleSheet.create({
  layout: { gap: 10, paddingBottom: 8 },
  tabs: { flexDirection: "row", gap: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.card2 },
  tabSelected: { backgroundColor: theme.colors.accent2 },
  tabText: { fontSize: 12, fontWeight: "700", color: theme.colors.subtext },
  tabTextSelected: { color: "#FFFFFF" },
  compactStatus: { padding: 14, gap: 5, borderRadius: theme.radius.sm, backgroundColor: theme.colors.card2 },
  hero: { backgroundColor: theme.colors.card2, borderRadius: theme.radius.lg, padding: 16, gap: 5, borderWidth: 1, borderColor: theme.colors.stroke },
  heroAlert: { backgroundColor: "#30212A", borderColor: "#A35C6C" },
  heroWarning: { backgroundColor: "#302B20", borderColor: "#A58B57" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: theme.colors.accent },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  heroValue: { fontSize: 38, fontWeight: "800", color: theme.colors.accent },
  status: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  caption: { fontSize: 12, lineHeight: 18, color: theme.colors.subtext },
  card: { padding: 16, gap: 12, backgroundColor: theme.colors.card2, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.stroke },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flexGrow: 1, flexBasis: "45%", minWidth: 0, gap: 5, paddingVertical: 6 },
  label: { fontSize: 12, color: theme.colors.subtext, fontWeight: "600" },
  metricValue: { fontSize: 16, color: theme.colors.text, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { flexGrow: 1, flexBasis: "45%", minWidth: 0, minHeight: 48, padding: 10, borderRadius: theme.radius.sm, backgroundColor: theme.colors.card2, justifyContent: "center", alignItems: "center" },
  disabled: { opacity: 0.45 },
  actionText: { color: theme.colors.accent, fontSize: 13, fontWeight: "700", textAlign: "center" },
  preference: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  preferenceLabel: { flex: 1, color: theme.colors.subtext, fontSize: 14 },
  preferenceValue: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 14, backgroundColor: theme.colors.card2, color: theme.colors.subtext, fontWeight: "700" },
  preferenceEnabled: { backgroundColor: theme.colors.card2, color: theme.colors.accent },
  range: { gap: 7 },
  rangeHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  note: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
});
