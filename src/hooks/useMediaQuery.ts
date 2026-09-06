import { useSyncExternalStore } from 'react';

/** Whether a CSS media query currently matches, kept live as the window
 *  changes. Read through `useSyncExternalStore` so there is no first render
 *  with a stale answer. */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
