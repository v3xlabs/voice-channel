import { useState, useEffect, useCallback, useRef } from 'react';
import { webrtcService, type Participant } from '../services/webrtc';

export interface UseWebRTCOptions {
  channelId: string;
  userId: string;
  displayName: string;
}

export const useWebRTC = ({ channelId, userId, displayName }: UseWebRTCOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Initialize WebRTC service
  useEffect(() => {
    if (!initialized.current) {
      webrtcService.initialize().catch(err => {
        console.error('Failed to initialize WebRTC service:', err);
        setError('Failed to initialize WebRTC');
      });
      initialized.current = true;
    }
  }, []);

  const handleParticipantJoined = useCallback((participant: Participant) => {
    setParticipants(prev => [...prev, participant]);
  }, []);

  const handleParticipantLeft = useCallback((participantId: string) => {
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  }, []);

  const handleParticipantUpdated = useCallback((participant: Participant) => {
    if (participant.id === localParticipant?.id) {
      setLocalParticipant(participant);
    } else {
      setParticipants(prev => 
        prev.map(p => p.id === participant.id ? participant : p)
      );
    }
  }, [localParticipant?.id]);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      const participant = await webrtcService.joinChannel(
        channelId,
        userId,
        displayName
      );

      setLocalParticipant(participant);
      setIsConnected(true);
    } catch (err) {
      console.error('Failed to connect to channel:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, userId, displayName, isConnected, isConnecting]);

  const disconnect = useCallback(async () => {
    if (!isConnected) return;

    try {
      await webrtcService.leaveChannel();
      setIsConnected(false);
      setLocalParticipant(null);
      setParticipants([]);
      setLocalVideoStream(null);
      setError(null);
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }, [isConnected]);

  const toggleAudio = useCallback(async () => {
    if (!localParticipant) return;

    try {
      if (localParticipant.isAudioEnabled) {
        await webrtcService.disableAudio();
      } else {
        await webrtcService.enableAudio();
      }
    } catch (err) {
      console.error('Failed to toggle audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle audio');
    }
  }, [localParticipant]);

  const toggleVideo = useCallback(async () => {
    if (!localParticipant) return;

    try {
      if (localParticipant.isVideoEnabled) {
        await webrtcService.disableVideo();
        setLocalVideoStream(null);
      } else {
        const stream = await webrtcService.enableVideo();
        setLocalVideoStream(stream || null);
      }
    } catch (err) {
      console.error('Failed to toggle video:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle video');
    }
  }, [localParticipant]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isConnected) {
        webrtcService.leaveChannel().catch(console.error);
      }
    };
  }, [isConnected]);

  return {
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
  };
}; 