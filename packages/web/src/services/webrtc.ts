import { Device } from 'mediasoup-client';
import { apiFetch } from './api';

export interface Participant {
  id: string;
  userId: string;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

export class WebRTCService {
  private device?: Device;
  private sendTransport?: any;
  private recvTransport?: any;
  private producers: Map<string, any> = new Map();
  private consumers: Map<string, any> = new Map();
  private localParticipant?: Participant;
  private channelId?: string;

  async joinChannel(channelId: string, userId: string, displayName: string): Promise<void> {
    this.channelId = channelId;

    try {
      // Join channel on server using openapi-hooks
      // Use the exact OpenAPI path format
      const joinResponse = await apiFetch('/channels/{channel_id}/join', 'post', {
        path: { channel_id: channelId },
        contentType: "application/json; charset=utf-8",
        data: { user_id: userId, display_name: displayName },
      });

      // openapi-hooks automatically types the response, access data property
      const participantData = joinResponse.data;
      
      this.localParticipant = {
        id: participantData.id,
        userId: participantData.user_id,
        displayName: participantData.display_name,
        isAudioEnabled: false,
        isVideoEnabled: false,
      };

      // Get router RTP capabilities using openapi-hooks
      const rtpCapabilitiesResponse = await apiFetch('/channels/{channel_id}/rtp-capabilities', 'get', {
        path: { channel_id: channelId },
      });
      
      const backendRtpCapabilities = rtpCapabilitiesResponse.data;

      console.log('✅ Successfully joined channel and got RTP capabilities:', {
        participant: participantData,
        rtpCapabilities: backendRtpCapabilities
      });

      // For now, just initialize the device with a simple capabilities object
      // We'll implement real mediasoup integration once the API communication works
      this.device = new Device();
      
      // Temporary simplified RTP capabilities for testing
      const simpleRtpCapabilities = {
        codecs: [
          {
            kind: 'audio' as const,
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
          }
        ],
        headerExtensions: []
      };

      await this.device.load({ routerRtpCapabilities: simpleRtpCapabilities });

      console.log('✅ Device loaded successfully');

    } catch (error) {
      console.error('Failed to join channel:', error);
      throw error;
    }
  }

  async enableAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      
      console.log('✅ Audio track obtained:', audioTrack);
      
      if (this.localParticipant) {
        this.localParticipant.isAudioEnabled = true;
      }
    } catch (error) {
      console.error('Failed to enable audio:', error);
      throw error;
    }
  }

  async enableVideo(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];
      
      console.log('✅ Video track obtained:', videoTrack);
      
      if (this.localParticipant) {
        this.localParticipant.isVideoEnabled = true;
      }
    } catch (error) {
      console.error('Failed to enable video:', error);
      throw error;
    }
  }

  async disableAudio(): Promise<void> {
    if (this.localParticipant) {
      this.localParticipant.isAudioEnabled = false;
    }
  }

  async disableVideo(): Promise<void> {
    if (this.localParticipant) {
      this.localParticipant.isVideoEnabled = false;
    }
  }

  async leaveChannel(): Promise<void> {
    // Reset state
    this.device = undefined;
    this.sendTransport = undefined;
    this.recvTransport = undefined;
    this.localParticipant = undefined;
    this.channelId = undefined;
  }

  getLocalParticipant(): Participant | undefined {
    return this.localParticipant;
  }
}

export const webrtcService = new WebRTCService(); 