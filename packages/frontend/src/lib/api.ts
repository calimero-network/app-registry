import axios from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
} from '@/types/api';

export const api = axios.create({
  baseURL:
    (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
    '/api',
  timeout: 10000,
});

// Error interceptor
api.interceptors.response.use(
  response => response,
  error => {
    // eslint-disable-next-line no-console
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const getApps = async (params?: {
  dev?: string;
  name?: string;
}): Promise<AppSummary[]> => {
  const response = await api.get('/apps', { params });
  return response.data;
};

export const getAppVersions = async (appId: string): Promise<VersionInfo[]> => {
  const response = await api.get(`/apps/${appId}`);
  return response.data;
};

export const getAppManifest = async (
  appId: string,
  semver: string
): Promise<AppManifest> => {
  const response = await api.get(`/apps/${appId}/${semver}`);
  return response.data;
};

export const getDeveloper = async (
  pubkey: string
): Promise<DeveloperProfile> => {
  const response = await api.get(`/developers/${pubkey}`);
  return response.data;
};

export const getAttestation = async (
  pubkey: string,
  appName: string,
  semver: string
): Promise<Attestation> => {
  const response = await api.get(
    `/attestations/${pubkey}/${appName}/${semver}`
  );
  return response.data;
};
