import { apiFetch } from './api';
import type { components } from '../types/api';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

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
const PASSKEY_KEY = 'voice-channel-passkey';
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

  // Generate a simple passkey (for demo - in production use WebAuthn)
  private generatePasskey(): string {
    return 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Create new account with passkey
  async createAccount(displayName: string): Promise<UserAuthResponse> {
    const request: CreateUserRequest = {
      display_name: displayName,
      instance_fqdn: INSTANCE_FQDN,
    };

    const response = await apiFetch('/auth/login', 'post', {
      contentType: 'application/json; charset=utf-8',
      data: request,
    });

    const authResponse = response.data as UserAuthResponse;
    this.saveToStorage(authResponse.user);
    
    // Generate and store a simple passkey for future logins
    const passkey = this.generatePasskey();
    localStorage.setItem(PASSKEY_KEY, passkey);
    
    return authResponse;
  }

  // Login with stored passkey
  async loginWithPasskey(): Promise<boolean> {
    const storedPasskey = localStorage.getItem(PASSKEY_KEY);
    if (!storedPasskey) {
      return false;
    }

    try {
      // For now, just try to create a new session with empty display name
      // In production, this would use WebAuthn to authenticate the passkey
      const request: CreateUserRequest = {
        display_name: '', // Will be ignored for existing users
        instance_fqdn: INSTANCE_FQDN,
      };

      const response = await apiFetch('/auth/login', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: request,
      });

      const authResponse = response.data as UserAuthResponse;
      this.saveToStorage(authResponse.user);
      
      return true;
    } catch (error) {
      console.error('Failed to login with passkey:', error);
      // Clear invalid passkey
      localStorage.removeItem(PASSKEY_KEY);
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
    localStorage.removeItem(PASSKEY_KEY);
    this.currentUser = null;
  }

  // Check if user has a stored passkey
  hasStoredPasskey(): boolean {
    return localStorage.getItem(PASSKEY_KEY) !== null;
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