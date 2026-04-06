import { buildUtilityLocationPatchFromDeviceResult } from "../utilityLocation";

describe("buildUtilityLocationPatchFromDeviceResult", () => {
  it("uses the matched preset when device lookup succeeds", () => {
    expect(
      buildUtilityLocationPatchFromDeviceResult(
        {
          kind: "resolved",
          locationId: "austin-tx",
          resolvedLabel: "Austin, TX",
          status: "matched",
        },
        "denver-co",
      ),
    ).toEqual({
      utilityLocation: "austin-tx",
      utilityLocationResolvedLabel: "Austin, TX",
      utilityLocationStatus: "matched",
    });
  });

  it("falls back to the saved manual preset when auto lookup is unsupported", () => {
    expect(
      buildUtilityLocationPatchFromDeviceResult(
        {
          kind: "resolved",
          locationId: null,
          resolvedLabel: "Kingston, Jamaica",
          status: "unsupported",
        },
        "seattle-wa",
      ),
    ).toEqual({
      utilityLocation: "seattle-wa",
      utilityLocationResolvedLabel: "Kingston, Jamaica",
      utilityLocationStatus: "unsupported",
    });
  });
});
