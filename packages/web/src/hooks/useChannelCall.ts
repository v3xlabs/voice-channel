import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebRTC } from './useWebRTC';
import { useUser } from './useUser';

interface UseChannelCallProps {
  channelName: string;
  instanceFqdn?: string;
}

export const useChannelCall = ({ channelName }: UseChannelCallProps) => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isInCall, setIsInCall] = useState(false);

  const {
    isConnected,
    isConnecting,
    localParticipant,
    participants,
    localVideoStream,
    error,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
  } = useWebRTC({
    channelId: channelName,
    userId: user?.user_id || '',
    displayName: user?.display_name || '',
  });

  const joinCallMutation = useMutation({
    mutationFn: async () => {
      if (!user || isConnecting) {
        throw new Error('Cannot join call: user not authenticated or already connecting');
      }
      
      await connect();
      return true;
    },
    onSuccess: () => {
      setIsInCall(true);
      // Invalidate any channel-related queries to update participant counts
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', channelName] });
    },
    onError: (error) => {
      console.error('Failed to join call:', error);
    },
  });

  const leaveCallMutation = useMutation({
    mutationFn: async () => {
      await disconnect();
      return true;
    },
    onSuccess: () => {
      setIsInCall(false);
      // Invalidate any channel-related queries to update participant counts
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', channelName] });
    },
    onError: (error) => {
      console.error('Failed to leave call:', error);
    },
  });

  const allParticipants = localParticipant ? [localParticipant, ...participants] : participants;

  return {
    // Call state
    isInCall: isConnected || isInCall,
    isJoiningCall: joinCallMutation.isPending,
    isLeavingCall: leaveCallMutation.isPending,
    isConnecting,
    
    // Participants
    localParticipant,
    participants,
    allParticipants,
    participantCount: allParticipants.length,
    
    // Media
    localVideoStream,
    
    // Actions
    joinCall: joinCallMutation.mutate,
    leaveCall: leaveCallMutation.mutate,
    toggleAudio,
    toggleVideo,
    
    // Error handling
    error: error || joinCallMutation.error || leaveCallMutation.error,
    
    // Helper flags
    canJoinCall: !!user && !isConnecting && !joinCallMutation.isPending,
  };
}; 