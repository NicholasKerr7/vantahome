type Coordinates = {
  latitude?: number;
  longitude?: number;
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export type SunRelation = "after-sunset" | "before-sunrise";

export function matchesSunRelation(
  now: Date,
  coords: Coordinates,
  relation: SunRelation,
) {
  const { sunrise, sunset } = getSunTimes(now, coords);
  if (relation === "before-sunrise") {
    return now.getTime() <= sunrise.getTime();
  }
  return now.getTime() >= sunset.getTime();
}

export function getSunTimes(now: Date, coords: Coordinates) {
  const latitude = coords.latitude;
  const longitude = coords.longitude;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude == null ||
    longitude == null
  ) {
    return getFallbackSunTimes(now);
  }

  const sunriseMinutes = solarMinutesForDate(now, latitude, longitude, true);
  const sunsetMinutes = solarMinutesForDate(now, latitude, longitude, false);

  if (sunriseMinutes == null || sunsetMinutes == null) {
    return getFallbackSunTimes(now);
  }

  return {
    sunrise: dateAtMinutes(now, sunriseMinutes),
    sunset: dateAtMinutes(now, sunsetMinutes),
  };
}

function solarMinutesForDate(
  date: Date,
  latitude: number,
  longitude: number,
  sunrise: boolean,
) {
  const dayOfYear = getDayOfYear(date);
  const lngHour = longitude / 15;
  const baseHour = sunrise ? 6 : 18;
  const approxTime = dayOfYear + (baseHour - lngHour) / 24;
  const meanAnomaly = 0.9856 * approxTime - 3.289;
  let trueLongitude =
    meanAnomaly +
    1.916 * Math.sin(meanAnomaly * DEG_TO_RAD) +
    0.02 * Math.sin(2 * meanAnomaly * DEG_TO_RAD) +
    282.634;
  trueLongitude = normalizeDegrees(trueLongitude);

  let rightAscension =
    RAD_TO_DEG * Math.atan(0.91764 * Math.tan(trueLongitude * DEG_TO_RAD));
  rightAscension = normalizeDegrees(rightAscension);

  const trueQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + trueQuadrant - ascensionQuadrant) / 15;

  const sinDec = 0.39782 * Math.sin(trueLongitude * DEG_TO_RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const zenith = 90.833;
  const cosH =
    (Math.cos(zenith * DEG_TO_RAD) -
      sinDec * Math.sin(latitude * DEG_TO_RAD)) /
    (cosDec * Math.cos(latitude * DEG_TO_RAD));

  if (cosH > 1 || cosH < -1) {
    return null;
  }

  let hourAngle = sunrise
    ? 360 - RAD_TO_DEG * Math.acos(cosH)
    : RAD_TO_DEG * Math.acos(cosH);
  hourAngle /= 15;

  const localMeanTime =
    hourAngle + rightAscension - 0.06571 * approxTime - 6.622;
  const utcHours = normalizeHours(localMeanTime - lngHour);
  const utcMinutes = utcHours * 60;
  const tzOffsetMinutes = -date.getTimezoneOffset();
  const localMinutes = utcMinutes + tzOffsetMinutes;
  return normalizeMinutes(localMinutes);
}

function getFallbackSunTimes(now: Date) {
  return {
    sunrise: dateAtMinutes(now, 6 * 60 + 30),
    sunset: dateAtMinutes(now, 18 * 60 + 30),
  };
}

function dateAtMinutes(base: Date, totalMinutes: number) {
  const next = new Date(base);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(totalMinutes);
  return next;
}

function getDayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function normalizeDegrees(value: number) {
  let next = value % 360;
  if (next < 0) next += 360;
  return next;
}

function normalizeHours(value: number) {
  let next = value % 24;
  if (next < 0) next += 24;
  return next;
}

function normalizeMinutes(value: number) {
  let next = Math.round(value) % (24 * 60);
  if (next < 0) next += 24 * 60;
  return next;
}
