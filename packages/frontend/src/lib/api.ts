import axios from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
} from '../types/api';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const appsApi = {
  // Get all apps with optional filtering
  getApps: async (params?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> => {
    const response = await api.get('/apps', { params });
    return response.data;
  },

  // Get all versions of an app
  getAppVersions: async (
    pubkey: string,
    appName: string
  ): Promise<VersionInfo[]> => {
    const response = await api.get(`/apps/${pubkey}/${appName}`);
    return response.data;
  },

  // Get specific version manifest
  getAppManifest: async (
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<AppManifest> => {
    const response = await api.get(`/apps/${pubkey}/${appName}/${semver}`);
    return response.data;
  },
};

export const developersApi = {
  // Get developer profile
  getDeveloper: async (pubkey: string): Promise<DeveloperProfile> => {
    const response = await api.get(`/developers/${pubkey}`);
    return response.data;
  },
};

export const attestationsApi = {
  // Get attestation for an app version
  getAttestation: async (
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<Attestation> => {
    const response = await api.get(
      `/attestations/${pubkey}/${appName}/${semver}`
    );
    return response.data;
  },
};

export default api;
