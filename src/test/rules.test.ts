import { describe, expect, it } from "vitest";
import { classifySpeed, DEFAULT_LIMITS, driverWarningMessage, governingZone } from "@/lib/sim/speed-rules";
import { resolveZone, ZONES } from "@/lib/sim/world";
import { applyReview, isNoticeIssued, type ViolationRecord } from "@/lib/violations";
import { INDIA_2024 } from "@/lib/analytics-data";

describe("geofenced speed limits", () => {
  it("defaults: school 30, residential 40, highway 80 km/h", () => {
    expect(DEFAULT_LIMITS.school).toBe(30);
    expect(DEFAULT_LIMITS.residential).toBe(40);
    expect(DEFAULT_LIMITS.highway).toBe(80);
  });

  it("school zone wins over residential and highway when zones overlap", () => {
    expect(governingZone(["highway", "residential", "school"])).toBe("school");
    expect(governingZone(["highway", "residential"])).toBe("residential");
    expect(governingZone([])).toBe("urban");
  });

  it("a point at a school zone's centre gets the school limit", () => {
    const school = ZONES.find((z) => z.type === "school")!;
    expect(resolveZone(school.center, DEFAULT_LIMITS).limit).toBe(30);
  });

  it("edited limits are applied", () => {
    const school = ZONES.find((z) => z.type === "school")!;
    expect(resolveZone(school.center, { ...DEFAULT_LIMITS, school: 25 }).limit).toBe(25);
  });
});

describe("speed status", () => {
  it("58 km/h in a 30 km/h school zone warns first, then becomes a violation after the grace period", () => {
    expect(classifySpeed(58, 30, 1, 3)).toBe("warning");
    expect(classifySpeed(58, 30, 3, 3)).toBe("violation");
  });
  it("at or under the limit is normal", () => {
    expect(classifySpeed(30, 30, 10, 3)).toBe("normal");
  });
  it("school zone driver warning text", () => {
    expect(driverWarningMessage("school")).toBe(
      "WARNING: You are exceeding the speed limit in a school zone. Reduce your speed immediately.",
    );
  });
});

describe("human verification", () => {
  const rec: ViolationRecord = {
    id: "VR-240999", plate: "TN 37 AB 1234", type: "Over-speeding", vehicleCategory: "Car",
    speed: 58, limit: 30, zoneType: "school", location: "Cross Cut Road", ts: 0,
    source: "GPS Geofence", confidence: 0.99, status: "pending",
  };

  it("pending detections have no notice", () => {
    expect(isNoticeIssued(rec)).toBe(false);
  });
  it("only an officer's verification issues a notice", () => {
    const v = applyReview(rec, "verify", "Insp. R. Priya", 1);
    expect(v.status).toBe("verified");
    expect(isNoticeIssued(v)).toBe(true);
  });
  it("rejected detections never get a notice", () => {
    const r = applyReview(rec, "reject", "Insp. R. Priya", 1);
    expect(r.status).toBe("rejected");
    expect(isNoticeIssued(r)).toBe(false);
  });
  it("cannot review without a named officer, or review twice", () => {
    expect(() => applyReview(rec, "verify", "  ", 1)).toThrow();
    const v = applyReview(rec, "verify", "Insp. R. Priya", 1);
    expect(() => applyReview(v, "reject", "Insp. R. Priya", 2)).toThrow();
  });
});

describe("2024 India reference figures", () => {
  it("match the project presentation", () => {
    expect(INDIA_2024).toEqual({ accidents: 487_707, deaths: 177_175, speeding: 345_024 });
  });
});
