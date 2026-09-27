import React from "react";
import Slider from "@react-native-community/slider";
import { labColors, labStyles as styles } from "./styles";

export type LabSliderProps = {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
};

/** Preserve the platform slider and its screen-reader percentage on native devices. */
export default function LabSlider({ label, value, onValueChange }: LabSliderProps) {
  return <Slider style={styles.slider} minimumValue={0} maximumValue={100} step={1} value={value}
    accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value, text: `${value} percent open` }}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${value} percent open`}
    minimumTrackTintColor={labColors.sage} maximumTrackTintColor={labColors.stroke} thumbTintColor={labColors.sage}
    onValueChange={onValueChange} />;
}
