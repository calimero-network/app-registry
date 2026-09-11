import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Start every navigation at the top of the page.
 *
 * React Router does not reset the scroll position, so following "See all"
 * from halfway down the home page landed on Explore already scrolled past its
 * heading and filters — the page looked like it had been opened at a random
 * offset.
 *
 * ⚠️ ON `pathname`, NOT ON THE WHOLE LOCATION. Explore keeps its search term
 * and category in the query string and rewrites them with `replace: true`, so
 * reacting to `search` would yank the page to the top on every keystroke.
 *
 * ⚠️ `navigationType` IS READ THROUGH A REF, NOT LISTED AS A DEPENDENCY.
 * It is a value that changes on its own — a first load is `POP` and an
 * in-place `setSearchParams` flips it to `REPLACE` — so having it in the
 * array re-runs the effect on a query-string change with the pathname
 * untouched, which is precisely the keystroke-scrolling bug the comment above
 * says this must not do. The ref carries the current value in without making
 * it a trigger.
 *
 * ⚠️ NOT ON `POP`. Back and forward should return you to where you were;
 * scrolling to the top there is the other half of the same bug.
 *
 * ⚠️ `behavior: 'instant'`, NOT `'auto'`. `html` carries
 * `scroll-behavior: smooth`, and `'auto'` means "whatever the CSS says" — so
 * the reset animated over several hundred milliseconds and the next page was
 * painted mid-flight, still scrolled. `'instant'` is the value that overrides
 * the CSS.
 *
 * `useLayoutEffect` so the jump happens before paint — in an effect it lands
 * one frame late and reads as a flick.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const typeRef = useRef(navigationType);
  typeRef.current = navigationType;

  useLayoutEffect(() => {
    if (typeRef.current === 'POP') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
