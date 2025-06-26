import type { paths, components } from '../types/api';

const BASE_URL = 'http://localhost:3001';

// Helper types from OpenAPI schema
type CreateChannelRequest = components['schemas']['CreateChannelRequest'];
type JoinChannelRequest = components['schemas']['JoinChannelRequest'];
type CreateTransportRequest = components['schemas']['CreateTransportRequest'];
type ConnectTransportRequest = components['schemas']['ConnectTransportRequest'];
type ProduceRequest = components['schemas']['ProduceRequest'];
type ConsumeRequest = components['schemas']['ConsumeRequest'];
type ParticipantUpdate = components['schemas']['ParticipantUpdate'];
type Channel = components['schemas']['Channel'];
type Participant = components['schemas']['Participant'];
type TransportInfo = components['schemas']['TransportInfo'];
type RtpCapabilities = components['schemas']['RtpCapabilities'];
type ProduceResponse = components['schemas']['ProduceResponse'];
type ConsumeResponse = components['schemas']['ConsumeResponse'];

// Generic fetch wrapper with error handling
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// API client with typed methods
export const apiClient = {
  // Health check
  healthCheck: (): Promise<string> =>
    apiFetch('/api/health'),

  // Channel operations
  getChannels: (): Promise<Channel[]> =>
    apiFetch('/api/channels'),
  
  getChannel: (id: string): Promise<Channel> =>
    apiFetch(`/api/channels/${id}`),
  
  createChannel: (data: CreateChannelRequest): Promise<Channel> =>
    apiFetch('/api/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // WebRTC operations
  joinChannel: (channelId: string, data: JoinChannelRequest): Promise<Participant> =>
    apiFetch(`/api/channels/${channelId}/join`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRtpCapabilities: (channelId: string): Promise<RtpCapabilities> =>
    apiFetch(`/api/channels/${channelId}/rtp-capabilities`),

  createTransport: (channelId: string, data: CreateTransportRequest): Promise<TransportInfo> =>
    apiFetch(`/api/channels/${channelId}/transports`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  connectTransport: (transportId: string, data: ConnectTransportRequest): Promise<unknown> =>
    apiFetch(`/api/transports/${transportId}/connect`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  produce: (transportId: string, data: ProduceRequest): Promise<ProduceResponse> =>
    apiFetch(`/api/transports/${transportId}/produce`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  consume: (transportId: string, data: ConsumeRequest): Promise<ConsumeResponse> =>
    apiFetch(`/api/transports/${transportId}/consume`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getParticipants: (channelId: string): Promise<Participant[]> =>
    apiFetch(`/api/channels/${channelId}/participants`),

  updateParticipant: (participantId: string, data: ParticipantUpdate): Promise<unknown> =>
    apiFetch(`/api/participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Re-export types for convenience
export type { 
  CreateChannelRequest,
  JoinChannelRequest, 
  CreateTransportRequest,
  ConnectTransportRequest,
  ProduceRequest,
  ConsumeRequest,
  ParticipantUpdate,
  Channel,
  Participant,
  TransportInfo,
  RtpCapabilities,
  ProduceResponse,
  ConsumeResponse
};
export type { paths, components };

// Legacy API compatibility layer (for existing hooks)
export const channelApi = {
  async list(): Promise<Channel[]> {
    return apiClient.getChannels();
  },

  async create(request: CreateChannelRequest): Promise<Channel> {
    return apiClient.createChannel(request);
  },
};

export const healthApi = {
  async check(): Promise<string> {
    return apiClient.healthCheck();
  },
}; 