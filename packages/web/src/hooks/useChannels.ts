import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import type { components } from '../types/api';

type ChannelMembership = components['schemas']['ChannelMembership'];
type ChannelMembershipWithChannel = components['schemas']['ChannelMembershipWithChannel'];

const getUserChannels = (userId: string) => queryOptions({
  queryKey: ['auth', 'user', userId, 'channels'],
  async queryFn() {
    const response = await apiFetch('/users/{user_id}/channels', 'get', {
      path: { user_id: userId },
    });
    return response.data as ChannelMembershipWithChannel[];
  },
  staleTime: 2 * 60 * 1000, // 2 minutes
});

export const useChannels = () => {
  const { isAuthenticated, token: userId } = useAuthContext();
  const queryClient = useQueryClient();

  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getUserChannels(userId || ''),
    enabled: isAuthenticated && !!userId,
  });

  const joinChannelMutation = useMutation({
    mutationFn: async (data: { instanceFqdn: string; channelName: string }) => {
      if (!userId) {
        throw new Error('No user logged in');
      }
      
      const response = await apiFetch('/channels/{channel_instance_fqdn}/{channel_name}/members', 'post', {
        path: { 
          channel_instance_fqdn: data.instanceFqdn,
          channel_name: data.channelName,
        },
        query: { user_id: userId },
      });
      
      return response.data as ChannelMembership;
    },
    onSuccess: () => {
      // Refetch channels list after joining
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'user', userId, 'channels'] });
      }
    },
  });

  const leaveChannelMutation = useMutation({
    mutationFn: async (data: { instanceFqdn: string; channelName: string }) => {
      if (!userId) {
        throw new Error('No user logged in');
      }
      
      await apiFetch('/channels/{channel_instance_fqdn}/{channel_name}/members/{user_id}', 'delete', {
        path: { 
          channel_instance_fqdn: data.instanceFqdn,
          channel_name: data.channelName,
          user_id: userId,
        },
      });
    },
    onSuccess: () => {
      // Refetch channels list after leaving
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'user', userId, 'channels'] });
      }
    },
  });

  return {
    channels,
    isLoading,
    error,
    refetch,
    joinChannel: joinChannelMutation.mutate,
    isJoiningChannel: joinChannelMutation.isPending,
    joinChannelError: joinChannelMutation.error,
    leaveChannel: leaveChannelMutation.mutate,
    isLeavingChannel: leaveChannelMutation.isPending,
    leaveChannelError: leaveChannelMutation.error,
  };
}; 