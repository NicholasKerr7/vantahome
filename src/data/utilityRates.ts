const LITERS_PER_GALLON = 3.785411784;
const LITERS_PER_CCF = 748 * LITERS_PER_GALLON;

export type UtilityLocationId =
  | "us-average"
  | "denver-co"
  | "seattle-wa"
  | "austin-tx";

export type UtilityLocationMode = "manual" | "device";

export type UtilityLocationStatus = "matched" | "fallback" | "unsupported";

export type UtilityGeoAddress = {
  city?: string | null;
  district?: string | null;
  region?: string | null;
  subregion?: string | null;
  country?: string | null;
  isoCountryCode?: string | null;
};

export type UtilityLocationResolution = {
  locationId: UtilityLocationId | null;
  resolvedLabel: string | null;
  status: UtilityLocationStatus;
};

export type UtilityRatePreset = {
  id: UtilityLocationId;
  label: string;
  chipLabel: string;
  electricityUsdPerKwh: number;
  electricityLabel: string;
  waterUsdPerLiter: number;
  waterLabel: string;
  electricitySourceUrl: string;
  waterSourceUrl: string;
};

const usdPerLiterFromKilogallon = (usdPerKilOGallon: number) =>
  usdPerKilOGallon / (1000 * LITERS_PER_GALLON);

const usdPerLiterFromCcf = (usdPerCcf: number) => usdPerCcf / LITERS_PER_CCF;

// Rates last verified on 2026-04-06 against official sources.
export const UTILITY_RATE_PRESETS: Record<
  UtilityLocationId,
  UtilityRatePreset
> = {
  "us-average": {
    id: "us-average",
    label: "U.S. Average",
    chipLabel: "U.S. Avg",
    electricityUsdPerKwh: 0.1745,
    electricityLabel: "U.S. residential electricity (EIA Jan 2026)",
    waterUsdPerLiter: usdPerLiterFromKilogallon(7.74),
    waterLabel: "U.S. residential water (EPA WaterSense 2024)",
    electricitySourceUrl:
      "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_06_a",
    waterSourceUrl:
      "https://www.epa.gov/watersense/data-and-information-used-watersense",
  },
  "denver-co": {
    id: "denver-co",
    label: "Denver, CO",
    chipLabel: "Denver",
    electricityUsdPerKwh: 0.1644,
    electricityLabel: "Colorado residential electricity (EIA Jan 2026)",
    waterUsdPerLiter: usdPerLiterFromKilogallon(3.02),
    waterLabel: "Denver Water tier 1 treated water (2026)",
    electricitySourceUrl:
      "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_06_a",
    waterSourceUrl:
      "https://www.denverwater.org/residential/billing-and-rates/2026-rates",
  },
  "seattle-wa": {
    id: "seattle-wa",
    label: "Seattle, WA",
    chipLabel: "Seattle",
    electricityUsdPerKwh: 0.1381,
    electricityLabel: "Washington residential electricity (EIA Jan 2026)",
    waterUsdPerLiter: usdPerLiterFromCcf(5.82),
    waterLabel: "Seattle off-peak residential water (2026)",
    electricitySourceUrl:
      "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_06_a",
    waterSourceUrl:
      "https://www.seattle.gov/utilities/your-services/accounts-and-payments/rates/water/residential-water-rates",
  },
  "austin-tx": {
    id: "austin-tx",
    label: "Austin, TX",
    chipLabel: "Austin",
    electricityUsdPerKwh: 0.1569,
    electricityLabel: "Texas residential electricity (EIA Jan 2026)",
    waterUsdPerLiter: usdPerLiterFromKilogallon(3.77),
    waterLabel: "Austin Water low-use residential tier + surcharges",
    electricitySourceUrl:
      "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_06_a",
    waterSourceUrl:
      "https://www.austintexas.gov/sites/default/files/files/Water/Rates/ResidentialPublicRates_2026.pdf",
  },
};

export const DEFAULT_UTILITY_LOCATION_ID: UtilityLocationId = "us-average";

export const UTILITY_RATE_OPTIONS = (
  Object.values(UTILITY_RATE_PRESETS) as UtilityRatePreset[]
).map(({ id, label, chipLabel }) => ({
  id,
  label,
  chipLabel,
}));

export function getUtilityRatePreset(
  locationId?: UtilityLocationId | null,
): UtilityRatePreset {
  if (!locationId) return UTILITY_RATE_PRESETS[DEFAULT_UTILITY_LOCATION_ID];
  return UTILITY_RATE_PRESETS[locationId] ??
    UTILITY_RATE_PRESETS[DEFAULT_UTILITY_LOCATION_ID];
}

const normalizeUtilityGeoValue = (value?: string | null): string =>
  value?.trim().toLowerCase() ?? "";

const sameNormalizedValue = (
  value: string,
  candidates: readonly string[],
): boolean => candidates.includes(value);

export function formatUtilityGeoLabel(address: UtilityGeoAddress): string | null {
  const primary = address.city ?? address.district ?? address.subregion ?? null;
  const secondary = address.region ?? address.country ?? null;
  if (primary && secondary && primary !== secondary) {
    return `${primary}, ${secondary}`;
  }
  return primary ?? secondary ?? null;
}

export function resolveUtilityLocationFromGeo(
  address: UtilityGeoAddress,
): UtilityLocationResolution {
  const countryCode = normalizeUtilityGeoValue(address.isoCountryCode);
  const country = normalizeUtilityGeoValue(address.country);
  const city = normalizeUtilityGeoValue(address.city);
  const region = normalizeUtilityGeoValue(address.region);
  const resolvedLabel = formatUtilityGeoLabel(address);
  const isUnitedStates =
    countryCode === "us" ||
    sameNormalizedValue(country, [
      "united states",
      "united states of america",
      "usa",
      "u.s.a.",
      "u.s.",
    ]);

  if (!isUnitedStates) {
    return {
      locationId: null,
      resolvedLabel,
      status: "unsupported",
    };
  }

  if (city === "denver" && sameNormalizedValue(region, ["co", "colorado"])) {
    return {
      locationId: "denver-co",
      resolvedLabel,
      status: "matched",
    };
  }

  if (city === "seattle" && sameNormalizedValue(region, ["wa", "washington"])) {
    return {
      locationId: "seattle-wa",
      resolvedLabel,
      status: "matched",
    };
  }

  if (city === "austin" && sameNormalizedValue(region, ["tx", "texas"])) {
    return {
      locationId: "austin-tx",
      resolvedLabel,
      status: "matched",
    };
  }

  return {
    locationId: "us-average",
    resolvedLabel,
    status: "fallback",
  };
}

export function estimateElectricityCost(
  energyKwh: number,
  preset: UtilityRatePreset,
): number {
  return Number((Math.max(0, energyKwh) * preset.electricityUsdPerKwh).toFixed(2));
}

export function estimateWaterCost(
  liters: number,
  preset: UtilityRatePreset,
): number {
  return Number((Math.max(0, liters) * preset.waterUsdPerLiter).toFixed(2));
}

export function formatElectricityRate(usdPerKwh: number): string {
  return `${(usdPerKwh * 100).toFixed(2)}¢/kWh`;
}

export function formatWaterRate(usdPerLiter: number): string {
  if (usdPerLiter >= 0.01) return `$${usdPerLiter.toFixed(2)}/L`;
  if (usdPerLiter >= 0.001) return `$${usdPerLiter.toFixed(4)}/L`;
  return `$${usdPerLiter.toFixed(5)}/L`;
}
