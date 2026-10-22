import { Data } from "effect";

export type LagosZone = "Ikeja" | "Yaba" | "Lekki";

export interface ZoneConditionBrief {
  readonly zone: LagosZone;
  readonly disruptionLevel: "LOW" | "MEDIUM" | "HIGH_DISRUPTION";
  readonly surchargeKobo: number;
  readonly advisoryText: string;
  readonly sources: ReadonlyArray<string>;
  readonly lastUpdated: string;
}

export class InvalidZoneError extends Data.TaggedError("InvalidZone")<{ readonly zone: string; }> {}
export class AdvisoryNotAcceptedError extends Data.TaggedError("AdvisoryNotAccepted")<{ readonly zone: LagosZone; readonly advisoryText: string; readonly surchargeKobo: number; }> {}