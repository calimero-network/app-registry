export interface AppSummary {
  id: string;
  name: string;
  package_name: string;
  developer_pubkey: string;
  latest_version: string;
  alias?: string;
  downloads?: number;
  verified?: boolean;
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
