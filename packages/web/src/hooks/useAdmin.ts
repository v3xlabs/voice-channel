import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import { useUser } from './useUser';
import type { components } from '../types/api';

type InstanceSettings = components['schemas']['InstanceSettings'];
type User = components['schemas']['User'];
type Invitation = components['schemas']['Invitation'];

// Create types for data we need that might not be in the generated schema yet
interface CreateInvitationRequest {
  max_uses?: number;
  expires_at?: string;
  invited_email?: string;
}

interface InvitationWithCreator extends Invitation {
  creator_username: string;
  creator_display_name: string;
}

const getInstanceSettings = () => queryOptions({
  queryKey: ['auth', 'admin', 'instance_settings'],
  async queryFn() {
    const response = await apiFetch('/admin/settings', 'get', {});
    return response.data;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});

const getRegistrationStatus = () => queryOptions({
  queryKey: ['auth', 'admin', 'registration_status'],
  async queryFn() {
    const response = await apiFetch('/admin/registration-status', 'get', {});
    return response.data;
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

// TODO: These endpoints need to be added to the backend's OpenAPI spec
// Currently missing from generated types:
// - GET /admin/users
// - GET /admin/invitations  
// - GET /admin/invitations/my
// - POST /admin/invitations
// - PATCH /admin/settings
// - POST /admin/invitations/{id}/deactivate
// - DELETE /admin/invitations/{id}

const getInstanceUsers = (userId: string, instanceFqdn: string) => queryOptions({
  queryKey: ['auth', 'admin', 'users', instanceFqdn],
  async queryFn() {
    // This endpoint is not in the OpenAPI spec yet
    // Will return empty array until backend OpenAPI spec is updated
    console.warn('GET /admin/users endpoint not available in OpenAPI spec yet');
    return [] as User[];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getInstanceInvitations = (userId: string, instanceFqdn: string) => queryOptions({
  queryKey: ['auth', 'admin', 'invitations', instanceFqdn],
  async queryFn() {
    // This endpoint is not in the OpenAPI spec yet
    // Will return empty array until backend OpenAPI spec is updated
    console.warn('GET /admin/invitations endpoint not available in OpenAPI spec yet');
    return [] as InvitationWithCreator[];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

const getMyInvitations = (userId: string) => queryOptions({
  queryKey: ['auth', 'admin', 'my_invitations', userId],
  async queryFn() {
    // This endpoint is not in the OpenAPI spec yet
    // Will return empty array until backend OpenAPI spec is updated
    console.warn('GET /admin/invitations/my endpoint not available in OpenAPI spec yet');
    return [] as Invitation[];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

export const useAdmin = () => {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useUser();
  const isAdmin = isAuthenticated && user?.is_admin === true;
  const userId = user?.user_id || '';
  const instanceFqdn = user?.instance_fqdn || '';

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
    ...getInstanceUsers(userId, instanceFqdn),
    enabled: isAdmin && !!userId && !!instanceFqdn,
  });

  const {
    data: invitations = [],
    isLoading: isLoadingInvitations,
    error: invitationsError,
  } = useQuery({
    ...getInstanceInvitations(userId, instanceFqdn),
    enabled: isAdmin && !!userId && !!instanceFqdn,
  });

  const {
    data: myInvitations = [],
    isLoading: isLoadingMyInvitations,
    error: myInvitationsError,
  } = useQuery({
    ...getMyInvitations(userId),
    enabled: isAuthenticated && !!userId,
  });

  const updateInstanceSettingsMutation = useMutation({
    mutationFn: async () => {
      // PATCH /admin/settings is not in the OpenAPI spec yet
      console.warn('PATCH /admin/settings endpoint not available in OpenAPI spec yet');
      throw new Error('Update settings endpoint not available - needs to be added to backend OpenAPI spec');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'instance_settings'] });
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async () => {
      // POST /admin/invitations is not in the OpenAPI spec yet
      console.warn('POST /admin/invitations endpoint not available in OpenAPI spec yet');
      throw new Error('Create invitation endpoint not available - needs to be added to backend OpenAPI spec');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  const deactivateInvitationMutation = useMutation({
    mutationFn: async () => {
      // POST /admin/invitations/{id}/deactivate is not in the OpenAPI spec yet
      console.warn('POST /admin/invitations/{id}/deactivate endpoint not available in OpenAPI spec yet');
      throw new Error('Deactivate invitation endpoint not available - needs to be added to backend OpenAPI spec');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async () => {
      // DELETE /admin/invitations/{id} is not in the OpenAPI spec yet
      console.warn('DELETE /admin/invitations/{id} endpoint not available in OpenAPI spec yet');
      throw new Error('Delete invitation endpoint not available - needs to be added to backend OpenAPI spec');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  const isLoading = isLoadingSettings || isLoadingStatus || isLoadingUsers || isLoadingInvitations;
  const error = settingsError || statusError || usersError || invitationsError;

  return {
    // Data
    instanceSettings,
    registrationStatus,
    users,
    invitations,
    myInvitations,

    // Loading states
    isLoading,
    isLoadingSettings,
    isLoadingStatus,
    isLoadingUsers,
    isLoadingInvitations,
    isLoadingMyInvitations,

    // Error states
    error,
    settingsError,
    statusError,
    usersError,
    invitationsError,
    myInvitationsError,

    // Mutations
    updateInstanceSettings: updateInstanceSettingsMutation.mutate,
    isUpdatingSettings: updateInstanceSettingsMutation.isPending,
    createInvitation: createInvitationMutation.mutate,
    isCreatingInvitation: createInvitationMutation.isPending,
    deactivateInvitation: deactivateInvitationMutation.mutate,
    isDeactivatingInvitation: deactivateInvitationMutation.isPending,
    deleteInvitation: deleteInvitationMutation.mutate,
    isDeletingInvitation: deleteInvitationMutation.isPending,

    // Helper
    isAdmin,
  };
}; 