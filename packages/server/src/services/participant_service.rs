use std::sync::Arc;
use dashmap::DashMap;
use uuid::Uuid;
use crate::models::participant::Participant;

pub struct ParticipantService {
    // Channel ID -> Map of Participant ID -> Participant
    pub participants: Arc<DashMap<Uuid, DashMap<Uuid, Participant>>>,
}

impl ParticipantService {
    pub fn new() -> Self {
        Self {
            participants: Arc::new(DashMap::new()),
        }
    }

    pub fn add_participant(&self, channel_id: Uuid, participant: Participant) {
        let channel_participants = self.participants
            .entry(channel_id)
            .or_insert_with(DashMap::new);
        
        channel_participants.insert(participant.id, participant);
    }

    pub fn remove_participant(&self, channel_id: Uuid, participant_id: Uuid) -> Option<Participant> {
        if let Some(channel_participants) = self.participants.get(&channel_id) {
            return channel_participants.remove(&participant_id).map(|(_, p)| p);
        }
        None
    }

    pub fn get_participant(&self, channel_id: Uuid, participant_id: Uuid) -> Option<Participant> {
        self.participants
            .get(&channel_id)?
            .get(&participant_id)
            .map(|p| p.clone())
    }

    pub fn get_channel_participants(&self, channel_id: Uuid) -> Vec<Participant> {
        self.participants
            .get(&channel_id)
            .map(|channel_participants| {
                channel_participants
                    .iter()
                    .map(|entry| entry.value().clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn update_participant_media_state(
        &self,
        channel_id: Uuid,
        participant_id: Uuid,
        is_audio_enabled: Option<bool>,
        is_video_enabled: Option<bool>,
    ) -> Option<Participant> {
        if let Some(channel_participants) = self.participants.get(&channel_id) {
            if let Some(mut participant) = channel_participants.get_mut(&participant_id) {
                if let Some(audio) = is_audio_enabled {
                    participant.is_audio_enabled = audio;
                }
                if let Some(video) = is_video_enabled {
                    participant.is_video_enabled = video;
                }
                return Some(participant.clone());
            }
        }
        None
    }

    pub fn get_participant_count(&self, channel_id: Uuid) -> usize {
        self.participants
            .get(&channel_id)
            .map(|channel_participants| channel_participants.len())
            .unwrap_or(0)
    }

    pub fn clear_channel(&self, channel_id: Uuid) {
        self.participants.remove(&channel_id);
    }
} 