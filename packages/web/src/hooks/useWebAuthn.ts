import { useMutation, useQuery } from '@tanstack/react-query';
import { webAuthnService, WebAuthnUtils } from '../services/webauthn';
import { apiFetch } from '../services/api';

export interface WebAuthnRegistrationData {
  displayName: string;
  inviteCode?: string;
}

export interface WebAuthnCredentialResponse {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject?: string;
    authenticatorData?: string;
    signature?: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults: {};
  authenticatorAttachment?: 'platform' | 'cross-platform';
}

/**
 * Convert native WebAuthn credential to format expected by backend
 */
function convertCredentialForBackend(credential: any): WebAuthnCredentialResponse {
  return {
    id: credential.id,
    rawId: WebAuthnUtils.bufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: WebAuthnUtils.bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: credential.response.attestationObject 
        ? WebAuthnUtils.bufferToBase64url(credential.response.attestationObject)
        : undefined,
      authenticatorData: credential.response.authenticatorData
        ? WebAuthnUtils.bufferToBase64url(credential.response.authenticatorData)
        : undefined,
      signature: credential.response.signature
        ? WebAuthnUtils.bufferToBase64url(credential.response.signature)
        : undefined,
      userHandle: credential.response.userHandle
        ? WebAuthnUtils.bufferToBase64url(credential.response.userHandle)
        : undefined,
    },
    type: credential.type,
    clientExtensionResults: credential.clientExtensionResults || {},
    authenticatorAttachment: credential.authenticatorAttachment,
  };
}

/**
 * Hook for WebAuthn registration with resident keys
 */
export const useWebAuthnRegistration = () => {
  return useMutation({
    mutationFn: async (data: WebAuthnRegistrationData): Promise<string> => {
      console.log('🆕 Starting native WebAuthn registration for:', data.displayName);

      // Step 1: Get registration challenge from server
      const beginResponse = await apiFetch('/auth/register/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          display_name: data.displayName,
          invite_code: data.inviteCode,
        },
      });

      console.log('📡 Server registration begin response:', beginResponse.data);

      const { challenge_id, options } = beginResponse.data;
      
      // Extract challenge and other options from server response
      const serverOptions = (options as any).publicKey || options;
      const challenge = serverOptions.challenge;
      const user = serverOptions.user;

      if (!challenge || !user) {
        throw new Error('Invalid registration options from server');
      }

      console.log('🔑 Registration challenge received:', {
        challengeId: challenge_id,
        challenge: challenge.substring(0, 16) + '...',
        userId: user.id,
        userName: user.name,
        displayName: user.displayName,
      });

      // Step 2: Create credential using native WebAuthn with forced resident key
      const credential = await webAuthnService.register(
        challenge,
        user.id,
        user.name,
        user.displayName
      );

      console.log('✅ Native WebAuthn credential created:', {
        id: credential.id,
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
      });

      // Step 3: Convert credential to backend format
      const backendCredential = convertCredentialForBackend(credential);

      // Step 4: Complete registration with server
      console.log('🏁 Finishing registration with server...');
      const finishResponse = await apiFetch('/auth/register/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id,
          credential: backendCredential,
        },
      });

      console.log('🎉 Registration completed successfully:', finishResponse.data);

      if (finishResponse.data.success && finishResponse.data.user_id) {
        return finishResponse.data.user_id;
      } else {
        throw new Error('Registration completed but failed to get user data');
      }
    },
    onError: (error) => {
      console.error('❌ WebAuthn registration failed:', error);
    },
  });
};

/**
 * Hook for WebAuthn authentication with discoverable credentials
 */
export const useWebAuthnAuthentication = () => {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      console.log('🔐 Starting native WebAuthn authentication...');

      // Step 1: Get authentication challenge from server
      const beginResponse = await apiFetch('/auth/login/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {},
      });

      console.log('📡 Server authentication begin response:', beginResponse.data);

      const { challenge_id, options } = beginResponse.data;
      
      // Extract challenge from server response
      const serverOptions = (options as any).publicKey || options;
      const challenge = serverOptions.challenge;

      if (!challenge) {
        throw new Error('Invalid authentication options from server');
      }

      console.log('🔑 Authentication challenge received:', {
        challengeId: challenge_id,
        challenge: challenge.substring(0, 16) + '...',
      });

      // Step 2: Authenticate using native WebAuthn with discoverable credentials
      const credential = await webAuthnService.authenticate(challenge);

      console.log('✅ Native WebAuthn authentication successful:', {
        id: credential.id,
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
      });

      // Step 3: Convert credential to backend format
      const backendCredential = convertCredentialForBackend(credential);

      // Step 4: Complete authentication with server
      console.log('🏁 Finishing authentication with server...');
      const finishResponse = await apiFetch('/auth/login/finish', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          challenge_id,
          credential: backendCredential,
        },
      });

      console.log('🎉 Authentication completed successfully:', finishResponse.data);

      if (finishResponse.data.success && finishResponse.data.user_id) {
        return finishResponse.data.user_id;
      } else {
        throw new Error('Authentication completed but failed to get user data');
      }
    },
    onError: (error) => {
      console.error('❌ WebAuthn authentication failed:', error);
    },
  });
};

/**
 * Hook to check WebAuthn support and capabilities
 */
export const useWebAuthnSupport = () => {
  return useQuery({
    queryKey: ['webauthn', 'support'],
    queryFn: async () => {
      const isSupported = webAuthnService.isSupported();
      const supportsResidentKeys = await webAuthnService.supportsResidentKeys();
      const hasCredentials = await webAuthnService.hasDiscoverableCredentials();
      const browserInfo = webAuthnService.getBrowserInfo();

      return {
        isSupported,
        supportsResidentKeys,
        hasCredentials,
        browserInfo,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}; 