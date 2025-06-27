import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService, type UserAuthResponse } from '../services/auth';

export const useAuth = () => {
  const queryClient = useQueryClient();

  const createAccountMutation = useMutation({
    mutationFn: async (data: { displayName: string; inviteCode?: string }) => {
      return authService.createAccount(data.displayName, data.inviteCode);
    },
    onSuccess: (authResponse: UserAuthResponse) => {
      // Update user query data
      queryClient.setQueryData(['current_user'], authResponse.user);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const success = await authService.loginWithPasskey();
      if (!success) {
        throw new Error('Login failed');
      }
      return authService.getCurrentUser();
    },
    onSuccess: (user) => {
      // Update user query data
      queryClient.setQueryData(['current_user'], user);
    },
  });

  return {
    createAccount: createAccountMutation.mutate,
    isCreatingAccount: createAccountMutation.isPending,
    createAccountError: createAccountMutation.error,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    hasStoredPasskey: authService.hasStoredPasskey(),
  };
}; 