use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct Participant {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub user_id: String, // For now, just a simple string identifier
    pub peer_id: String, // WebRTC peer ID
    pub display_name: String,
    pub is_audio_enabled: bool,
    pub is_video_enabled: bool,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct JoinChannelRequest {
    pub user_id: String,
    pub display_name: String,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct ParticipantUpdate {
    pub is_audio_enabled: Option<bool>,
    pub is_video_enabled: Option<bool>,
}

impl Participant {
    pub fn new(
        channel_id: Uuid,
        user_id: String,
        peer_id: String,
        display_name: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            channel_id,
            user_id,
            peer_id,
            display_name,
            is_audio_enabled: false,
            is_video_enabled: false,
            joined_at: Utc::now(),
        }
    }
} 