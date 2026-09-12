import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-route <title>, description and canonical.
 *
 * ⚠️ THIS IS FOR SEARCH AND FOR THE TAB STRIP — NOT FOR LINK PREVIEWS. Every
 * route is served the same `index.html` behind a catch-all rewrite, and the
 * unfurlers (Slack, iMessage, X, LinkedIn, Discord) read that document without
 * running a line of JavaScript. Whatever they show comes from the static tags
 * in index.html; what this hook writes is only ever seen by a client that
 * renders — a browser, and Googlebot. So the og:* tags are kept in step here
 * for coherence, and index.html carries the ones that have to survive without
 * a runtime.
 *
 * ⚠️ AND IT MUST NOT LEAVE A PREVIOUS PAGE'S TITLE BEHIND. Every route that
 * matters calls it; a page that does not simply inherits whatever the last one
 * set, which is how a registry ends up with an app's name in the tab for the
 * docs. `usePageMeta()` with no argument restores the site defaults, which is
 * what the home page wants.
 */
export const SITE_NAME = 'Calimero App Registry';
export const SITE_URL = 'https://apps.calimero.network';
export const DEFAULT_TITLE = `${SITE_NAME} — signed apps for your own node`;
/** The claim, not the product name — it heads the card, where the site name
 *  is already carried by `og:site_name`. Kept in step with index.html. */
export const DEFAULT_OG_TITLE = 'Apps your node can verify for itself';
export const DEFAULT_DESCRIPTION =
  'Browse, publish and install signed Calimero application bundles. Every manifest is checked by the registry, then checked again by the peer that installs it.';

/** `Explore apps · Calimero App Registry`, and the bare site name at the root. */
export function formatTitle(title?: string | null) {
  return title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
}

/**
 * A description has to fit the ~155 characters Google renders, and cutting it
 * mid-word reads as broken data rather than as a truncation.
 */
export function clampDescription(text: string, max = 160) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, '')}…`;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

export function usePageMeta(meta?: {
  title?: string | null;
  description?: string | null;
}) {
  const { pathname, search } = useLocation();
  const title = meta?.title ?? null;
  const description = meta?.description ?? null;

  useEffect(() => {
    const resolvedTitle = formatTitle(title);
    const resolvedDescription = clampDescription(
      description || DEFAULT_DESCRIPTION
    );

    document.title = resolvedTitle;
    setMeta('name', 'description', resolvedDescription);
    setMeta(
      'property',
      'og:title',
      title ? `${title} · ${SITE_NAME}` : DEFAULT_OG_TITLE
    );
    setMeta('property', 'og:description', resolvedDescription);
    setMeta('name', 'twitter:description', resolvedDescription);
    setMeta(
      'name',
      'twitter:title',
      title ? `${title} · ${SITE_NAME}` : DEFAULT_OG_TITLE
    );

    // ⚠️ THE QUERY STRING IS DROPPED FROM THE CANONICAL ON PURPOSE.
    // `/explore?q=chat&category=games` is a filtered VIEW of one page, not
    // hundreds of pages; pointing each combination at itself is how a small
    // site hands a crawler an infinite space of near-duplicates.
    const canonical = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
    setCanonical(canonical);
    setMeta('property', 'og:url', canonical);
  }, [title, description, pathname, search]);
}
