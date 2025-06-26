use std::sync::Arc;
use anyhow::Result;
use dashmap::DashMap;
use uuid::Uuid;
use tracing::info;
use crate::models::webrtc::*;
use crate::models::participant::Participant;

#[derive(Clone, Debug)]
pub struct ChannelRoom {
    pub id: Uuid,
    pub participants: Arc<DashMap<String, Participant>>,
}

// Simulated MediasoupService for development
pub struct MediasoupService {
    rooms: Arc<DashMap<Uuid, ChannelRoom>>,
    // Store mock data for simulation
    transports: Arc<DashMap<String, (String, Uuid)>>, // transport_id -> (mock_data, channel_id)
    producers: Arc<DashMap<String, (String, Uuid)>>, // producer_id -> (mock_data, channel_id)
    consumers: Arc<DashMap<String, (String, Uuid)>>, // consumer_id -> (mock_data, channel_id)
}

impl MediasoupService {
    pub async fn new() -> Result<Self> {
        info!("Initializing MediasoupService with simulation implementation");

        Ok(Self {
            rooms: Arc::new(DashMap::new()),
            transports: Arc::new(DashMap::new()),
            producers: Arc::new(DashMap::new()),
            consumers: Arc::new(DashMap::new()),
        })
    }

    pub async fn get_or_create_room(&self, channel_id: Uuid) -> Result<ChannelRoom> {
        if let Some(room) = self.rooms.get(&channel_id) {
            return Ok(room.clone());
        }

        let room = ChannelRoom {
            id: channel_id,
            participants: Arc::new(DashMap::new()),
        };

        self.rooms.insert(channel_id, room.clone());
        info!("Created simulated room for channel {}", channel_id);

        Ok(room)
    }

    pub fn get_router_rtp_capabilities(&self, _channel_id: Uuid) -> Result<RtpCapabilities> {
        // Return mock RTP capabilities for simulation
        let codecs = vec![
            RtpCodecCapability {
                kind: "audio".to_string(),
                mime_type: "audio/opus".to_string(),
                clock_rate: 48000,
                channels: Some(2),
                parameters: serde_json::json!({
                    "minptime": 10,
                    "useinbandfec": 1
                }),
            },
            RtpCodecCapability {
                kind: "video".to_string(),
                mime_type: "video/VP8".to_string(),
                clock_rate: 90000,
                channels: None,
                parameters: serde_json::json!({}),
            },
        ];

        let header_extensions = vec![
            RtpHeaderExtension {
                uri: "urn:ietf:params:rtp-hdrext:sdes:mid".to_string(),
                id: 1,
            },
            RtpHeaderExtension {
                uri: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id".to_string(),
                id: 2,
            },
        ];

        Ok(RtpCapabilities {
            codecs,
            header_extensions,
        })
    }

    pub async fn create_webrtc_transport(
        &self,
        channel_id: Uuid,
        _producing: bool,
        _consuming: bool,
    ) -> Result<TransportInfo> {
        // Generate mock transport ID
        let transport_id = Uuid::new_v4().to_string();

        // Store mock transport data
        self.transports.insert(transport_id.clone(), ("mock_transport".to_string(), channel_id));
        
        // Return mock transport info
        let transport_info = TransportInfo {
            id: transport_id,
            ice_parameters: IceParameters {
                username_fragment: format!("sim{}", &Uuid::new_v4().to_string()[..8]),
                password: Uuid::new_v4().to_string(),
            },
            ice_candidates: vec![
                IceCandidate {
                    foundation: "1".to_string(),
                    priority: 2113667326,
                    ip: "127.0.0.1".to_string(),
                    port: 19302,
                    r#type: "host".to_string(),
                    protocol: "udp".to_string(),
                }
            ],
            dtls_parameters: DtlsParameters {
                role: "auto".to_string(),
                fingerprints: vec![
                    DtlsFingerprint {
                        algorithm: "sha-256".to_string(),
                        value: "E7:8A:84:3D:25:BC:55:1F:2C:65:32:FA:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78".to_string(),
                    }
                ],
            },
        };

        info!("Created simulated WebRTC transport {} for channel {}", transport_info.id, channel_id);
        Ok(transport_info)
    }

    pub async fn connect_transport(
        &self,
        transport_id: &str,
        _dtls_parameters: &DtlsParameters,
    ) -> Result<()> {
        if !self.transports.contains_key(transport_id) {
            return Err(anyhow::anyhow!("Transport not found: {}", transport_id));
        }

        info!("Simulated transport connect for transport {}", transport_id);
        Ok(())
    }

    pub async fn create_producer(
        &self,
        transport_id: &str,
        kind: &str,
        _rtp_parameters: serde_json::Value,
    ) -> Result<String> {
        let transport_entry = self.transports.get(transport_id)
            .ok_or_else(|| anyhow::anyhow!("Transport not found: {}", transport_id))?;
        let channel_id = transport_entry.1;

        // Generate mock producer ID
        let producer_id = Uuid::new_v4().to_string();
        
        // Store mock producer data
        self.producers.insert(producer_id.clone(), (format!("mock_producer_{}", kind), channel_id));

        info!("Created simulated producer {} for {} on transport {}", producer_id, kind, transport_id);
        Ok(producer_id)
    }

    pub async fn create_consumer(
        &self,
        transport_id: &str,
        producer_id: &str,
        _rtp_capabilities: &RtpCapabilities,
    ) -> Result<ConsumeResponse> {
        let transport_entry = self.transports.get(transport_id)
            .ok_or_else(|| anyhow::anyhow!("Transport not found: {}", transport_id))?;
        let channel_id = transport_entry.1;

        let _producer_entry = self.producers.get(producer_id)
            .ok_or_else(|| anyhow::anyhow!("Producer not found: {}", producer_id))?;

        // Generate mock consumer ID
        let consumer_id = Uuid::new_v4().to_string();

        // Store mock consumer data
        self.consumers.insert(consumer_id.clone(), (format!("mock_consumer_for_{}", producer_id), channel_id));

        // Mock RTP parameters
        let rtp_parameters = serde_json::json!({
            "codecs": [{
                "mimeType": "audio/opus",
                "clockRate": 48000,
                "channels": 2,
                "payloadType": 111
            }],
            "headerExtensions": [],
            "encodings": [{"ssrc": 123456789}]
        });

        info!("Created simulated consumer {} for producer {} on transport {}", consumer_id, producer_id, transport_id);
        Ok(ConsumeResponse {
            consumer_id,
            producer_id: producer_id.to_string(),
            kind: "audio".to_string(),
            rtp_parameters,
        })
    }

    pub async fn close_room(&self, channel_id: Uuid) -> Result<()> {
        if let Some((_key, _room)) = self.rooms.remove(&channel_id) {
            info!("Closed simulated room for channel {}", channel_id);
        }
        Ok(())
    }
} 