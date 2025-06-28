import { apiFetch } from './api';
import type { components } from '../types/api';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Type definitions from OpenAPI schema
export type User = components['schemas']['User'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type UserAuthResponse = components['schemas']['UserAuthResponse'];
export type ChannelMembership = components['schemas']['ChannelMembership'];
export type ChannelMembershipWithChannel = components['schemas']['ChannelMembershipWithChannel'];
export type InstanceSettings = components['schemas']['InstanceSettings'];
export type Invitation = components['schemas']['Invitation'];

// WebAuthn-only AuthService
export class AuthService {
  // Create new account with WebAuthn passkey
  async createAccount(displayName: string, inviteCode?: string): Promise<{ user_id: string; success: boolean }> {
    try {
      console.log('🆕 Starting WebAuthn registration for:', displayName);
      
      // Step 1: Start WebAuthn registration
      const beginResponse = await apiFetch('/auth/register/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          display_name: displayName,
          invite_code: inviteCode,
        },
      });

      console.log('📡 Server register/begin response:', beginResponse.data);
      
      const optionsResponse = beginResponse.data.options as any;
      console.log('🔑 WebAuthn options response for registration:', JSON.stringify(optionsResponse, null, 2));
      
      // Check if we have a valid WebAuthn options object
      if (!optionsResponse || Object.keys(optionsResponse).length === 0) {
        throw new Error('Server returned empty WebAuthn options. WebAuthn service not properly implemented.');
      }
      
      // Extract the publicKey options for SimpleWebAuthn
      const publicKeyOptions = optionsResponse.publicKey || optionsResponse;
      console.log('🔑 Extracted publicKey options for registration:', JSON.stringify(publicKeyOptions, null, 2));
      
      console.log('🆔 RP ID:', publicKeyOptions.rp?.id);
      console.log('👤 User info:', publicKeyOptions.user);
      console.log('🌍 Origin (expected):', window.location.origin);

      // Step 2: Use WebAuthn browser API to create credential
      console.log('🔨 Creating WebAuthn credential...');
      const credential = await startRegistration(publicKeyOptions);
      console.log('✅ WebAuthn credential created:', credential);

      // Step 3: Complete registration with server
      console.log('🏁 Finishing registration with server...');
      const finishResponse = await apiFetch('/auth/register/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id: beginResponse.data.challenge_id,
          credential,
        },
      });

      console.log('🎉 Registration successful:', finishResponse.data);
      const regResponse = finishResponse.data;
      
      if (regResponse.success && regResponse.user_id) {
        return { user_id: regResponse.user_id, success: true };
      } else {
        throw new Error('Registration completed but failed to get user data');
      }
    } catch (error) {
      console.error('❌ WebAuthn registration failed:', error);
      console.error('❌ Registration error details:', JSON.stringify(error, null, 2));
      throw new Error('Failed to create account with passkey. Please try again.');
    }
  }

  // Login with WebAuthn passkey
  async loginWithPasskey(): Promise<{ user_id: string; success: boolean }> {
    try {
      console.log('🔐 Starting WebAuthn authentication...');
      
      // Step 1: Start WebAuthn authentication
      const beginResponse = await apiFetch('/auth/login/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {},
      });

      console.log('📡 Server login/begin response:', beginResponse.data);
      
      const optionsResponse = beginResponse.data.options as any;
      console.log('🔑 WebAuthn options response:', JSON.stringify(optionsResponse, null, 2));
      
      // Check if we have a valid WebAuthn options object
      if (!optionsResponse || Object.keys(optionsResponse).length === 0) {
        throw new Error('Server returned empty WebAuthn options. WebAuthn service not properly implemented.');
      }
      
      // Extract the publicKey options for SimpleWebAuthn
      const publicKeyOptions = optionsResponse.publicKey || optionsResponse;
      console.log('🔑 Extracted publicKey options:', JSON.stringify(publicKeyOptions, null, 2));
      
      console.log('🆔 RP ID:', publicKeyOptions.rpId);
      console.log('🌍 Origin (expected):', window.location.origin);
      console.log('🔗 Allow credentials:', publicKeyOptions.allowCredentials);

      // Step 2: Use WebAuthn browser API to authenticate
      console.log('🔍 Calling startAuthentication with publicKey options...');
      const credential = await startAuthentication(publicKeyOptions);
      console.log('✅ WebAuthn credential received:', credential);

      // Step 3: Complete authentication with server
      console.log('🏁 Finishing authentication with server...');
      const finishResponse = await apiFetch('/auth/login/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id: beginResponse.data.challenge_id,
          credential,
        },
      });

      console.log('🎉 Authentication successful:', finishResponse.data);
      const loginResponse = finishResponse.data;
      
      if (loginResponse.success && loginResponse.user_id) {
        return { user_id: loginResponse.user_id, success: true };
      } else {
        throw new Error('Login completed but failed to get user data');
      }
    } catch (error) {
      console.error('❌ WebAuthn authentication failed:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      
      // Check if it's a WebAuthn specific error
      if (error && typeof error === 'object' && 'name' in error) {
        console.error('❌ WebAuthn error name:', (error as any).name);
        console.error('❌ WebAuthn error message:', (error as any).message);
      }
      
      throw error;
    }
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