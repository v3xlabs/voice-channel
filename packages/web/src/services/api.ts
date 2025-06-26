import { createFetch } from 'openapi-hooks';
import type { paths } from '../types/api';

// The paths type needs to be extended to satisfy the Paths constraint
type ExtendedPaths = paths & { [key: string]: any };

export const apiFetch = createFetch<ExtendedPaths>({
  baseUrl: 'http://localhost:3001/api/',  // Include /api in base URL
  onError: (error: any) => {
    console.error('API Error:', error);
  },
});

// Channel API methods using openapi-hooks
export const channelApi = {
  async list() {
    const response = await apiFetch('/channels', 'get', {});
    return response.data;
  },

  async create(request: CreateChannelRequest) {
    const response = await apiFetch('/channels', 'post', {
      contentType: 'application/json; charset=utf-8',
      data: request,
    });
    return response.data;
  },

  async getById(id: string) {
    const response = await apiFetch('/channels/{id}', 'get', {
      path: { id },
    });
    return response.data;
  },
};

// Export types for convenience
export type { paths };
export type { components } from '../types/api';

// Define types that the frontend expects
export interface Channel {
  id: string;
  name: string;
  description: string;
  max_participants: number;
  current_participants: number;
  created_at: string;
  instance_fqdn: string;
}

export interface CreateChannelRequest {
  name: string;
  description: string;
  max_participants: number;
} 