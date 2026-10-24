import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { CameraCenterView } from '../CameraCenterView';
import { CameraCenterArtwork, cameraCenterArtworkSources } from '../CameraCenterArtwork';
import type { CameraCenterCamera, CameraCenterViewProps } from '../CameraCenterTypes';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));

const cameras: CameraCenterCamera[] = [
  { id: 'entry', name: 'Entry camera', roomName: 'Grounds & entry', view: 'entry', status: 'demo', statusDetail: 'Armed preference · No live feed', favorite: false, canControl: true },
  { id: 'drive', name: 'Driveway camera', roomName: 'Grounds & entry', view: 'driveway', status: 'demo', statusDetail: 'Disarmed preference · No live feed', favorite: false, canControl: true },
  { id: 'terrace', name: 'Terrace camera', roomName: 'Upper terrace', view: 'terrace', status: 'demo', statusDetail: 'Armed preference · No live feed', favorite: false, canControl: true },
];

/** Render a display-only authorized collection without device or media services. */
function setup(overrides: Partial<CameraCenterViewProps> = {}) {
  const props: CameraCenterViewProps = {
    cameras, events: [], selectedCameraId: 'entry', section: 'cameras', layout: 'focus',
    onSelectCamera: jest.fn(), onSectionChange: jest.fn(), onLayoutChange: jest.fn(), onOpenCamera: jest.fn(),
    onControls: jest.fn(), onLocate: jest.fn(), onToggleFavorite: jest.fn(), onAllCameras: jest.fn(), ...overrides,
  };
  return { props, screen: render(<CameraCenterView {...props} />) };
}

afterEach(() => jest.restoreAllMocks());

test('demo has explicit illustration/no-feed labels and no unsupported audio, snapshot or recording actions', () => {
  const { screen, props } = setup();
  expect(screen.getByText('Generated illustration')).toBeTruthy();
  expect(screen.getByText('Illustrations only · No footage captured in this preview')).toBeTruthy();
  expect(screen.getAllByText('DEMO PREVIEW').length).toBeGreaterThan(0);
  expect(screen.queryByText(/^(LIVE|REC|Recording|All secure)$/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /talk|sound|export|capture|go live/i })).toBeNull();
  fireEvent.press(screen.getByLabelText('Select Driveway camera'));
  expect(props.onSelectCamera).toHaveBeenCalledWith('drive');
  fireEvent.press(screen.getByLabelText('Open Entry camera controls'));
  expect(props.onControls).toHaveBeenCalledWith('entry');
  fireEvent.press(screen.getByLabelText('Locate Entry camera in 3D Home'));
  expect(props.onLocate).toHaveBeenCalledWith('entry');
  fireEvent.press(screen.getByLabelText('Open Entry camera viewer'));
  expect(props.onOpenCamera).toHaveBeenCalledWith('entry');
});

test('favorites and wall navigation emit explicit callbacks without mutating source cameras', () => {
  const { screen, props } = setup();
  fireEvent.press(screen.getByLabelText('Add Entry camera to favorites'));
  expect(props.onToggleFavorite).toHaveBeenCalledWith('entry');
  expect(cameras[0].favorite).toBe(false);
  fireEvent.press(screen.getByLabelText('Show camera wall'));
  expect(props.onLayoutChange).toHaveBeenCalledWith('wall');
  screen.rerender(<CameraCenterView {...props} layout="wall" />);
  fireEvent.press(screen.getByLabelText('View Terrace camera'));
  expect(props.onSelectCamera).toHaveBeenCalledWith('terrace');
  expect(props.onOpenCamera).toHaveBeenCalledWith('terrace');
  fireEvent.press(screen.getByLabelText('Show selected camera'));
  expect(props.onLayoutChange).toHaveBeenLastCalledWith('focus');
});

test('focused viewer has an always-reachable All cameras action and no duplicate collection', () => {
  const { screen, props } = setup({ focused: true });
  fireEvent.press(screen.getByLabelText('All cameras'));
  expect(props.onAllCameras).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('camera-thumbnail-strip')).toBeNull();
  expect(screen.queryByLabelText('Show camera wall')).toBeNull();
  expect(screen.queryByLabelText('Open Entry camera viewer')).toBeNull();
  expect(screen.getByLabelText('Open Entry camera controls')).toBeTruthy();
});

