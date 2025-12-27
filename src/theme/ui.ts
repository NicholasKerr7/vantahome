import { StyleSheet } from 'react-native';
import { theme } from './theme';

/**
 * Reusable “style snippets” for consistency.
 * Prefer putting visual tokens in `theme.ts`, then compose them here.
 */
export const ui = {
  /** One physical pixel on the current device. Useful for subtle borders. */
  hairline: StyleSheet.hairlineWidth,
  /** Default glass surface style used across cards/tiles. */
  glass: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
};
