import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

interface LoginResponse {
  success: boolean;
  user_id: string;
  username?: string;
}

interface RegisterResponse {
  success: boolean;
  user_id: string;
}

export const useAuth = () => {
  const { isAuthenticated, login: contextLogin, logout: contextLogout } = useAuthContext();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (): Promise<string> => {
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
      const loginResponse = finishResponse.data as LoginResponse;
      
      if (loginResponse.success && loginResponse.user_id) {
        // Use user_id as token identifier until backend supports JWT
        return loginResponse.user_id;
      } else {
        throw new Error('Login completed but failed to get user data');
      }
    },
    onSuccess: (userId) => {
      // Store user_id as token and mark as authenticated
      contextLogin(userId);
      // Invalidate all auth-related queries to refetch with new token
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error) => {
      console.error('❌ WebAuthn authentication failed:', error);
      // Clear any stale auth state
      contextLogout();
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { displayName: string; inviteCode?: string }): Promise<string> => {
      console.log('🆕 Starting WebAuthn registration for:', data.displayName);
      
      // Step 1: Start WebAuthn registration
      const beginResponse = await apiFetch('/auth/register/begin', 'post', {
        contentType: 'application/json; charset=utf-8',
        data: {
          display_name: data.displayName,
          invite_code: data.inviteCode,
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
      const regResponse = finishResponse.data as RegisterResponse;
      
      if (regResponse.success && regResponse.user_id) {
        // Use user_id as token identifier until backend supports JWT
        return regResponse.user_id;
      } else {
        throw new Error('Registration completed but failed to get user data');
      }
    },
    onSuccess: (userId) => {
      // Store user_id as token and mark as authenticated
      contextLogin(userId);
      // Invalidate all auth-related queries to refetch with new token
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error) => {
      console.error('❌ WebAuthn registration failed:', error);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Just logout locally - no server call needed
      contextLogout();
    },
    onSuccess: () => {
      // Clear all queries on logout
      queryClient.clear();
    },
  });

  return {
    isAuthenticated,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}; 