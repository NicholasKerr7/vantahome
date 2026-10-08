import { PROPERTY_LOCATION } from '../../../packages/home-scene/src/environment/types';
import { validateWeatherLocationDraft, weatherLocationDraft } from './homeWeatherForm';

describe('Owner weather location input', () => {
  it('accepts valid boundary coordinates and trims the location name and time zone', () => {
    expect(validateWeatherLocationDraft({ name: ' Home ', latitude: '-90', longitude: '180', timeZone: ' America/Jamaica ' }))
      .toEqual({ errors: {}, location: { name: 'Home', latitude: -90, longitude: 180, timeZone: 'America/Jamaica' } });
    expect(validateWeatherLocationDraft(weatherLocationDraft(PROPERTY_LOCATION)).location).toEqual(PROPERTY_LOCATION);
  });

  it('rejects missing, non-decimal, non-finite and out-of-range coordinates per field', () => {
    for (const latitude of ['', ' ', 'NaN', 'Infinity', '1e1', '18,4', '90.1', '-90.1']) {
      const result = validateWeatherLocationDraft({ ...weatherLocationDraft(PROPERTY_LOCATION), latitude });
      expect(result.location).toBeNull();
      expect(result.errors.latitude).toBeTruthy();
      expect(result.errors.longitude).toBeUndefined();
    }
    expect(validateWeatherLocationDraft({ ...weatherLocationDraft(PROPERTY_LOCATION), longitude: '-180.01' }).errors.longitude).toBeTruthy();
  });

  it('rejects unsafe names and invalid time zones without producing a save payload', () => {
    const invalid = validateWeatherLocationDraft({ name: 'Bad\nname', latitude: '18', longitude: '-78', timeZone: 'Jamaica/New_York' });
    expect(invalid.location).toBeNull();
    expect(invalid.errors).toEqual({ name: expect.any(String), timeZone: expect.any(String) });
  });
});
