import { useEffect, useRef, useState } from "react";
import { stepVehicles, type SimVehicle } from "./traffic";
import type { SpeedLimits } from "./speed-rules";

export const TICK_MS = 500;

/**
 * Runs the traffic simulation on a fixed tick while `running` is true.
 * `onTick` receives previous and next vehicle lists so callers can react to status changes.
 */
export function useTrafficSim(
  init: () => SimVehicle[],
  opts: {
    running: boolean;
    limits: SpeedLimits;
    graceSeconds: number;
    timeScale: number;
    onTick?: (prev: SimVehicle[], next: SimVehicle[]) => void;
  },
) {
  const [vehicles, setVehicles] = useState<SimVehicle[]>(init);
  const [tick, setTick] = useState(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  useEffect(() => {
    if (!opts.running) return;
    const id = setInterval(() => {
      const o = optsRef.current;
      const prev = vehiclesRef.current;
      const next = stepVehicles(prev, {
        dtSeconds: TICK_MS / 1000,
        timeScale: o.timeScale,
        limits: o.limits,
        graceSeconds: o.graceSeconds,
      });
      vehiclesRef.current = next;
      setVehicles(next);
      setTick((t) => t + 1);
      o.onTick?.(prev, next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [opts.running]);

  return { vehicles, setVehicles, tick };
}
