import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export interface Channel {
  id: string
  name: string
  description?: string
  instance_fqdn: string
  max_participants: number
  current_participants: number
  created_at: string
  updated_at: string
}

export interface CreateChannelRequest {
  name: string
  description?: string
  max_participants?: number
}

export interface HealthResponse {
  status: string
  version: string
  instance_fqdn: string
}

export const channelApi = {
  async list(): Promise<Channel[]> {
    const response = await api.get<Channel[]>('/channels')
    return response.data
  },

  async create(request: CreateChannelRequest): Promise<Channel> {
    const response = await api.post<Channel>('/channels', request)
    return response.data
  },

  async getByName(name: string): Promise<Channel | null> {
    try {
      const channels = await this.list()
      return channels.find(c => c.name === name) || null
    } catch (error) {
      console.error('Failed to get channel by name:', error)
      return null
    }
  }
}

export const healthApi = {
  async check(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health')
    return response.data
  }
}

// Request interceptor for adding auth headers if needed
api.interceptors.request.use((config) => {
  // TODO: Add authentication headers when implementing auth
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
) 