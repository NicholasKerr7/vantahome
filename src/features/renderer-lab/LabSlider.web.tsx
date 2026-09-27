import React from "react";
import type { LabSliderProps } from "./LabSlider";
import "./lab-controls.css";

/** A native HTML range provides touch, keyboard, and assistive-technology controls on web. */
export default function LabSlider({ label, value, onValueChange }: LabSliderProps) {
  return <input className="renderer-lab-slider" type="range" min={0} max={100} step={1} value={value}
    aria-label={label} aria-valuetext={`${value} percent open`}
    onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)} />;
}
