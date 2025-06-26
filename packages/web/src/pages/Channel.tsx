import { useParams } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Settings, Users, AlertCircle } from 'lucide-react'
import { useWebRTC } from '../hooks/useWebRTC'

export const Channel: React.FC = () => {
  const { channelName, instanceFqdn } = useParams({ strict: false })
  const [userName, setUserName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(true)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  // Generate a unique user ID for this session
  const userId = useRef(Math.random().toString(36).substring(2, 15)).current

  const {
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
  } = useWebRTC({
    channelId: channelName || '',
    userId,
    displayName: userName,
  })

  // Set local video stream to video element
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream
    }
  }, [localVideoStream])

  const handleJoin = async () => {
    if (!userName.trim()) return
    setShowNamePrompt(false)
    await connect()
  }

  const handleLeave = async () => {
    await disconnect()
    setShowNamePrompt(true)
    setUserName('')
  }

  const allParticipants = localParticipant ? [localParticipant, ...participants] : participants

  if (showNamePrompt) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-2">Join #{channelName}</h2>
          {instanceFqdn && (
            <p className="text-sm text-gray-400 mb-6">on {instanceFqdn}</p>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2">
                Your name
              </label>
              <input
                id="name"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="Enter your display name"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!userName.trim() || isConnecting}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-semibold"
            >
              {isConnecting ? 'Joining...' : 'Join Channel'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Channel Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold"># {channelName}</h1>
            {instanceFqdn && (
              <p className="text-sm text-gray-400">on {instanceFqdn}</p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-400">
              <Users className="w-4 h-4 mr-2" />
              <span>{allParticipants.length} participant{allParticipants.length !== 1 ? 's' : ''}</span>
            </div>
            <button className="text-gray-400 hover:text-white">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 px-4 py-3 mx-6 mt-4 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
            <span className="text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Grid */}
        <div className="flex-1 bg-gray-900 flex items-center justify-center">
          {isConnected ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 w-full max-w-6xl">
              {allParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700 relative overflow-hidden"
                >
                  {participant.id === localParticipant?.id && participant.isVideoEnabled ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-2 mx-auto">
                        <span className="text-white font-semibold">
                          {participant.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{participant.displayName}</p>
                      {participant.id === localParticipant?.id && (
                        <p className="text-xs text-gray-500">(You)</p>
                      )}
                    </div>
                  )}
                  
                  {/* Audio/Video indicators */}
                  <div className="absolute bottom-2 left-2 flex space-x-1">
                    {!participant.isAudioEnabled && (
                      <div className="bg-red-500 rounded-full p-1">
                        <MicOff className="w-3 h-3" />
                      </div>
                    )}
                    {participant.isVideoEnabled && (
                      <div className="bg-green-500 rounded-full p-1">
                        <Video className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Empty slots for additional participants */}
              {Array.from({ length: Math.max(0, 6 - allParticipants.length) }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="aspect-video bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center"
                >
                  <p className="text-gray-500 text-sm">Waiting for participants...</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6 mx-auto">
                <Phone className="w-12 h-12 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Connection lost</h2>
              <p className="text-gray-400 mb-6">Click reconnect to rejoin the voice channel</p>
              <button
                onClick={connect}
                disabled={isConnecting}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold"
              >
                {isConnecting ? 'Connecting...' : 'Reconnect'}
              </button>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        {isConnected && allParticipants.length > 0 && (
          <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="font-semibold mb-4 flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Participants ({allParticipants.length})
            </h3>
            <div className="space-y-2">
              {allParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-700"
                >
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {participant.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm">
                      {participant.displayName}
                      {participant.id === localParticipant?.id && ' (You)'}
                    </span>
                  </div>
                  <div className="flex space-x-1">
                    {participant.isAudioEnabled ? (
                      <Mic className="w-3 h-3 text-green-400" />
                    ) : (
                      <MicOff className="w-3 h-3 text-red-400" />
                    )}
                    {participant.isVideoEnabled ? (
                      <Video className="w-3 h-3 text-green-400" />
                    ) : (
                      <VideoOff className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isConnected && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={toggleAudio}
              className={`p-3 rounded-full ${
                localParticipant?.isAudioEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } transition-colors`}
              title={localParticipant?.isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {localParticipant?.isAudioEnabled ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${
                localParticipant?.isVideoEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } transition-colors`}
              title={localParticipant?.isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {localParticipant?.isVideoEnabled ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={handleLeave}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              title="Leave channel"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 