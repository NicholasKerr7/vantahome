import {
  formatUtilityGeoLabel,
  resolveUtilityLocationFromGeo,
} from "../utilityRates";

describe("resolveUtilityLocationFromGeo", () => {
  it("matches supported city presets", () => {
    expect(
      resolveUtilityLocationFromGeo({
        city: "Denver",
        region: "CO",
        country: "United States",
        isoCountryCode: "US",
      }),
    ).toEqual({
      locationId: "denver-co",
      resolvedLabel: "Denver, CO",
      status: "matched",
    });
  });

  it("falls back to U.S. average for unsupported U.S. cities", () => {
    expect(
      resolveUtilityLocationFromGeo({
        city: "Boulder",
        region: "Colorado",
        country: "United States",
        isoCountryCode: "US",
      }),
    ).toEqual({
      locationId: "us-average",
      resolvedLabel: "Boulder, Colorado",
      status: "fallback",
    });
  });

  it("returns unsupported for non-U.S. locations", () => {
    expect(
      resolveUtilityLocationFromGeo({
        city: "Kingston",
        country: "Jamaica",
        isoCountryCode: "JM",
      }),
    ).toEqual({
      locationId: null,
      resolvedLabel: "Kingston, Jamaica",
      status: "unsupported",
    });
  });
});

describe("formatUtilityGeoLabel", () => {
  it("prefers city and region when both exist", () => {
    expect(
      formatUtilityGeoLabel({
        city: "Austin",
        region: "TX",
        country: "United States",
      }),
    ).toBe("Austin, TX");
  });

  it("falls back to country when city and region are missing", () => {
    expect(
      formatUtilityGeoLabel({
        country: "Jamaica",
      }),
    ).toBe("Jamaica");
  });
});
