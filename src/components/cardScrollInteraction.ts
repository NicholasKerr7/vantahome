import { createContext } from 'react';

/** A card collection can reject the release click that follows a scroll without affecting other controls. */
export const CardScrollInteractionContext = createContext<(() => boolean) | null>(null);
