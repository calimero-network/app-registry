import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalimeroRegistryClient } from '../client';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    })),
  },
}));

describe('CalimeroRegistryClient', () => {
  let client: CalimeroRegistryClient;

  beforeEach(() => {
    client = new CalimeroRegistryClient();
  });

  it('should create a client instance with default config', () => {
    expect(client).toBeInstanceOf(CalimeroRegistryClient);
  });

  it('should create a client instance with custom config', () => {
    const customClient = new CalimeroRegistryClient({
      baseURL: 'https://api.example.com',
      timeout: 5000,
    });
    expect(customClient).toBeInstanceOf(CalimeroRegistryClient);
  });
});
