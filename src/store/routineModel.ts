import type { AutomationFlow, AutomationRule, HomeState } from "./useHomeStore";

/** One execution/editor shape, independent of the older persistence collections. */
export type RoutineDraft = Pick<AutomationFlow, "name" | "enabled" | "triggers" | "conditions" | "actions">;
export type Routine = RoutineDraft & {
  id: string;
  source: { kind: "rule" | "flow"; id: string };
};
export type RoutineCollections = Pick<HomeState, "rules" | "flows">;

const normalizedCache = new WeakMap<AutomationRule[], WeakMap<AutomationFlow[], Routine[]>>();

/** Namespaces remain distinct even when imported legacy records share raw IDs. */
export function routineId(kind: "rule" | "flow", id: string): string {
  return `${kind}:${encodeURIComponent(id)}`;
}

/** Adapt existing records without rewriting storage or changing their behavior. */
export function selectRoutines({ rules, flows }: RoutineCollections): Routine[] {
  const cached = normalizedCache.get(rules)?.get(flows);
  if (cached) return cached;
  const promotedIds = new Set(flows.flatMap((flow) => flow.legacyRuleId !== undefined ? [flow.legacyRuleId] : []));
  const routines: Routine[] = [
    ...rules.filter((rule) => !promotedIds.has(rule.id)).map((rule): Routine => ({
      id: routineId("rule", rule.id),
      name: rule.name,
      enabled: rule.enabled,
      triggers: [rule.trigger],
      conditions: [],
      actions: [rule.action],
      source: { kind: "rule", id: rule.id },
    })),
    ...flows.map((flow): Routine => ({
      id: routineId(flow.legacyRuleId !== undefined ? "rule" : "flow", flow.legacyRuleId ?? flow.id),
      name: flow.name,
      enabled: flow.enabled,
      triggers: flow.triggers,
      conditions: flow.conditions,
      actions: flow.actions,
      source: { kind: "flow", id: flow.id },
    })),
  ];
  const byFlows = normalizedCache.get(rules) ?? new WeakMap<AutomationFlow[], Routine[]>();
  byFlows.set(flows, routines);
  normalizedCache.set(rules, byFlows);
  return routines;
}

/** Avoid timestamp collisions when two editor/device shortcuts save together. */
export function nextRoutineRecordId(records: ReadonlyArray<{ id: string }>, prefix: string): string {
  const base = `${prefix}${Date.now()}`;
  const ids = new Set(records.map(({ id }) => id));
  let id = base;
  for (let suffix = 1; ids.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

/** Copy editable fields explicitly so callers cannot replace persistence identity. */
export function routineDraft(routine: RoutineDraft): RoutineDraft {
  return {
    name: routine.name,
    enabled: routine.enabled,
    triggers: routine.triggers.map((trigger) => ({ ...trigger })),
    conditions: routine.conditions.map((condition) => condition.type === "day"
      ? { ...condition, days: [...condition.days] }
      : { ...condition }),
    actions: routine.actions.map((action) => ({ ...action })),
  };
}

/** A legacy schedule becomes one richer record atomically, retaining its public ID. */
export function updateRoutineCollections(
  state: RoutineCollections,
  id: string,
  patch: Partial<RoutineDraft>,
): Partial<RoutineCollections> {
  const routine = selectRoutines(state).find((candidate) => candidate.id === id);
  if (!routine) return {};
  const draft = routineDraft({ ...routine, ...patch });
  if (routine.source.kind === "flow") {
    return { flows: state.flows.map((flow) => flow.id === routine.source.id ? { ...flow, ...draft } : flow) };
  }
  return {
    rules: state.rules.filter((rule) => rule.id !== routine.source.id),
    flows: [...state.flows, {
      ...draft,
      id: nextRoutineRecordId(state.flows, "f"),
      legacyRuleId: routine.source.id,
    }],
  };
}

/** Remove both aliases if an imported backup contains a promoted schedule twice. */
export function removeRoutineCollections(state: RoutineCollections, id: string): Partial<RoutineCollections> {
  const routine = selectRoutines(state).find((candidate) => candidate.id === id);
  if (!routine) return {};
  return {
    rules: state.rules.filter((rule) => routineId("rule", rule.id) !== id),
    flows: state.flows.filter((flow) => routineId(flow.legacyRuleId !== undefined ? "rule" : "flow", flow.legacyRuleId ?? flow.id) !== id),
  };
}
