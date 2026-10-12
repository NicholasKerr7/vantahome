import React from 'react';
import type { ArrivalInteractionShieldProps } from './ArrivalInteractionShield';
import './arrival-shield.css';

/** Inert blocks keyboard focus, pointer input, and iframe access without stopping the first render. */
export default function ArrivalInteractionShield({ blocked, hidden, children }: ArrivalInteractionShieldProps) {
  return <div className={`arrival-content ${hidden ? 'arrival-content--hidden' : ''}`} inert={blocked} aria-hidden={blocked}>
    {children}
  </div>;
}
