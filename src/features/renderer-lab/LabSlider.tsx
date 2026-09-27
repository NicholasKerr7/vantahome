import React from "react";
import Slider from "@react-native-community/slider";
import { labColors, labStyles as styles } from "./styles";
import { fromNativeSliderValue, nativeSliderStep, NATIVE_SLIDER_MAX, NATIVE_SLIDER_MIN, toNativeSliderValue } from './nativeSliderRange';

export type LabSliderProps = {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  valueText?: string;
  disabled?: boolean;
};

/** Preserve the platform slider and its screen-reader percentage on native devices. */
export default function LabSlider({ label, value, onValueChange, min = 0, max = 100, step = 1, valueText = `${value} percent open`, disabled = false }: LabSliderProps) {
  return <Slider style={styles.slider} minimumValue={NATIVE_SLIDER_MIN} maximumValue={NATIVE_SLIDER_MAX}
    step={nativeSliderStep(min, max, step)} value={toNativeSliderValue(value, min, max)} disabled={disabled}
    accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: valueText }}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}
    minimumTrackTintColor={labColors.sage} maximumTrackTintColor={labColors.stroke} thumbTintColor={labColors.sage}
    onValueChange={(next) => onValueChange(fromNativeSliderValue(next, min, max, step))} />;
}
