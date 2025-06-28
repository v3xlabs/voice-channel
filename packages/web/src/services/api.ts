import { createFetch } from 'openapi-hooks';
import type { paths } from '../types/api';

// The paths type needs to be extended to satisfy the Paths constraint
type ExtendedPaths = paths & { [key: string]: any };

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
const baseFetch = createFetch<ExtendedPaths>({
  baseUrl: location.origin + '/api/',
  onError: (error: any) => {
    console.error('API Error:', error);
    
    // If we get a 401, clear the token
    if (error?.status === 401) {
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
export interface Channel {
  channel_id: string;
  name: string;
  description?: string;
  max_participants: number;
  current_participants: number;
  created_at: string;
  instance_fqdn: string;
  group_id: string;
}

export interface CreateChannelRequest {
  name: string;
  description: string;
  group_id: string;
  max_participants?: number;
} 