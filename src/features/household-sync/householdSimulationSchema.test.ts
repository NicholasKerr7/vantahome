import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEVICE_KINDS, getCapabilities, isMonitor } from '../../../packages/home-scene/src/deviceCapabilities';
import { simulatedStatusFields } from '../../../packages/home-scene/src/deviceControlCatalog';

type Rule = { type: 'boolean' } | { type: 'range'; min: number; max: number; step: number }
  | { type: 'enum'; values: (string | number | boolean)[] };

/** Capability changes must explicitly update server validation, rather than silently rejecting saved console controls. */
test('shared server validation covers the current console capabilities and simulated status fields', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/029_household_simulation_sync.sql'), 'utf8');
  const source = sql.match(/\$schema\$([\s\S]+?)\$schema\$/)?.[1];
  expect(source).toBeDefined();
  const expected = Object.fromEntries(DEVICE_KINDS.map((kind) => {
    const fields: Record<string, Rule[]> = {};
    /** Accumulate alternative accepted scalar values for one persisted capability. */
    function add(field: string, rule: Rule): void { (fields[field] ??= []).push(rule); }
    for (const capability of [...getCapabilities(kind), ...(simulatedStatusFields[kind] ?? [])]) {
      if (capability.type === 'range') add(capability.field, { type: 'range', min: capability.min, max: capability.max, step: capability.step ?? 1 });
      if (capability.type === 'toggle') add(capability.field, { type: 'boolean' });
      if (capability.type === 'enum') add(capability.field, { type: 'enum', values: capability.options.map((option) => option.value) });
      if (capability.type === 'action') {
        add('lastAction', { type: 'enum', values: [capability.id] });
        for (const [field, value] of Object.entries(capability.patch)) if (field !== 'isOn') add(field, { type: 'enum', values: [value] });
      }
    }
    if (isMonitor(kind)) add('sampleChecked', { type: 'enum', values: [true] });
    for (const [field, rules] of Object.entries(fields)) {
      const values = rules.flatMap((rule) => rule.type === 'enum' ? rule.values : []);
      fields[field] = [...rules.filter((rule) => rule.type !== 'enum'), ...(values.length ? [{ type: 'enum' as const, values: [...new Set(values)] }] : [])];
    }
    return [kind, fields];
  }));
  expect(JSON.parse(source!)).toEqual(expected);
});
