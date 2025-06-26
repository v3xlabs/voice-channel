import createClient from 'openapi-fetch';
import type { paths } from '../types/api';

// Create the API client
export const api = createClient<paths>({ 
  baseUrl: '/api',
});

// Re-export types for convenience
export type Channel = paths['/channels']['get']['responses']['200']['content']['application/json'][0];
export type CreateChannelRequest = paths['/channels']['post']['requestBody']['content']['application/json'];
export type HealthResponse = paths['/health']['get']['responses']['200']['content']['application/json'];

// Channel API functions using openapi-fetch
export const channelApi = {
  async list() {
    const { data, error } = await api.GET('/channels');
    if (error) throw new Error('Failed to fetch channels');
    return data || [];
  },

  async create(request: CreateChannelRequest) {
    const { data, error } = await api.POST('/channels', {
      body: request,
    });
    if (error) throw new Error('Failed to create channel');
    return data!;
  },

  async getByName(name: string) {
    const channels = await this.list();
    return channels.find(c => c.name === name) || null;
  }
};

// Health API functions
export const healthApi = {
  async check() {
    const { data, error } = await api.GET('/health');
    if (error) throw new Error('Health check failed');
    return data!;
  }
}; 