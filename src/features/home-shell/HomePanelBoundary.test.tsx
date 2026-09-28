import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import HomePanelBoundary from './HomePanelBoundary';

/** Emulate a lazy panel failure without involving native graphics or microphone modules. */
function UnavailablePanel(): React.ReactNode { throw new Error('Unavailable panel'); }

test('preserves surrounding home content and offers a close action when a panel fails', () => {
  const output = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const close = jest.fn();
    const screen = render(<><Text>House navigation</Text><HomePanelBoundary onClose={close}><UnavailablePanel /></HomePanelBoundary></>);
    expect(screen.getByText('House navigation')).toBeTruthy();
    expect(screen.getByText('This panel couldn’t open')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close unavailable panel'));
    expect(close).toHaveBeenCalledTimes(1);
  } finally { output.mockRestore(); }
});
