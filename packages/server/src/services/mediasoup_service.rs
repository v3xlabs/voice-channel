use std::sync::Arc;
use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;
use tracing::{info, error, warn};

// Real mediasoup imports
use mediasoup::prelude::*;

use crate::models::webrtc::{
    RtpCapabilities as ApiRtpCapabilities, 
    TransportInfo, 
    IceParameters as ApiIceParameters, 
    DtlsParameters as ApiDtlsParameters, 
    DtlsFingerprint as ApiDtlsFingerprint,
    IceCandidate as ApiIceCandidate,
    RtpCodecCapability as ApiRtpCodecCapability,
    RtpHeaderExtension as ApiRtpHeaderExtension,
};

#[derive(Debug, Clone)]
pub struct ChannelRoom {
    pub id: Uuid,
    pub router: Router,
    pub participants: Arc<DashMap<String, ParticipantInfo>>,
}

#[derive(Debug, Clone)]
pub struct ParticipantInfo {
    pub id: String,
    pub user_id: String,
    pub display_name: String,
    pub send_transport: Option<WebRtcTransport>,
    pub recv_transport: Option<WebRtcTransport>,
    pub audio_producer: Option<Producer>,
    pub video_producer: Option<Producer>,
}

pub struct MediasoupService {
    worker_manager: WorkerManager,
    workers: Arc<RwLock<Vec<Worker>>>,
    rooms: Arc<DashMap<Uuid, ChannelRoom>>,
    worker_index: Arc<std::sync::atomic::AtomicUsize>,
    // Store transports by ID for later reference
    transports: Arc<DashMap<String, (WebRtcTransport, Uuid)>>, // transport_id -> (transport, channel_id)
    producers: Arc<DashMap<String, (Producer, Uuid)>>, // producer_id -> (producer, channel_id)
    consumers: Arc<DashMap<String, (Consumer, Uuid)>>, // consumer_id -> (consumer, channel_id)
}

impl MediasoupService {
    pub async fn new() -> Result<Self> {
        info!("Initializing real MediasoupService with worker management");
        
        let worker_manager = WorkerManager::new();
        
        // Create workers (one per CPU core, but at least 1)
        let num_workers = std::cmp::max(1, num_cpus::get());
        let mut workers = Vec::new();
        
        for i in 0..num_workers {
            let worker_settings = WorkerSettings::default();
            let worker = worker_manager
                .create_worker(worker_settings)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to create worker {}: {}", i, e))?;
            
            info!("Created mediasoup worker {} with ID {:?}", i, worker.id());
            workers.push(worker);
        }

        Ok(Self {
            worker_manager,
            workers: Arc::new(RwLock::new(workers)),
            rooms: Arc::new(DashMap::new()),
            worker_index: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            transports: Arc::new(DashMap::new()),
            producers: Arc::new(DashMap::new()),
            consumers: Arc::new(DashMap::new()),
        })
    }

    pub async fn get_or_create_room(&self, channel_id: Uuid) -> Result<ChannelRoom> {
        if let Some(room) = self.rooms.get(&channel_id) {
            return Ok(room.clone());
        }

        // Create new room with real mediasoup router
        let worker = self.get_next_worker().await?;
        
        // Create router with media codecs
        let router_options = RouterOptions::new(self.get_media_codecs());
        let router = worker
            .create_router(router_options)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create router: {}", e))?;

        let room = ChannelRoom {
            id: channel_id,
            router,
            participants: Arc::new(DashMap::new()),
        };

        self.rooms.insert(channel_id, room.clone());
        info!("Created real mediasoup room for channel {}", channel_id);

        Ok(room)
    }

    async fn get_next_worker(&self) -> Result<Worker> {
        let workers = self.workers.read().await;
        if workers.is_empty() {
            return Err(anyhow::anyhow!("No workers available"));
        }

        let index = self.worker_index
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed) % workers.len();
        
