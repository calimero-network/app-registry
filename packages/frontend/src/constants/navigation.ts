import {
  HomeIcon,
  ExploreIcon,
  DevelopersIcon,
  UploadIcon,
  DocsIcon,
} from '@/components/NavIcons';

/**
 * Primary rail.
 *
 * Icons are the hand-drawn set in `components/NavIcons.tsx`, not lucide — see
 * that file for why a second icon library was not worth five glyphs.
 *
 * `Explore` replaced `Apps`: `/apps` still resolves (and redirects) so older
 * links and bookmarks keep working.
 */
export const navigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Explore', href: '/explore', icon: ExploreIcon },
  { name: 'Developers', href: '/developers', icon: DevelopersIcon },
  { name: 'Upload', href: '/upload', icon: UploadIcon },
  { name: 'Docs', href: '/docs', icon: DocsIcon },
];
