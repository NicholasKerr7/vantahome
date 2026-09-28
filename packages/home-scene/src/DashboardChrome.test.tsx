import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardHeader, DashboardRoomBar } from './DashboardChrome';

const environment = { localTime: '10:42 AM', weather: null, status: 'unavailable' as const };

describe('home workspace chrome', () => {
  it('removes duplicate embedded identity while retaining time, lighting and environment access', () => {
    const markup = renderToStaticMarkup(<DashboardHeader embedded environment={environment} onSettings={() => undefined} />);
    expect(markup).not.toContain('dashboard-brand');
    expect(markup).toContain('HOPEWELL');
    expect(markup).toContain('10:42 AM');
    for (const control of ['Automatic local daylight', 'Daylight preview', 'Night lighting preview', 'Home settings and help']) expect(markup).toContain(control);
  });

  it('retains standalone identity and accessible room/floor navigation', () => {
    expect(renderToStaticMarkup(<DashboardHeader environment={environment} onSettings={() => undefined} />)).toContain('VantaHome house preview');
    const markup = renderToStaticMarkup(<DashboardRoomBar onRooms={() => undefined} />);
    for (const control of ['Choose a room', 'Choose floor', 'Ground', 'Upper']) expect(markup).toContain(control);
  });
});
