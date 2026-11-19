/**
 * Geofenced speed regulation rules.
 * A vehicle's applicable limit comes from the zone it is inside; school zones take
 * precedence over residential, residential over highway. Outside any zone the
 * urban-road limit applies. Exceeding the limit raises a WARNING; staying over the
 * limit for the grace period escalates to a SPEED VIOLATION.
 */
export type ZoneType = "school" | "residential" | "highway" | "urban";
export type SpeedLimits = Record<ZoneType, number>;
export type SpeedStatus = "normal" | "warning" | "violation";

export const DEFAULT_LIMITS: SpeedLimits = {
  school: 30,
  residential: 40,
  highway: 80,
  urban: 50,
};

/** Seconds a vehicle may stay over the limit (warning) before it becomes a violation. */
export const DEFAULT_GRACE_SECONDS = 3;

export const ZONE_PRIORITY: Exclude<ZoneType, "urban">[] = ["school", "residential", "highway"];

export const ZONE_LABEL: Record<ZoneType, string> = {
  school: "School Zone",
  residential: "Residential Zone",
  highway: "Highway Zone",
  urban: "Urban Road",
};

/** Picks the governing zone type from the set of zone types containing a point. */
export function governingZone(containing: ZoneType[]): ZoneType {
  for (const z of ZONE_PRIORITY) if (containing.includes(z)) return z;
  return "urban";
}

export function classifySpeed(
  speed: number,
  limit: number,
  secondsOverLimit: number,
  graceSeconds: number = DEFAULT_GRACE_SECONDS,
): SpeedStatus {
  if (speed <= limit) return "normal";
  if (secondsOverLimit >= graceSeconds) return "violation";
  return "warning";
}

export function driverWarningMessage(zone: ZoneType): string {
  const where = zone === "urban" ? "on this road" : `in a ${ZONE_LABEL[zone].toLowerCase()}`;
  return `WARNING: You are exceeding the speed limit ${where}. Reduce your speed immediately.`;
}
