export interface Participant {
  id: string;
  displayName: string;
  isLocal: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  videoStream?: MediaStream;
}

export class WebRTCService {
  private socket?: WebSocket;
  private localStream?: MediaStream;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localParticipant?: Participant;

  constructor() {
    // Initialize WebRTC service
  }

  async initialize(): Promise<void> {
    // Initialize any global WebRTC setup here
    // For now, this is just a placeholder that ensures the service is ready
    console.log('✅ WebRTC service initialized');
  }

  async joinChannel(channelId: string, userId: string, displayName: string): Promise<Participant> {
    // TODO: Implement WebRTC channel joining
    console.log('Joining channel:', { channelId, userId, displayName });
    
    const participant: Participant = {
      id: userId,
      displayName,
      isLocal: true,
      audioEnabled: true,
      videoEnabled: false,
    };

    this.localParticipant = participant;
    return participant;
  }

  async leaveChannel(): Promise<void> {
    // TODO: Implement WebRTC channel leaving
    console.log('Leaving channel');
    
    // Clean up local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = undefined;
    }

    // Close peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();

    // Close socket
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }

    this.localParticipant = undefined;
  }

  async toggleAudio(): Promise<boolean> {
    // TODO: Implement audio toggle
    console.log('Toggling audio');
    if (this.localParticipant) {
      this.localParticipant.audioEnabled = !this.localParticipant.audioEnabled;
      return this.localParticipant.audioEnabled;
    }
    return true;
  }

  async toggleVideo(): Promise<boolean> {
    // TODO: Implement video toggle
    console.log('Toggling video');
    if (this.localParticipant) {
      this.localParticipant.videoEnabled = !this.localParticipant.videoEnabled;
      return this.localParticipant.videoEnabled;
    }
    return false;
  }

  async getLocalVideoStream(): Promise<MediaStream | null> {
    // TODO: Implement local video stream
    return null;
  }

  getLocalParticipant(): Participant | undefined {
    return this.localParticipant;
  }
}

export const webrtcService = new WebRTCService(); 