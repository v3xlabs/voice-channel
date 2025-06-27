import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { authService, type InstanceSettings } from '../services/auth';

const getInstanceSettings = () => queryOptions({
  queryKey: ['admin', 'instance_settings'],
  async queryFn() {
    const result = await authService.getInstanceSettings();
    return result;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});

const getRegistrationStatus = () => queryOptions({
  queryKey: ['admin', 'registration_status'],
  async queryFn() {
    const result = await authService.getRegistrationStatus();
    return result;
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getAdminUsers = () => queryOptions({
  queryKey: ['admin', 'users'],
  async queryFn() {
    // TODO: Replace with actual API call when endpoint is available
    // const result = await authService.getUsers();
    return [];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getAdminGroups = () => queryOptions({
  queryKey: ['admin', 'groups'],
  async queryFn() {
    // TODO: Replace with actual API call when endpoint is available
    // const result = await authService.getGroups();
    return [];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

export const useAdmin = () => {
  const queryClient = useQueryClient();

  const {
    data: instanceSettings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useQuery(getInstanceSettings());

  const {
    data: registrationStatus,
    isLoading: isLoadingStatus,
    error: statusError,
  } = useQuery(getRegistrationStatus());

  const {
    data: users = [],
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery(getAdminUsers());

  const {
    data: groups = [],
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useQuery(getAdminGroups());

  const updateInstanceSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<InstanceSettings>) => {
      // TODO: Replace with actual API call when endpoint is available
      // return authService.updateInstanceSettings(settings);
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'instance_settings'] });
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { email?: string; maxUses?: number }) => {
      // TODO: Replace with actual API call when endpoint is available
      // return authService.createInvitation(data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const isLoading = isLoadingSettings || isLoadingStatus || isLoadingUsers || isLoadingGroups;
  const error = settingsError || statusError || usersError || groupsError;

  return {
    // Data
    instanceSettings,
    registrationStatus,
    users,
    groups,

    // Loading states
    isLoading,
    isLoadingSettings,
    isLoadingStatus,
    isLoadingUsers,
    isLoadingGroups,

    // Error states
    error,
    settingsError,
    statusError,
    usersError,
    groupsError,

    // Mutations
    updateInstanceSettings: updateInstanceSettingsMutation.mutate,
    isUpdatingSettings: updateInstanceSettingsMutation.isPending,
    createInvitation: createInvitationMutation.mutate,
    isCreatingInvitation: createInvitationMutation.isPending,

    // Helper
    isAdmin: authService.isAdmin(),
  };
}; 