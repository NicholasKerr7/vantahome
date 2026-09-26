import type { SolarClock, WeatherLocation, WeatherSnapshot } from './types';

const DAY_MS = 86_400_000;
const RADIANS = Math.PI / 180;

/** Format an ISO calendar date in the property's zone, independent of the viewer. */
export function localDateKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(timestamp);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value ?? '').join('-');
}

/** NOAA's fractional-year approximation keeps sunrise behavior available offline.
 * Source: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * The calculation uses UTC and east-positive longitude; browser time zones never enter it.
 */
export function solarAltitude(timestamp: number, latitude: number, longitude: number): number {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / DAY_MS;
  const dayOfYear = Math.floor((timestamp - yearStart) / DAY_MS) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const fraction = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (hour - 12) / 24);
  const equationMinutes = 229.18 * (0.000075 + 0.001868 * Math.cos(fraction)
    - 0.032077 * Math.sin(fraction) - 0.014615 * Math.cos(2 * fraction) - 0.040849 * Math.sin(2 * fraction));
  const declination = 0.006918 - 0.399912 * Math.cos(fraction) + 0.070257 * Math.sin(fraction)
    - 0.006758 * Math.cos(2 * fraction) + 0.000907 * Math.sin(2 * fraction)
    - 0.002697 * Math.cos(3 * fraction) + 0.00148 * Math.sin(3 * fraction);
  const solarMinutes = ((hour * 60 + equationMinutes + 4 * longitude) % 1440 + 1440) % 1440;
  const hourAngle = (solarMinutes / 4 - 180) * RADIANS;
  const latitudeRadians = latitude * RADIANS;
  const cosineZenith = Math.sin(latitudeRadians) * Math.sin(declination)
    + Math.cos(latitudeRadians) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.min(1, Math.max(-1, cosineZenith))) / RADIANS;
}

/** Blend light through civil twilight; keep the streetlight switch tied to sunrise/sunset. */
export function deriveSolarClock(now: number, location: WeatherLocation, weather: WeatherSnapshot | null): SolarClock {
  const timeZone = location.timeZone;
  const localDate = localDateKey(now, timeZone);
  const schedule = weather?.timeZone === timeZone
    ? weather.daylightDays.find((day) => day.date === localDate) : undefined;
  const sunAltitudeDeg = solarAltitude(now, location.latitude, location.longitude);
  const hasSchedule = schedule?.sunrise != null && schedule.sunset != null && schedule.sunset > schedule.sunrise;
  const isNight = hasSchedule
    ? now < schedule.sunrise! || now >= schedule.sunset!
    : sunAltitudeDeg < -0.833;
  const twilight = Math.min(1, Math.max(0, (sunAltitudeDeg + 6) / 14));
  return {
    isNight,
    daylight: twilight * twilight * (3 - 2 * twilight),
    sunAltitudeDeg,
    localTime: new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(now),
    localDate,
    timeZone,
    clockSource: hasSchedule ? 'sunrise-sunset' : 'solar-calculation',
  };
}
