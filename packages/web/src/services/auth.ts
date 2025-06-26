import { apiFetch } from './api';
import type { components } from '../types/api';

// Type definitions
export type User = components['schemas']['User'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type UserAuthResponse = components['schemas']['UserAuthResponse'];
export type ChannelWithMembership = components['schemas']['ChannelWithMembership'];

const STORAGE_KEY = 'voice-channel-user';
const INSTANCE_FQDN = 'localhost:3001'; // TODO: Get from environment

export class AuthService {
  private currentUser: User | null = null;

  constructor() {
    this.loadFromStorage();
  }

  // Load user from localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const userData = JSON.parse(stored);
        this.currentUser = userData;
      }
    } catch (error) {
      console.error('Failed to load user from storage:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // Save user to localStorage
  private saveToStorage(user: User): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      this.currentUser = user;
    } catch (error) {
      console.error('Failed to save user to storage:', error);
    }
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Check if user is logged in
  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  // Create or login user
  async login(username?: string, displayName?: string): Promise<UserAuthResponse> {
    const request: CreateUserRequest = {
      username,
      display_name: displayName,
      instance_fqdn: INSTANCE_FQDN,
    };

    const response = await apiFetch('/auth/login', 'post', {
      contentType: 'application/json; charset=utf-8',
      data: request,
    });

    const authResponse = response.data;
    this.saveToStorage(authResponse.user);
    
    return authResponse;
  }

  // Update user profile
  async updateProfile(updates: UpdateUserRequest): Promise<User> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    const response = await apiFetch('/users/{user_id}', 'patch', {
      path: { user_id: this.currentUser.id },
      contentType: 'application/json; charset=utf-8',
      data: updates,
    });

    const updatedUser = response.data;
    this.saveToStorage(updatedUser);
    
    return updatedUser;
  }

  // Get user's joined channels
  async getUserChannels(): Promise<ChannelWithMembership[]> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    const response = await apiFetch('/users/{user_id}/channels', 'get', {
      path: { user_id: this.currentUser.id },
    });

    return response.data;
  }

  // Join a channel (become a member)
  async joinChannel(instanceFqdn: string, channelName: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    await apiFetch('/channels/{channel_instance_fqdn}/{channel_name}/members', 'post', {
      path: { 
        channel_instance_fqdn: instanceFqdn,
        channel_name: channelName,
      },
      contentType: 'application/json; charset=utf-8',
      data: {
        user_id: this.currentUser.id,
        channel_instance_fqdn: instanceFqdn,
        channel_name: channelName,
      },
    });
  }

  // Leave a channel (remove membership)
  async leaveChannel(instanceFqdn: string, channelName: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    await apiFetch('/channels/{channel_instance_fqdn}/{channel_name}/members/{user_id}', 'delete', {
      path: { 
        channel_instance_fqdn: instanceFqdn,
        channel_name: channelName,
        user_id: this.currentUser.id,
      },
    });
  }

  // Logout
  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUser = null;
  }

  // Auto-login for first time users
  async autoLogin(): Promise<UserAuthResponse> {
    if (this.currentUser) {
      return {
        user: this.currentUser,
        is_new: false,
      };
    }

    // Create a temporary user account
    return this.login();
  }
}

// Export singleton instance
export const authService = new AuthService(); 