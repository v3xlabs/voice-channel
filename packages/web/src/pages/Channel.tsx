import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Settings, Users } from 'lucide-react'

export const Channel: React.FC = () => {
  const { channelName, instanceFqdn } = useParams()
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [participants, setParticipants] = useState<string[]>([])

  useEffect(() => {
    // TODO: Implement WebRTC connection logic
    console.log('Connecting to channel:', channelName, 'on instance:', instanceFqdn || 'local')
  }, [channelName, instanceFqdn])

  const handleConnect = () => {
    setIsConnected(!isConnected)
    if (!isConnected) {
      // TODO: Join channel
      setParticipants(['You'])
    } else {
      // TODO: Leave channel
      setParticipants([])
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    // TODO: Implement mute/unmute logic
  }

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn)
    // TODO: Implement video on/off logic
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
              <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
            </div>
            <button className="text-gray-400 hover:text-white">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Grid */}
        <div className="flex-1 bg-gray-900 flex items-center justify-center">
          {isConnected ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 w-full max-w-6xl">
              {participants.map((participant, index) => (
                <div
                  key={index}
                  className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mb-2 mx-auto">
                      <span className="text-white font-semibold">
                        {participant.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{participant}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6 mx-auto">
                <Phone className="w-12 h-12 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Ready to join?</h2>
              <p className="text-gray-400 mb-6">Click the connect button to join the voice channel</p>
              <button
                onClick={handleConnect}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold"
              >
                Connect to Channel
              </button>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        {isConnected && (
          <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="font-semibold mb-4 flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Participants ({participants.length})
            </h3>
            <div className="space-y-2">
              {participants.map((participant, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-700"
                >
                  <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {participant.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm">{participant}</span>
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
              onClick={toggleMute}
              className={`p-3 rounded-full ${
                isMuted 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-gray-700 hover:bg-gray-600'
              } transition-colors`}
            >
              {isMuted ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${
                isVideoOn 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } transition-colors`}
            >
              {isVideoOn ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={handleConnect}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 