import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import type { components } from '../schema.gen';

type User = components['schemas']['User'];
type UpdateUserRequest = components['schemas']['UpdateUserRequest'];

const getUserProfile = (userId: string) => queryOptions({
  queryKey: ['auth', 'user', userId],
  async queryFn() {
    const response = await apiFetch('/users/{user_id}', 'get', {
      path: { user_id: userId },
    });
    return response.data as User;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  retry: false,
});

export const useUser = () => {
  const { isAuthenticated, token: userId } = useAuthContext();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getUserProfile(userId || ''),
    enabled: isAuthenticated && !!userId,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (updates: UpdateUserRequest) => {
      if (!userId) {
        throw new Error('No user logged in');
      }
      
      const response = await apiFetch('/users/{user_id}', 'patch', {
        path: { user_id: userId },
        contentType: 'application/json; charset=utf-8',
        data: updates,
      });
      
      return response.data as User;
    },
    onSuccess: (updatedUser) => {
      // Update the user query cache
      if (userId) {
        queryClient.setQueryData(['auth', 'user', userId], updatedUser);
      }
    },
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isAdmin: user?.is_admin || false,
    refetch,
    updateUser: updateUserMutation.mutate,
    isUpdatingUser: updateUserMutation.isPending,
    updateUserError: updateUserMutation.error,
  };
}; 