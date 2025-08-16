export interface AppSummary {
  name: string;
  developer_pubkey: string;
  latest_version: string;
  alias?: string;
}

export interface VersionInfo {
  semver: string;
  cid: string;
  yanked?: boolean;
}

export interface AppManifest {
  manifest_version: string;
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
