import React, { Profiler } from "react";

type Props = {
  id: string;
  children: React.ReactNode;
  minMs?: number;
};

function RenderProfiler({ id, children, minMs = 16 }: Props) {
  if (!__DEV__) return <>{children}</>;

  return (
    <Profiler
      id={id}
      onRender={(_id, _phase, actualDuration) => {
        if (actualDuration < minMs) return;
        // eslint-disable-next-line no-console
        console.log(`[perf] ${id} render ${actualDuration.toFixed(1)}ms`);
      }}
    >
      {children}
    </Profiler>
  );
}

export default RenderProfiler;
