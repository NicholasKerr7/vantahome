import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LabSlider from '../LabSlider';
import { fromNativeSliderValue, nativeSliderStep, toNativeSliderValue } from '../nativeSliderRange';

test.each([
  [0, 100, 1, 0, 1], [0, 100, 1, 100, 101], [2000, 6500, 100, 3800, 41],
  [-24, -12, 1, -18, 51], [0, 1, 0.1, 0.3, 31],
])('roundtrips logical range %s..%s at step %s without native default props', (min, max, step, value, expected) => {
  expect(toNativeSliderValue(value, min, max)).toBeCloseTo(expected);
  expect(fromNativeSliderValue(expected, min, max, step)).toBeCloseTo(value);
  expect(nativeSliderStep(min, max, step)).toBeGreaterThan(0);
});

test('a white-temperature slider can be reused as a closed gate with synchronized native props', () => {
  const changed = jest.fn();
  const screen = render(<LabSlider label="White temperature" min={2000} max={6500} step={100} value={6300} onValueChange={changed} />);
  screen.rerender(<LabSlider label="Open" value={0} valueText="0%" onValueChange={changed} />);
  const slider = screen.getByLabelText('Open');
  expect(slider.props).toMatchObject({ minimumValue: 1, maximumValue: 101, value: 1, accessibilityValue: { min: 0, max: 100, now: 0, text: '0%' } });
  fireEvent(slider, 'valueChange', 36);
  expect(changed).toHaveBeenLastCalledWith(35);
});

test('rejects nonfinite input and clamps native drag overshoot', () => {
  expect(fromNativeSliderValue(NaN, 0, 100, 1)).toBe(0);
  expect(fromNativeSliderValue(150, 2000, 6500, 100)).toBe(6500);
  expect(fromNativeSliderValue(-30, -24, -12, 1)).toBe(-24);
});
