import { Effect } from "effect";
import { InvalidZoneError } from "./types";
import type { LagosZone, ZoneConditionBrief } from "./types";

export const MOCK_ZONE_BRIEFS: Record<LagosZone, ZoneConditionBrief> = {
  Ikeja: { zone: "Ikeja", disruptionLevel: "LOW", surchargeKobo: 0, advisoryText: "Clear traffic", sources: [], lastUpdated: "2026-10-21T08:00:00Z" },
  Yaba: { zone: "Yaba", disruptionLevel: "MEDIUM", surchargeKobo: 50000, advisoryText: "Slight delay", sources: [], lastUpdated: "2026-10-21T08:00:00Z" },
  Lekki: { zone: "Lekki", disruptionLevel: "HIGH_DISRUPTION", surchargeKobo: 150000, advisoryText: "Flooding near Chevron. Heavy van dispatch rerouting required.", sources: [], lastUpdated: "2026-10-21T08:15:00Z" },
};

export const tool_get_zone_conditions = (zone: string) =>
  Effect.gen(function* () {
    if (zone !== "Ikeja" && zone !== "Yaba" && zone !== "Lekki") return yield* Effect.fail(new InvalidZoneError({ zone }));
    return { status: "SUCCESS" as const, brief: MOCK_ZONE_BRIEFS[zone as LagosZone] };
  });