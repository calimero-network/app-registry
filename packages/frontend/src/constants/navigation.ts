import { Home, Compass, Users, Upload, BookOpen } from 'lucide-react';

/**
 * Primary rail. `Explore` replaced `Apps`: `/apps` still resolves (and
 * redirects) so older links and bookmarks keep working.
 */
export const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Explore', href: '/explore', icon: Compass },
  { name: 'Developers', href: '/developers', icon: Users },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Docs', href: '/docs', icon: BookOpen },
];
