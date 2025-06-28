import { useState, useCallback } from 'react';
import { WebRTCService, type Participant } from '../services/webrtc';

interface UseWebRTCProps {
  channelId: string;
  userId: string;
  displayName: string;
}

export const useWebRTC = ({ channelId, userId, displayName }: UseWebRTCProps) => {
  const [webrtcService] = useState(() => new WebRTCService());
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;

    try {
      setIsConnecting(true);
      setError(null);

      const participant = await webrtcService.joinChannel(channelId, userId, displayName);
      setLocalParticipant(participant);
      setIsConnected(true);

      // Get local video stream
      const videoStream = await webrtcService.getLocalVideoStream();
      setLocalVideoStream(videoStream);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to connect to WebRTC:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, userId, displayName, isConnecting, isConnected, webrtcService]);

  const disconnect = useCallback(async () => {
    try {
      await webrtcService.leaveChannel();
      setIsConnected(false);
      setLocalParticipant(null);
      setParticipants([]);
      setLocalVideoStream(null);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to disconnect from WebRTC:', err);
    }
  }, [webrtcService]);

  const toggleAudio = useCallback(async () => {
    try {
      const enabled = await webrtcService.toggleAudio();
      if (localParticipant) {
        setLocalParticipant({ ...localParticipant, audioEnabled: enabled });
      }
    } catch (err) {
      setError(err as Error);
      console.error('Failed to toggle audio:', err);
    }
  }, [webrtcService, localParticipant]);

  const toggleVideo = useCallback(async () => {
    try {
      const enabled = await webrtcService.toggleVideo();
      if (localParticipant) {
        setLocalParticipant({ ...localParticipant, videoEnabled: enabled });
      }
      
      // Update video stream
      const videoStream = await webrtcService.getLocalVideoStream();
      setLocalVideoStream(videoStream);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to toggle video:', err);
    }
  }, [webrtcService, localParticipant]);

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