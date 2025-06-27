import { apiFetch } from './api';
import type { components } from '../types/api';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Type definitions
export type User = components['schemas']['User'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type UserAuthResponse = components['schemas']['UserAuthResponse'];
export type ChannelWithMembership = components['schemas']['ChannelWithMembership'];
export type ChannelMembership = components['schemas']['ChannelMembership'];
export type JoinChannelMembershipRequest = components['schemas']['JoinChannelMembershipRequest'];
export type InstanceSettings = components['schemas']['InstanceSettings'];
export type Invitation = components['schemas']['Invitation'];

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

  // Create new account with WebAuthn passkey
  async createAccount(displayName: string, inviteCode?: string): Promise<UserAuthResponse> {
    try {
      // Step 1: Start WebAuthn registration
      const beginResponse = await apiFetch('/auth/register/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          display_name: displayName,
          invite_code: inviteCode,
        },
      });

      // Step 2: Use WebAuthn browser API to create credential
      const credential = await startRegistration((beginResponse.data.options as any).publicKey);

      // Step 3: Complete registration with server
      const finishResponse = await apiFetch('/auth/register/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id: beginResponse.data.challenge_id,
          credential,
        },
      });

      const authResponse = finishResponse.data as UserAuthResponse;
      this.saveToStorage(authResponse.user);
      
      return authResponse;
    } catch (error) {
      console.error('WebAuthn registration failed:', error);
      throw new Error('Failed to create account with passkey. Please try again.');
    }
  }

  // Login with WebAuthn passkey
  async loginWithPasskey(): Promise<boolean> {
    try {
      // Step 1: Start WebAuthn authentication
      const beginResponse = await apiFetch('/auth/login/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {},
      });

      // Step 2: Use WebAuthn browser API to authenticate
      const credential = await startAuthentication((beginResponse.data.options as any).publicKey);

      // Step 3: Complete authentication with server
      const finishResponse = await apiFetch('/auth/login/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id: beginResponse.data.challenge_id,
          credential,
        },
      });

      const authResponse = finishResponse.data;
      this.saveToStorage(authResponse.user);
      
      return true;
    } catch (error) {
      console.error('WebAuthn authentication failed:', error);
      // Clear stored user on authentication failure
      localStorage.removeItem(STORAGE_KEY);
      this.currentUser = null;
      return false;
    }
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

    const updatedUser = response.data as User;
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

    return response.data as ChannelWithMembership[];
  }

  // Join a channel (become a member)
  async joinChannel(instanceFqdn: string, channelName: string): Promise<ChannelMembership> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    const request: JoinChannelMembershipRequest = {
      user_id: this.currentUser.id,
      channel_instance_fqdn: instanceFqdn,
      channel_name: channelName,
    };

    const response = await apiFetch('/channels/{channel_instance_fqdn}/{channel_name}/members', 'post', {
      path: { 
        channel_instance_fqdn: instanceFqdn,
        channel_name: channelName,
      },
      contentType: 'application/json; charset=utf-8',
      data: request,
    });

    return response.data as ChannelMembership;
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

  // Check if user has WebAuthn credentials (based on stored user)
  hasStoredPasskey(): boolean {
    return this.currentUser !== null;
  }

  // Check if current user is admin
  isAdmin(): boolean {
    return this.currentUser?.is_admin === true;
  }

  // Admin: Get instance settings
  async getInstanceSettings(): Promise<InstanceSettings> {
    const response = await apiFetch('/admin/settings', 'get', {});
    return response.data as InstanceSettings;
  }

  // Admin: Get registration status
  async getRegistrationStatus(): Promise<any> {
    const response = await apiFetch('/admin/registration-status', 'get', {});
    return response.data;
  }

  // Get invitation by code (for registration)
  async getInvitationByCode(code: string): Promise<Invitation | null> {
    try {
      const response = await apiFetch('/invitations/{invite_code}', 'get', {
        path: { invite_code: code },
      });
      return response.data as Invitation;
    } catch (error) {
      console.error('Failed to get invitation:', error);
      return null;
    }
  }
}

// Export singleton instance
export const authService = new AuthService(); 