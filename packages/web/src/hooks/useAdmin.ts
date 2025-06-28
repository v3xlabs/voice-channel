import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import { useUser } from './useUser';
import type { InstanceSettings } from '../services/auth';

const getInstanceSettings = () => queryOptions({
  queryKey: ['admin', 'instance_settings'],
  async queryFn() {
    const response = await apiFetch('/admin/settings', 'get', {});
    return response.data as InstanceSettings;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});

const getRegistrationStatus = () => queryOptions({
  queryKey: ['admin', 'registration_status'],
  async queryFn() {
    const response = await apiFetch('/admin/registration-status', 'get', {});
    return response.data;
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getAdminUsers = () => queryOptions({
  queryKey: ['admin', 'users'],
  async queryFn() {
    // TODO: Replace with actual API call when endpoint is available
    // const response = await apiFetch('/admin/users', 'get', {});
    // return response.data;
    return [];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getAdminGroups = () => queryOptions({
  queryKey: ['admin', 'groups'],
  async queryFn() {
    // TODO: Replace with actual API call when endpoint is available
    // const response = await apiFetch('/admin/groups', 'get', {});
    // return response.data;
    return [];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

export const useAdmin = () => {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useUser();
  const isAdmin = isAuthenticated && user?.is_admin === true;

  const {
    data: instanceSettings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useQuery({
    ...getInstanceSettings(),
    enabled: isAdmin,
  });

  const {
    data: registrationStatus,
    isLoading: isLoadingStatus,
    error: statusError,
  } = useQuery({
    ...getRegistrationStatus(),
    enabled: isAdmin,
  });

  const {
    data: users = [],
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery({
    ...getAdminUsers(),
    enabled: isAdmin,
  });

  const {
    data: groups = [],
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useQuery({
    ...getAdminGroups(),
    enabled: isAdmin,
  });

  const updateInstanceSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<InstanceSettings>) => {
      // TODO: Replace with actual API call when endpoint is available
      // const response = await apiFetch('/admin/settings', 'patch', {
      //   contentType: 'application/json; charset=utf-8',
      //   data: settings,
      // });
      // return response.data;
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'instance_settings'] });
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { email?: string; maxUses?: number }) => {
      // TODO: Replace with actual API call when endpoint is available
      // const response = await apiFetch('/admin/invitations', 'post', {
      //   contentType: 'application/json; charset=utf-8',
      //   data,
      // });
      // return response.data;
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
    isAdmin,
  };
}; 