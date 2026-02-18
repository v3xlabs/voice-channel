import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { useWebAuthnRegistration, useWebAuthnAuthentication } from './useWebAuthn';

// Interfaces removed - now handled by WebAuthn hooks

export const useAuth = () => {
  const { isAuthenticated, login: contextLogin, logout: contextLogout } = useAuthContext();
  const queryClient = useQueryClient();

  // Use the new native WebAuthn hooks
  const webAuthnLogin = useWebAuthnAuthentication();
  const webAuthnRegister = useWebAuthnRegistration();

  const loginMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      return await webAuthnLogin.mutateAsync();
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
      return await webAuthnRegister.mutateAsync({
        displayName: data.displayName,
        inviteCode: data.inviteCode,
      });
    },
    onSuccess: (userId) => {
      // Store user_id as token and mark as authenticated
      contextLogin(userId);
      // Invalidate all auth-related queries to refetch with new token
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error) => {
      console.error('❌ WebAuthn registration failed:', error);
      // Clear any stale auth state
      contextLogout();
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