        Ok(workers[index].clone())
    }

    pub fn get_router_rtp_capabilities(&self, channel_id: Uuid) -> Result<ApiRtpCapabilities> {
        let room = self.rooms.get(&channel_id)
            .ok_or_else(|| anyhow::anyhow!("Room not found"))?;

        let capabilities = room.router.rtp_capabilities();
        
        // Convert mediasoup capabilities to API format
        let codecs = capabilities.codecs.iter().map(|codec| {
            ApiRtpCodecCapability {
                kind: match codec.kind() {
                    MediaKind::Audio => "audio".to_string(),
                    MediaKind::Video => "video".to_string(),
                },
                mime_type: codec.mime_type().to_string(),
                clock_rate: codec.clock_rate().get(),
                channels: codec.channels().map(|c| c.get()),
                parameters: serde_json::to_value(codec.parameters()).unwrap_or_default(),
            }
        }).collect();

        let header_extensions = capabilities.header_extensions.iter().map(|ext| {
            ApiRtpHeaderExtension {
                uri: format!("{:?}", ext.uri()), // Convert enum to string representation
                id: ext.preferred_id(),
            }
        }).collect();

        Ok(ApiRtpCapabilities {
            codecs,
            header_extensions,
        })
    }

    pub async fn create_webrtc_transport(
        &self,
        channel_id: Uuid,
        producing: bool,
        consuming: bool,
    ) -> Result<TransportInfo> {
        let room = self.rooms.get(&channel_id)
            .ok_or_else(|| anyhow::anyhow!("Room not found"))?;

        // Create WebRTC transport with proper listen configuration
        let listen_ips = vec![
            TransportListenIp {
                ip: "0.0.0.0".parse().unwrap(),
                announced_ip: Some("127.0.0.1".parse().unwrap()), // Use localhost for development
            }
        ];

        let webrtc_transport_options = WebRtcTransportOptions::new(
            WebRtcTransportListen::new(WebRtcTransportListenIp::Individual { listen_ips })
        );

        let transport = room.router
            .create_webrtc_transport(webrtc_transport_options)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create WebRTC transport: {}", e))?;

        // Get transport info
        let ice_parameters = transport.ice_parameters();
        let ice_candidates = transport.ice_candidates();
        let dtls_parameters = transport.dtls_parameters();

        let transport_info = TransportInfo {
            id: transport.id().to_string(),
            ice_parameters: ApiIceParameters {
                username_fragment: ice_parameters.username_fragment.clone(),
                password: ice_parameters.password.clone(),
            },
            ice_candidates: ice_candidates.iter().map(|candidate| {
                ApiIceCandidate {
                    foundation: candidate.foundation.clone(),
                    priority: candidate.priority,
                    ip: candidate.address.to_string(),
                    port: candidate.port,
                    r#type: match candidate.r#type {
                        IceCandidateType::Host => "host".to_string(),
                        // Add other types as needed
                    },
                    protocol: match candidate.protocol {
                        Protocol::Udp => "udp".to_string(),
                        Protocol::Tcp => "tcp".to_string(),
                    },
                }
            }).collect(),
            dtls_parameters: ApiDtlsParameters {
                role: match dtls_parameters.role {
                    DtlsRole::Auto => "auto".to_string(),
                    DtlsRole::Client => "client".to_string(),
                    DtlsRole::Server => "server".to_string(),
                },
                fingerprints: dtls_parameters.fingerprints.iter().map(|fp| {
                    ApiDtlsFingerprint {
                        algorithm: match fp.algorithm {
                            FingerprintAlgorithm::Sha1 => "sha-1".to_string(),
                            FingerprintAlgorithm::Sha224 => "sha-224".to_string(),
                            FingerprintAlgorithm::Sha256 => "sha-256".to_string(),
                            FingerprintAlgorithm::Sha384 => "sha-384".to_string(),
                            FingerprintAlgorithm::Sha512 => "sha-512".to_string(),
                        },
                        value: fp.value.clone(),
                    }
                }).collect(),
            },
        };

        // Store transport for later reference
        self.transports.insert(transport.id().to_string(), (transport, channel_id));

        info!("Created real WebRTC transport {} for channel {} (producing: {}, consuming: {})", 
              transport_info.id, channel_id, producing, consuming);

        Ok(transport_info)
    }

    pub async fn connect_transport(
        &self,
        transport_id: &str,
        dtls_parameters: &ApiDtlsParameters,
    ) -> Result<()> {
        let (transport, _channel_id) = self.transports.get(transport_id)
            .ok_or_else(|| anyhow::anyhow!("Transport not found: {}", transport_id))?;

        // Convert API DTLS parameters back to mediasoup format
        let dtls_params = DtlsParameters {
            role: match dtls_parameters.role.as_str() {
                "auto" => DtlsRole::Auto,
                "client" => DtlsRole::Client,
                "server" => DtlsRole::Server,
                _ => DtlsRole::Auto,
            },
            fingerprints: dtls_parameters.fingerprints.iter().map(|fp| {
                DtlsFingerprint {
                    algorithm: match fp.algorithm.as_str() {
                        "sha-1" => FingerprintAlgorithm::Sha1,
                        "sha-224" => FingerprintAlgorithm::Sha224,
                        "sha-256" => FingerprintAlgorithm::Sha256,
                        "sha-384" => FingerprintAlgorithm::Sha384,
                        "sha-512" => FingerprintAlgorithm::Sha512,
                        _ => FingerprintAlgorithm::Sha256,
                    },
                    value: fp.value.clone(),
                }
            }).collect(),
        };

        transport.connect(dtls_params).await
            .map_err(|e| anyhow::anyhow!("Failed to connect transport: {}", e))?;

        info!("Connected transport {}", transport_id);
        Ok(())
    }

    pub async fn produce(
        &self,
        transport_id: &str,
        kind: &str,
        rtp_parameters: serde_json::Value,
    ) -> Result<String> {
        let (transport, channel_id) = self.transports.get(transport_id)
            .ok_or_else(|| anyhow::anyhow!("Transport not found: {}", transport_id))?;

        // Convert RTP parameters from JSON
        let rtp_params: RtpParameters = serde_json::from_value(rtp_parameters)
            .map_err(|e| anyhow::anyhow!("Invalid RTP parameters: {}", e))?;

        let media_kind = match kind {
            "audio" => MediaKind::Audio,
            "video" => MediaKind::Video,
            _ => return Err(anyhow::anyhow!("Invalid media kind: {}", kind)),
        };

        let producer_options = ProducerOptions::new(media_kind, rtp_params);

        let producer = transport.produce(producer_options).await
            .map_err(|e| anyhow::anyhow!("Failed to create producer: {}", e))?;

        let producer_id = producer.id().to_string();
        
        // Store producer for later reference
        self.producers.insert(producer_id.clone(), (producer, *channel_id));

        info!("Created real producer {} for {} on transport {}", producer_id, kind, transport_id);
        Ok(producer_id)
    }

    pub async fn consume(
        &self,
        transport_id: &str,
        producer_id: &str,
        rtp_capabilities: &ApiRtpCapabilities,
    ) -> Result<(String, String, serde_json::Value)> {
        let (transport, _channel_id) = self.transports.get(transport_id)
            .ok_or_else(|| anyhow::anyhow!("Transport not found: {}", transport_id))?;

        let (producer, _) = self.producers.get(producer_id)
            .ok_or_else(|| anyhow::anyhow!("Producer not found: {}", producer_id))?;

        // Convert API RTP capabilities to mediasoup format
        // This is a simplified conversion - in production you'd want more robust conversion
        let consumer_options = ConsumerOptions::new(
            producer.id(),
            // For now, we'll use the router's capabilities as the consumer capabilities
            // In a real implementation, you'd convert the client's capabilities properly
        );

        let consumer = transport.consume(consumer_options).await
            .map_err(|e| anyhow::anyhow!("Failed to create consumer: {}", e))?;

        let consumer_id = consumer.id().to_string();
        let kind = match consumer.kind() {
            MediaKind::Audio => "audio".to_string(),
            MediaKind::Video => "video".to_string(),
        };

        // Get RTP parameters for the consumer
        let rtp_parameters = serde_json::to_value(consumer.rtp_parameters())
            .unwrap_or_default();

        // Store consumer for later reference
        self.consumers.insert(consumer_id.clone(), (consumer, *_channel_id));

        info!("Created real consumer {} for producer {} on transport {}", consumer_id, producer_id, transport_id);
        
        Ok((consumer_id, kind, rtp_parameters))
    }

    fn get_media_codecs(&self) -> Vec<RtpCodecCapability> {
        vec![
            // Audio codecs
            RtpCodecCapability::Audio {
                mime_type: MimeTypeAudio::Opus,
                preferred_payload_type: None,
                clock_rate: std::num::NonZeroU32::new(48000).unwrap(),
                channels: std::num::NonZeroU8::new(2).unwrap(),
                parameters: RtpCodecParametersParameters::from([
                    ("sprop-stereo".to_string(), "1".into()),
                ]),
                rtcp_feedback: vec![],
            },
            // Video codecs
            RtpCodecCapability::Video {
                mime_type: MimeTypeVideo::Vp8,
                preferred_payload_type: None,
                clock_rate: std::num::NonZeroU32::new(90000).unwrap(),
                parameters: RtpCodecParametersParameters::default(),
                rtcp_feedback: vec![
                    RtcpFeedback::Nack,
                    RtcpFeedback::NackPli,
                    RtcpFeedback::GoogRemb,
                ],
            },
            RtpCodecCapability::Video {
                mime_type: MimeTypeVideo::H264,
                preferred_payload_type: None,
                clock_rate: std::num::NonZeroU32::new(90000).unwrap(),
                parameters: RtpCodecParametersParameters::from([
                    ("profile-level-id".to_string(), "42e01f".into()),
                    ("level-asymmetry-allowed".to_string(), "1".into()),
                    ("packetization-mode".to_string(), "1".into()),
                ]),
                rtcp_feedback: vec![
                    RtcpFeedback::Nack,
                    RtcpFeedback::NackPli,
                    RtcpFeedback::GoogRemb,
                ],
            },
        ]
    }

    pub async fn close_room(&self, channel_id: Uuid) -> Result<()> {
        if let Some((_, room)) = self.rooms.remove(&channel_id) {
            // Clean up participants
            room.participants.clear();
            
            // Clean up transports, producers, and consumers for this channel
            self.transports.retain(|_, (_, ch_id)| *ch_id != channel_id);
            self.producers.retain(|_, (_, ch_id)| *ch_id != channel_id);
            self.consumers.retain(|_, (_, ch_id)| *ch_id != channel_id);
            
            // Router will be closed automatically when dropped
            info!("Closed real mediasoup room for channel {}", channel_id);
        }
        Ok(())
    }
}

// Add rand dependency for generating random values
// We'll add this to Cargo.toml 