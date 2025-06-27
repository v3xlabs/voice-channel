import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { authService } from '../services/auth';
import { useUser } from './useUser';

const getUserChannels = (userId?: string) => queryOptions({
  queryKey: ['user_channels', userId],
  async queryFn() {
    const result = await authService.getUserChannels();
    return result;
  },
  enabled: !!userId,
  staleTime: 2 * 60 * 1000, // 2 minutes
});

export const useChannels = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery(getUserChannels(user?.id));

  const joinChannelMutation = useMutation({
    mutationFn: async (data: { instanceFqdn: string; channelName: string }) => {
      return authService.joinChannel(data.instanceFqdn, data.channelName);
    },
    onSuccess: () => {
      // Refetch channels list after joining
      queryClient.invalidateQueries({ queryKey: ['user_channels', user?.id] });
    },
  });

  const leaveChannelMutation = useMutation({
    mutationFn: async (data: { instanceFqdn: string; channelName: string }) => {
      return authService.leaveChannel(data.instanceFqdn, data.channelName);
    },
    onSuccess: () => {
      // Refetch channels list after leaving
      queryClient.invalidateQueries({ queryKey: ['user_channels', user?.id] });
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