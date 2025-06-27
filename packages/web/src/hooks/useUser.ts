import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { authService, type UpdateUserRequest } from '../services/auth';

const getCurrentUser = () => queryOptions({
  queryKey: ['current_user'],
  async queryFn() {
    const currentUser = authService.getCurrentUser();
    return currentUser;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  retry: false,
});

export const useUser = () => {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery(getCurrentUser());

  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: string; updates: UpdateUserRequest }) => {
      // TODO: Implement actual API call when backend is ready
      // return authService.updateUser(data.userId, data.updates);
      
      // For now, update local state
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          ...data.updates,
        };
        // Update localStorage or session storage if that's where the user is stored
        localStorage.setItem('user', JSON.stringify(updatedUser));
        return updatedUser;
      }
      throw new Error('No user found');
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['current_user'], updatedUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      authService.logout();
    },
    onSuccess: () => {
      queryClient.setQueryData(['current_user'], null);
      queryClient.clear(); // Clear all queries on logout
    },
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    refetch,
    updateUser: updateUserMutation.mutate,
    isUpdatingUser: updateUserMutation.isPending,
    updateUserError: updateUserMutation.error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}; 