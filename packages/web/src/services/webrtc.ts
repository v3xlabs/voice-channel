import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types';
import type { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';

export interface Participant {
  id: string;
  userId: string;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  audioProducer?: Producer;
  videoProducer?: Producer;
  audioConsumer?: Consumer;
  videoConsumer?: Consumer;
}

export class WebRTCService {
  private device?: Device;
  private sendTransport?: Transport;
  private recvTransport?: Transport;
  private participants = new Map<string, Participant>();
  private localParticipant?: Participant;
  private channelId?: string;
  private onParticipantJoined?: (participant: Participant) => void;
  private onParticipantLeft?: (participantId: string) => void;
  private onParticipantUpdated?: (participant: Participant) => void;

  async initialize() {
    this.device = new Device();
  }

  async joinChannel(
    channelId: string, 
    userId: string, 
    displayName: string,
    callbacks: {
      onParticipantJoined?: (participant: Participant) => void;
      onParticipantLeft?: (participantId: string) => void;
      onParticipantUpdated?: (participant: Participant) => void;
    }
  ) {
    this.channelId = channelId;
    this.onParticipantJoined = callbacks.onParticipantJoined;
    this.onParticipantLeft = callbacks.onParticipantLeft;
    this.onParticipantUpdated = callbacks.onParticipantUpdated;

    // Join channel on server
    const response = await fetch(`/api/channels/${channelId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, display_name: displayName }),
    });

    if (!response.ok) {
      throw new Error('Failed to join channel');
    }

    const participantData = await response.json();
    
    this.localParticipant = {
      id: participantData.id,
      userId: participantData.user_id,
      displayName: participantData.display_name,
      isAudioEnabled: false,
      isVideoEnabled: false,
    };

    // Get router RTP capabilities
    const rtpCapabilitiesResponse = await fetch(`/api/channels/${channelId}/rtp-capabilities`);
    const rtpCapabilities: RtpCapabilities = await rtpCapabilitiesResponse.json();

    // Load device with RTP capabilities
    if (!this.device?.loaded) {
      await this.device?.load({ routerRtpCapabilities: rtpCapabilities });
    }

    // Create transports
    await this.createTransports();

    return this.localParticipant;
  }

  private async createTransports() {
    if (!this.channelId) throw new Error('Not joined to a channel');

    // Create send transport
    const sendTransportResponse = await fetch(`/api/channels/${this.channelId}/transports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producing: true, consuming: false }),
    });
    const sendTransportData = await sendTransportResponse.json();

    this.sendTransport = this.device?.createSendTransport({
      id: sendTransportData.id,
      iceParameters: sendTransportData.ice_parameters,
      iceCandidates: sendTransportData.ice_candidates,
      dtlsParameters: sendTransportData.dtls_parameters,
    });

    // Create receive transport
    const recvTransportResponse = await fetch(`/api/channels/${this.channelId}/transports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producing: false, consuming: true }),
    });
    const recvTransportData = await recvTransportResponse.json();

    this.recvTransport = this.device?.createRecvTransport({
      id: recvTransportData.id,
      iceParameters: recvTransportData.ice_parameters,
      iceCandidates: recvTransportData.ice_candidates,
      dtlsParameters: recvTransportData.dtls_parameters,
    });

    // Handle transport events
    this.sendTransport?.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await fetch(`/api/transports/${this.sendTransport?.id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transport_id: this.sendTransport?.id, dtls_parameters: dtlsParameters }),
        });
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    this.sendTransport?.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const response = await fetch(`/api/transports/${this.sendTransport?.id}/produce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            transport_id: this.sendTransport?.id, 
            kind,
            rtp_parameters: rtpParameters 
          }),
        });
        const { producer_id } = await response.json();
        callback({ id: producer_id });
      } catch (error) {
        errback(error as Error);
      }
    });

    this.recvTransport?.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await fetch(`/api/transports/${this.recvTransport?.id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transport_id: this.recvTransport?.id, dtls_parameters: dtlsParameters }),
        });
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });
  }

  async enableAudio() {
    if (!this.sendTransport || !this.localParticipant) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      
      const audioProducer = await this.sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: true,
        },
      });

      this.localParticipant.audioProducer = audioProducer;
      this.localParticipant.isAudioEnabled = true;

      if (this.onParticipantUpdated) {
        this.onParticipantUpdated(this.localParticipant);
      }
    } catch (error) {
      console.error('Failed to enable audio:', error);
      throw error;
    }
  }

  async disableAudio() {
    if (this.localParticipant?.audioProducer) {
      this.localParticipant.audioProducer.close();
      this.localParticipant.audioProducer = undefined;
      this.localParticipant.isAudioEnabled = false;

      if (this.onParticipantUpdated) {
        this.onParticipantUpdated(this.localParticipant);
      }
    }
  }

  async enableVideo() {
    if (!this.sendTransport || !this.localParticipant) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } 
      });
      const videoTrack = stream.getVideoTracks()[0];
      
      const videoProducer = await this.sendTransport.produce({
        track: videoTrack,
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      this.localParticipant.videoProducer = videoProducer;
      this.localParticipant.isVideoEnabled = true;

      if (this.onParticipantUpdated) {
        this.onParticipantUpdated(this.localParticipant);
      }

      return stream;
    } catch (error) {
      console.error('Failed to enable video:', error);
      throw error;
    }
  }

  async disableVideo() {
    if (this.localParticipant?.videoProducer) {
      this.localParticipant.videoProducer.close();
      this.localParticipant.videoProducer = undefined;
      this.localParticipant.isVideoEnabled = false;

      if (this.onParticipantUpdated) {
        this.onParticipantUpdated(this.localParticipant);
      }
    }
  }

  async leaveChannel() {
    if (!this.channelId) return;

    // Close all producers and consumers
    this.localParticipant?.audioProducer?.close();
    this.localParticipant?.videoProducer?.close();

    for (const participant of this.participants.values()) {
      participant.audioConsumer?.close();
      participant.videoConsumer?.close();
    }

    // Close transports
    this.sendTransport?.close();
    this.recvTransport?.close();

    // Leave on server
    await fetch(`/api/channels/${this.channelId}/leave`, {
      method: 'POST',
    });

    // Reset state
    this.participants.clear();
    this.localParticipant = undefined;
    this.channelId = undefined;
    this.sendTransport = undefined;
    this.recvTransport = undefined;
  }

  getLocalParticipant() {
    return this.localParticipant;
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }
}

export const webrtcService = new WebRTCService(); 