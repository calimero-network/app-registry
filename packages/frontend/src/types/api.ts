/** The ten browse categories the registry enforces at upload. */
export const CATEGORIES = [
  'games',
  'productivity',
  'communication',
  'social',
  'art-design',
  'media',
  'planning',
  'security',
  'utilities',
  'developer-tools',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface AppSummary {
  id: string;
  name: string;
  package_name: string;
  developer_pubkey: string;
  latest_version: string;
  alias?: string;
  downloads?: number;
  /**
   * An admin approved THIS PACKAGE. ⚠️ Not the publisher — see
   * `publisherVerified`. The two used to be one field that was true when
   * either held, which made every bundle verified and the badge meaningless.
   */
  verified?: boolean;
  /** The person who published it: a verified account, or a calimero.network address. */
  publisherVerified?: boolean;
  /**
   * `metadata.icon` — a `data:image/png;base64,...` URI, the same field
   * tauri-app reads for launcher icons. Absent on bundles published before an
   * icon was required, so every consumer needs a fallback.
   */
  icon?: string;
  description?: string;
  tags?: string[];
  /**
   * Resolved category: `metadata.category` when the bundle carries one, else a
   * `tags` entry naming a category. Both spellings exist in production until a
   * cargo-mero release carries the field, so never read `metadata.category`
   * directly.
   */
  category?: Category;
  /**
   * Size of the `.mpk` in bytes, measured by the registry at upload.
   * `null` for anything published before the metadata policy shipped — render
   * the empty state, not `0 bytes`.
   */
  installSize?: number | null;
  /** ISO timestamp stamped by the registry at upload; `null` for older bundles. */
  publishedAt?: string | null;
  developer?: {
    display_name: string;
    website?: string;
    pubkey: string;
    verified?: boolean;
  };
}

export interface VersionInfo {
  semver: string;
  cid: string;
  yanked?: boolean;
}

export interface AppManifest {
  manifest_version: string;
  /** Minimum runtime version required; defaults to "0.1.0" when missing from bundle. */
  min_runtime_version?: string;
  app: {
    name: string;
    developer_pubkey: string;
    id: string;
    alias?: string;
  };
  version: {
    semver: string;
  };
  supported_chains: string[];
  permissions: {
    cap: string;
    bytes: number;
  }[];
  artifacts: {
    type: string;
    target: string;
    cid: string;
    size: number;
    mirrors?: string[];
  }[];
  metadata: Record<string, unknown>;
  distribution: string;
  signature: {
    alg: string;
    sig: string;
    signed_at: string;
  };
}

export interface DeveloperProfile {
  display_name: string;
  website?: string;
  proofs: {
    type: string;
    value: string;
    verified: boolean;
  }[];
}

export interface Attestation {
  status: 'ok' | 'yanked' | 'tested';
  comment?: string;
  timestamp: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Organizations (NPM-style)
export interface OrgMetadata {
  description?: string;
  website?: string;
  email?: string;
  github?: string;
  twitter?: string;
  location?: string;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
  updated_at?: string;
  metadata?: OrgMetadata;
}

export interface OrgMember {
  email: string;
  username: string | null;
  verified?: boolean;
  role: 'owner' | 'admin' | 'member';
  isBot?: boolean;
}

export interface ApiToken {
  tokenId: string;
  token: string;
  label: string;
  createdAt: string;
}

export interface OrgPackageList {
  packages: string[];
}
