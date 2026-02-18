import { createFetch } from 'openapi-hooks';
import type { components, paths } from '../schema.gen';

// Token management
const TOKEN_KEY = 'voice-channel-token';

export const tokenManager = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
};

// Create base fetch without token injection
// @ts-expect-error - weird type error, but works fine
const baseFetch = createFetch<paths>({
  baseUrl: location.origin + '/api/',
  onError: (error: unknown) => {
    console.error('API Error:', error);
    
    // If we get a 401, clear the token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.status === 401) {
      tokenManager.removeToken();
      // Trigger auth state update
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
  },
});

// Create authenticated wrapper
export const apiFetch: typeof baseFetch = (path, method, options) => {
  const token = tokenManager.getToken();
  
  // Inject Authorization header if token exists
  if (token) {
    const enhancedOptions = {
      ...options,
      fetchOptions: {
        ...options?.fetchOptions,
        headers: {
          ...options?.fetchOptions?.headers,
          'Authorization': `Bearer ${token}`,
        },
      },
    };
    return baseFetch(path, method, enhancedOptions);
  }

  return baseFetch(path, method, options);
};

// Export types for convenience
export type { paths };

// Define types that the frontend expects
export type Channel = components['schemas']['Channel'];

export interface CreateChannelRequest {
  name: string;
  description: string;
  group_id: string;
  max_participants?: number;
} 