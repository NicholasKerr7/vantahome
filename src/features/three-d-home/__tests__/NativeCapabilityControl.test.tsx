import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { getCapabilities } from '../../../../packages/home-scene/src/deviceCapabilities';
import LabSlider from '../../renderer-lab/LabSlider';
import { NativeCapabilityControl } from '../NativeCapabilityControl';

const fixtures = [
  ['door', 'entry-door'], ['garage', 'utility-shutter'], ['window', 'kitchen-window'],
] as const;

/** Keep native generic controls real while recording every possible simulation mutation. */
function setup(id: string, capabilityId: string, level = Number.NaN, disabled = false) {
  const device = getDevice(id)!;
  const capability = getCapabilities(device.kind).find((item) => item.id === capabilityId)!;
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { capability, device, state: { on: false, level }, client, disabled, compact: false, onOptions: jest.fn() };
  return { screen: render(<NativeCapabilityControl {...props} />), props, client };
}

describe.each(fixtures)('%s native More position controls', (kind, id) => {
  test.each([Number.NaN, Infinity, -Infinity])('keeps malformed %s out of the slider and accessible value until accepted recovery', (level) => {
    const capability = getCapabilities(kind).find((item) => 'field' in item && item.field === 'openPercent')!;
    const { screen, props, client } = setup(id, capability.id, level);
    const slider = screen.UNSAFE_getByType(LabSlider);
    expect(slider.props).toMatchObject({ value: 0, valueText: 'Position unavailable', disabled: true });
    expect(screen.getByText('Position unavailable')).toBeTruthy();
    const accessible = screen.getByLabelText(capability.label);
    expect(accessible.props.accessibilityValue).toMatchObject({ now: 0, text: 'Position unavailable' });
    expect(accessible.props['aria-valuenow']).toBe(0);
    act(() => slider.props.onValueChange(50));
    expect(client.setSetting).not.toHaveBeenCalled();
    screen.rerender(<NativeCapabilityControl {...props} state={{ on: true, level: 25 }} />);
    expect(screen.UNSAFE_getByType(LabSlider).props).toMatchObject({ value: 25, valueText: '25%', disabled: false });
    expect(screen.queryByText('Position unavailable')).toBeNull();
    act(() => screen.UNSAFE_getByType(LabSlider).props.onValueChange(30));
    expect(client.setSetting).toHaveBeenLastCalledWith(id, 'openPercent', 30);
  });

  test('disables unknown relative actions while keeping explicit Open/Close and window Vent available', () => {
    for (const suffix of ['position-up', 'position-down', 'command-open', 'command-close', ...(kind === 'window' ? ['vent'] : [])]) {
      const { screen, props, client } = setup(id, `${kind}-${suffix}`);
      const button = screen.getByRole('button');
      const relative = suffix.startsWith('position-');
      expect(button.props.accessibilityState.disabled).toBe(relative);
      fireEvent.press(button);
      if (relative) expect(client.runAction).not.toHaveBeenCalled();
      else expect(client.runAction).toHaveBeenCalledWith(id, props.capability.id);
      screen.unmount();
    }
  });

  test('keeps independent schedules editable and preserves external disabled state after recovery', () => {
    const scheduled = setup(id, `${kind}-scheduleHour`);
    expect(scheduled.screen.UNSAFE_getByType(LabSlider).props.disabled).toBe(false);
    scheduled.screen.unmount();
    const capability = getCapabilities(kind).find((item) => 'field' in item && item.field === 'openPercent')!;
    const { screen, client } = setup(id, capability.id, 25, true);
    const slider = screen.UNSAFE_getByType(LabSlider);
    expect(slider.props).toMatchObject({ disabled: true, value: 25, valueText: '25%' });
    act(() => slider.props.onValueChange(50));
    expect(client.setSetting).not.toHaveBeenCalled();
  });
});
