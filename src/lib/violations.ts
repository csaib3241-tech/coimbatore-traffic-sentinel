import type { ZoneType } from "./sim/speed-rules";

export type VerificationStatus = "pending" | "verified" | "rejected";

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: "Pending Review",
  verified: "Verified",
  rejected: "Rejected",
};

export interface Evidence {
  frame: 1 | 2;
  /** Bounding boxes as % of frame: [left, top, width, height]. */
  vehicleBox: [number, number, number, number];
  plateBox: [number, number, number, number];
}

export interface ViolationRecord {
  id: string;
  plate: string;
  type: string;
  vehicleCategory: string;
  speed: number;
  limit: number;
  zoneType: ZoneType;
  location: string;
  ts: number;
  source: "ANPR Camera" | "GPS Geofence";
  camera?: string | undefined;
  confidence: number;
  status: VerificationStatus;
  evidence?: Evidence | undefined;
  reviewedBy?: string | undefined;
  reviewedAt?: number | undefined;
  reviewNote?: string | undefined;
  /** Demonstration e-notice reference — only ever set once a human has verified the record. */
  noticeId?: string | undefined;
}

export type ReviewDecision = "verify" | "reject";

/**
 * Human-in-the-loop review. A detection only becomes a confirmed violation — and only then
 * gets a (demo) e-notice reference — when an authorised reviewer verifies it.
 */
export function applyReview(
  record: ViolationRecord,
  decision: ReviewDecision,
  reviewer: string,
  now: number,
  note?: string,
): ViolationRecord {
  if (!reviewer.trim()) throw new Error("An authorised reviewer is required");
  if (record.status !== "pending") throw new Error("Only pending detections can be reviewed");
  if (decision === "reject") {
    return { ...record, status: "rejected", reviewedBy: reviewer, reviewedAt: now, reviewNote: note, noticeId: undefined };
  }
  return {
    ...record,
    status: "verified",
    reviewedBy: reviewer,
    reviewedAt: now,
    reviewNote: note,
    noticeId: `ECN-${record.id.replace(/\D/g, "").slice(-6).padStart(6, "0")}`,
  };
}

export function isNoticeIssued(r: ViolationRecord): boolean {
  return r.status === "verified" && !!r.noticeId;
}
