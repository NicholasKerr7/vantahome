import React from "react";
import type { LabSliderProps } from "./LabSlider";
import "./lab-controls.css";

/** A native HTML range provides touch, keyboard, and assistive-technology controls on web. */
export default function LabSlider({ label, value, onValueChange, min = 0, max = 100, step = 1, valueText = `${value} percent open`, disabled = false }: LabSliderProps) {
  return <input className="renderer-lab-slider" type="range" min={min} max={max} step={step} value={value} disabled={disabled}
    aria-label={label} aria-valuetext={valueText}
    onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)} />;
}
