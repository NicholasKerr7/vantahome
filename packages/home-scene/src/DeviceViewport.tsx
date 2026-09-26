import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCw, Smartphone, Tablet } from 'lucide-react';
import { resolveViewportLayout, resolveViewportResize, type ViewportLayout, type ViewportMeasurement } from './viewportLayout';
import './device-viewport.css';

const OrientationPausedContext = createContext(false);

/** Suspend scene work and transient controls while a phone needs rotating. */
export function useOrientationPaused(): boolean {
  return useContext(OrientationPausedContext);
}

/** Observe layout changes without confusing an on-screen keyboard with rotation. */
function useViewportLayout(): ViewportLayout {
  const [layout, setLayout] = useState(() => resolveViewportLayout(window.innerWidth, window.innerHeight));
  useEffect(() => {
    let measurement: ViewportMeasurement = {
      width: window.innerWidth, height: window.innerHeight,
      layout: resolveViewportLayout(window.innerWidth, window.innerHeight), keyboardBaselineHeight: null,
    };
    let frame = 0;
    /** Group browser chrome, keyboard and resize events into one measurement. */
    function scheduleMeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const editing = document.activeElement?.matches('input:not([type="range"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]') ?? false;
        measurement = resolveViewportResize(window.innerWidth, window.innerHeight, measurement, editing);
        setLayout(measurement.layout);
      });
    }
    window.addEventListener('resize', scheduleMeasure);
    document.addEventListener('focusout', scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      document.removeEventListener('focusout', scheduleMeasure);
    };
  }, []);
  return layout;
}

/** Explain phone orientation accessibly while the interactive scene is hidden. */
function PortraitPrompt(): ReactNode {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <main className="orientation-prompt" aria-labelledby="orientation-title">
    <div className="orientation-card">
      <div className="orientation-mark" aria-hidden="true"><Smartphone size={40} strokeWidth={1.4} /><RotateCw size={22} /></div>
      <p className="orientation-brand">VANTAHOME</p>
      <h1 id="orientation-title" ref={title} tabIndex={-1}>Turn your phone upright.</h1>
      <p>Your home is ready in portrait. Your room and device settings will be waiting.</p>
      <div className="orientation-supported"><Tablet size={18} aria-hidden="true" /><span>Using a tablet? Both orientations are supported.</span></div>
    </div>
  </main>;
}

/** Bound desktops to a tablet preview and expose only supported device layouts. */
export function DeviceViewport({ children }: { children: ReactNode }): ReactNode {
  const layout = useViewportLayout();
  const paused = layout === 'mobile-landscape';
  return <div className="device-viewport" data-layout={layout}>
    <OrientationPausedContext.Provider value={paused}>
      <div className="supported-device-app" hidden={paused} inert={paused}>{children}</div>
      {paused ? <PortraitPrompt /> : null}
    </OrientationPausedContext.Provider>
  </div>;
}
