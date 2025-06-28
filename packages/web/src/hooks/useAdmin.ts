import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import { useUser } from './useUser';
import type { components } from '../schema.gen';

type CreateInvitationRequest = components['schemas']['CreateInvitationRequest'];
type UpdateInstanceSettingsRequest = components['schemas']['UpdateInstanceSettingsRequest'];

const getInstanceSettings = () => queryOptions({
  queryKey: ['auth', 'admin', 'instance_settings'],
  queryFn: async () => {
    const result = await apiFetch('/admin/settings', 'get', {
      query: {
        instance_fqdn: 'localhost', // TODO: Get from config
        admin_user_id: 'current_user_id' // TODO: Get from auth context
      }
    });
    return result.data;
  }
});

export const useInstanceSettings = () => {
  const { user } = useUser();
  
  return useQuery({
    ...getInstanceSettings(),
    enabled: !!user?.is_admin
  });
};

const getUsers = () => queryOptions({
  queryKey: ['auth', 'admin', 'users'],
  queryFn: async () => {
    const result = await apiFetch('/admin/users', 'get', {
      query: {
        instance_fqdn: 'localhost', // TODO: Get from config
        admin_user_id: 'current_user_id' // TODO: Get from auth context
      }
    });
    return result.data;
  }
});

export const useUsers = () => {
  const { user } = useUser();
  
  return useQuery({
    ...getUsers(),
    enabled: !!user?.is_admin
  });
};

const getInvitations = () => queryOptions({
  queryKey: ['auth', 'admin', 'invitations'],
  queryFn: async () => {
    const result = await apiFetch('/admin/invitations', 'get', {
      query: {
        instance_fqdn: 'localhost', // TODO: Get from config
        admin_user_id: 'current_user_id' // TODO: Get from auth context
      }
    });
    return result.data;
  }
});

export const useInvitations = () => {
  const { user } = useUser();
  
  return useQuery({
    ...getInvitations(),
    enabled: !!user?.is_admin
  });
};

const getMyInvitations = () => queryOptions({
  queryKey: ['auth', 'admin', 'my_invitations'],
  queryFn: async () => {
    const result = await apiFetch('/admin/invitations/my', 'get', {
      query: {
        user_id: 'current_user_id' // TODO: Get from auth context
      }
    });
    return result.data;
  }
});

export const useMyInvitations = () => {
  const { user } = useUser();
  
  return useQuery({
    ...getMyInvitations(),
    enabled: !!user
  });
};

export const useAdmin = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  const updateInstanceSettingsMutation = useMutation({
    mutationFn: async (settings: UpdateInstanceSettingsRequest) => {
      const result = await apiFetch('/admin/settings', 'patch', {
        query: {
          instance_fqdn: 'localhost', // TODO: Get from config
          admin_user_id: 'current_user_id' // TODO: Get from auth context
        },
        contentType: 'application/json; charset=utf-8',
        data: settings
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'instance_settings'] });
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (requestData: CreateInvitationRequest) => {
      const result = await apiFetch('/admin/invitations', 'post', {
        query: {
          instance_fqdn: 'localhost', // TODO: Get from config
          user_id: 'current_user_id' // TODO: Get from auth context
        },
        data: requestData
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  const deactivateInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await apiFetch('/admin/invitations/{invitation_id}/deactivate', 'post', {
        params: { invitation_id: invitationId },
        query: {
          _user_id: 'current_user_id' // TODO: Get from auth context
        }
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await apiFetch('/admin/invitations/{invitation_id}', 'delete', {
        params: { invitation_id: invitationId },
        query: {
          _user_id: 'current_user_id' // TODO: Get from auth context
        }
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'admin', 'my_invitations'] });
    },
  });

  return {
    // Data fetching hooks (use these in components)
    instanceSettings: useInstanceSettings(),
    users: useUsers(),
    invitations: useInvitations(),
    myInvitations: useMyInvitations(),
    
    // Mutations
    updateInstanceSettings: updateInstanceSettingsMutation.mutate,
    isUpdatingInstanceSettings: updateInstanceSettingsMutation.isPending,
    
    createInvitation: createInvitationMutation.mutate,
    isCreatingInvitation: createInvitationMutation.isPending,
    
    deactivateInvitation: deactivateInvitationMutation.mutate,
    isDeactivatingInvitation: deactivateInvitationMutation.isPending,
    
    deleteInvitation: deleteInvitationMutation.mutate,
    isDeletingInvitation: deleteInvitationMutation.isPending,
    
    // Admin status
    isAdmin: user?.is_admin || false,
  };
}; 