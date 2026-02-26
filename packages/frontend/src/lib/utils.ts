import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip HTML tags and known XSS vectors from a string before sending to the server.
 * React already escapes values in JSX, but sanitizing before storage prevents
 * downstream issues if the data is ever consumed outside React.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/javascript:/gi, '') // strip js: URIs
    .replace(/on\w+\s*=/gi, '') // strip inline event handlers (onclick=, onerror=, …)
    .trim();
}

// ——— Org field validation ———

export const ORG_PACKAGE_NAME_MAX = 100;
export const ORG_NAME_MAX = 50;
export const ORG_NAME_MIN = 2;
export const ORG_SLUG_MAX = 30;
export const ORG_SLUG_MIN = 2;

/**
 * Validate org display name.
 * Allows letters (including unicode), numbers, spaces, hyphens, underscores,
 * apostrophes, and periods. No angle brackets, script tags, or raw HTML.
 */
export function validateOrgName(value: string): string | null {
  const v = value.trim();
  if (v.length < ORG_NAME_MIN)
    return `Name must be at least ${ORG_NAME_MIN} characters.`;
  if (v.length > ORG_NAME_MAX)
    return `Name must be ${ORG_NAME_MAX} characters or fewer.`;
  if (/[<>"&]/.test(v)) return 'Name must not contain < > " & characters.';
  if (/^\s|\s$/.test(value))
    return 'Name must not have leading or trailing spaces.';
  return null;
}

/**
 * Validate package name for org linking.
 * Allows letters, numbers, dots, hyphens, underscores.
 * Must start with a letter or number. No consecutive dots.
 */
export function validateOrgPackageName(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Package name is required.';
  if (v.length < 2) return 'Package name must be at least 2 characters.';
  if (v.length > ORG_PACKAGE_NAME_MAX)
    return `Package name must be ${ORG_PACKAGE_NAME_MAX} characters or fewer.`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v))
    return 'Only letters, numbers, dots, hyphens, and underscores. Must start with a letter or number.';
  if (/\.\./.test(v)) return 'Package name must not contain consecutive dots.';
  if (/[<>"&]/.test(v))
    return 'Package name must not contain < > " & characters.';
  return null;
}

/**
 * Validate org slug.
 * Only lowercase letters, numbers, and hyphens. Must start and end with
 * an alphanumeric character. No consecutive hyphens.
 */
export function validateOrgSlug(value: string): string | null {
  const v = value.trim();
  if (v.length < ORG_SLUG_MIN)
    return `Slug must be at least ${ORG_SLUG_MIN} characters.`;
  if (v.length > ORG_SLUG_MAX)
    return `Slug must be ${ORG_SLUG_MAX} characters or fewer.`;
  if (!/^[a-z0-9-]+$/.test(v))
    return 'Slug may only contain lowercase letters, numbers, and hyphens.';
  if (/^-|-$/.test(v))
    return 'Slug must start and end with a letter or number.';
  if (/--/.test(v)) return 'Slug must not contain consecutive hyphens.';
  return null;
}