test('a missing focused camera cannot fall back to another authorized viewpoint', () => {
  const { screen } = setup({ focused: true, selectedCameraId: 'removed-camera' });
  expect(screen.getByText('Camera unavailable')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-tile-entry')).toBeNull();
  expect(screen.queryByLabelText('Open Entry camera controls')).toBeNull();
});

test.each(['privacy', 'stale', 'unconfigured', 'unavailable'] as const)('%s state suppresses sample imagery instead of showing stale footage', (status) => {
  const { screen } = setup({ cameras: [{ ...cameras[0], status }], focused: true });
  expect(screen.queryByTestId('camera-center-art-entry', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByText('NO LIVE FEED')).toBeTruthy();
  expect(screen.queryByText('Generated illustration')).toBeNull();
});

test('loading and no-access collections allocate no image or actions', () => {
  const { screen, props } = setup({ loading: true });
  expect(screen.getByText('Preparing your camera views')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-tile-entry')).toBeNull();
  screen.rerender(<CameraCenterView {...props} loading={false} cameras={[]} />);
  expect(screen.getByText('No cameras to show')).toBeTruthy();
  expect(screen.queryByLabelText('Open Entry camera controls')).toBeNull();
});

test('history permission independently hides activity, including a stale selected tab', () => {
  const { screen } = setup({ section: 'activity', canViewActivity: false });
  expect(screen.queryByRole('tab', { name: 'Activity' })).toBeNull();
  expect(screen.getByText('Activity access unavailable')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-activity')).toBeNull();
});

test('sample activity filters and opens a camera without claiming recorded playback', () => {
  const { screen, props } = setup({ section: 'activity', events: [
    { id: 'sample-entry', cameraId: 'entry', label: 'Sample snapshot', timeLabel: 'No capture time', detail: 'Last saved simulation event.' },
    { id: 'sample-drive', cameraId: 'drive', label: 'Sample visitor alert', timeLabel: 'No capture time', detail: 'No photo was captured.' },
    { id: 'denied-event', cameraId: 'unknown', label: 'Secret camera event', timeLabel: 'Never', detail: 'Never show.' },
  ] });
  expect(screen.getByText('SAMPLE ACTIVITY')).toBeTruthy();
  expect(screen.queryByText('Secret camera event')).toBeNull();
  fireEvent.press(screen.getByLabelText('Activity from Driveway camera'));
  expect(screen.queryByText('Sample snapshot')).toBeNull();
  expect(screen.getByText('Sample visitor alert')).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Sample visitor alert, Driveway camera/));
  expect(props.onSelectCamera).toHaveBeenCalledWith('drive');
  expect(props.onSectionChange).toHaveBeenCalledWith('cameras');
});

test('view-only members retain controls navigation but are not told to perform unavailable sample actions', () => {
  const { screen, props } = setup({ cameras: cameras.map((camera) => ({ ...camera, canControl: false })), section: 'activity' });
  expect(screen.getByText('An authorized household manager can create sample events in the camera controls. No footage is recorded.')).toBeTruthy();
  screen.rerender(<CameraCenterView {...props} section="cameras" />);
  fireEvent.press(screen.getByLabelText('Open Entry camera controls'));
  expect(props.onControls).toHaveBeenCalledWith('entry');
});

test('normal layouts disable vertical page scrolling and retain 48 point targets', () => {
  const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions');
  for (const [width, height] of [[320, 568], [390, 844], [440, 956], [768, 1024], [1024, 768]]) {
    dimensions.mockReturnValue({ width, height, scale: 1, fontScale: 1 });
    const { screen } = setup();
    expect(screen.getByTestId('camera-center-workspace').props.scrollEnabled).toBe(false);
    for (const button of screen.getAllByRole('button')) {
      const style = StyleSheet.flatten(button.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
    for (const scroll of screen.UNSAFE_getAllByType(ScrollView)) {
      expect(scroll.props.bounces).toBe(false);
      expect(scroll.props.overScrollMode).toBe('never');
    }
    expect(Boolean(screen.queryByTestId('camera-side-rail'))).toBe(width === 1024);
    screen.unmount();
  }
});

test('large text enables a contained vertical fallback instead of hiding essential actions', () => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 1, fontScale: 1.8 });
  const { screen } = setup();
  expect(screen.getByTestId('camera-center-workspace').props.scrollEnabled).toBe(true);
  expect(screen.getByLabelText('Open Entry camera controls')).toBeTruthy();
});

test('additional wall pages exclude offscreen actions and reset their indicator after rotation', () => {
  const collection = Array.from({ length: 7 }, (_, index) => ({ ...cameras[0], id: `camera-${index}`, name: `Camera ${index}` }));
  const { screen } = setup({ cameras: collection, selectedCameraId: 'camera-0', layout: 'wall' });
  fireEvent(screen.getByTestId('camera-page-viewport'), 'layout', { nativeEvent: { layout: { width: 350, height: 500 } } });
  expect(screen.getByText('Swipe cameras · 1 / 2')).toBeTruthy();
  expect(screen.getByLabelText('View Camera 0')).toBeTruthy();
  expect(screen.queryByLabelText('View Camera 4')).toBeNull();
  fireEvent(screen.getByTestId('camera-collection-pages'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 350, y: 0 } } });
  expect(screen.getByText('Swipe cameras · 2 / 2')).toBeTruthy();
  expect(screen.queryByLabelText('View Camera 0')).toBeNull();
  expect(screen.getByLabelText('View Camera 4')).toBeTruthy();
  fireEvent(screen.getByTestId('camera-page-viewport'), 'layout', { nativeEvent: { layout: { width: 700, height: 400 } } });
  expect(screen.getByText('Swipe cameras · 1 / 2')).toBeTruthy();
});

test.each(['entry', 'driveway', 'terrace'] as const)('%s artwork preserves aspect ratio and uses only bundled generated imagery', (view) => {
  const screen = render(<CameraCenterArtwork view={view} />);
  const image = screen.UNSAFE_getByType(Image);
  expect(image.props.contentFit).toBe('contain');
  expect(image.props.source).toBe(cameraCenterArtworkSources[view]);
  expect(image.props.cachePolicy).toBe('memory');
  expect(image.props.transition).toBe(0);
  expect(image.props.recyclingKey).toBe(`camera-center-${view}`);
});

test('failed illustration reports an unavailable reference rather than leaving an indefinite blank view', () => {
  const screen = render(<CameraCenterArtwork view="entry" />);
  fireEvent(screen.UNSAFE_getByType(Image), 'error');
  expect(screen.getByText('Illustration unavailable', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.UNSAFE_queryByType(Image)).toBeNull();
});

test('configured hardware is never represented by generated sample footage or false disconnected status', () => {
  const { screen } = setup({ cameras: [{ ...cameras[0], status: 'configured', statusDetail: 'Open viewer to watch' }], focused: true });
  expect(screen.getByText('Configured camera')).toBeTruthy();
  expect(screen.getByText('NOT PLAYING')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-art-entry', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText('Camera not connected')).toBeNull();
});
