use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct RtpCapabilities {
    pub codecs: Vec<RtpCodecCapability>,
    pub header_extensions: Vec<RtpHeaderExtension>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct RtpCodecCapability {
    pub kind: String, // "audio" or "video"
    pub mime_type: String,
    pub clock_rate: u32,
    pub channels: Option<u32>,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct RtpHeaderExtension {
    pub uri: String,
    pub id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct TransportInfo {
    pub id: String,
    pub ice_parameters: IceParameters,
    pub ice_candidates: Vec<IceCandidate>,
    pub dtls_parameters: DtlsParameters,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct IceParameters {
    pub username_fragment: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct IceCandidate {
    pub foundation: String,
    pub priority: u32,
    pub ip: String,
    pub port: u16,
    pub r#type: String,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct DtlsParameters {
    pub role: String, // "client" or "server"
    pub fingerprints: Vec<DtlsFingerprint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct DtlsFingerprint {
    pub algorithm: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct CreateTransportRequest {
    pub producing: bool,
    pub consuming: bool,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ConnectTransportRequest {
    pub transport_id: String,
    pub dtls_parameters: DtlsParameters,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ConnectTransportResponse {
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ProduceRequest {
    pub transport_id: String,
    pub kind: String, // "audio" or "video"
    pub rtp_parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ProduceResponse {
    pub producer_id: String,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ConsumeRequest {
    pub transport_id: String,
    pub producer_id: String,
    pub rtp_capabilities: RtpCapabilities,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ConsumeResponse {
    pub consumer_id: String,
    pub producer_id: String,
    pub kind: String,
    pub rtp_parameters: serde_json::Value,
}

// WebSocket message types for real-time signaling
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    #[serde(rename = "join")]
    Join {
        channel_id: Uuid,
        user_id: String,
        display_name: String,
    },
    #[serde(rename = "leave")]
    Leave {
        channel_id: Uuid,
    },
    #[serde(rename = "participant-joined")]
    ParticipantJoined {
        participant: crate::models::participant::Participant,
    },
    #[serde(rename = "participant-left")]
    ParticipantLeft {
        participant_id: Uuid,
    },
    #[serde(rename = "media-state-changed")]
    MediaStateChanged {
        participant_id: Uuid,
        is_audio_enabled: bool,
        is_video_enabled: bool,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
} 