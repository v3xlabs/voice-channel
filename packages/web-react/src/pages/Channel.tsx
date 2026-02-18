import { useParams, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Settings, Users, AlertCircle } from 'lucide-react'
import { useChannelCall } from '../hooks/useChannelCall'
import { useUser } from '../hooks/useUser'

export const Channel: React.FC = () => {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const { channelName, instanceFqdn } = params
  const groupName = (params as Record<string, unknown>).groupName as string | undefined // TODO: Update when route tree is regenerated
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const { user, isAuthenticated } = useUser()

  const {
    isInCall,
    isJoiningCall,
    isLeavingCall,
    localParticipant,
    allParticipants,
    localVideoStream,
    error,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    canJoinCall,
  } = useChannelCall({
    channelName: channelName || '',
  })

  // Set local video stream to video element
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream
    }
  }, [localVideoStream])

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full mx-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
          <p className="text-gray-400 mb-6">You need to be logged in to join voice channels.</p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold"
          >
            Go to Login
          </button>
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
            <h1 className="text-2xl font-bold">
              # {groupName && groupName !== 'admin' ? `${groupName}/` : ''}{channelName}
            </h1>
            {instanceFqdn && (
              <p className="text-sm text-gray-400">on {instanceFqdn}</p>
            )}
            {groupName && groupName !== 'admin' && (
              <p className="text-sm text-blue-400">in {groupName} group</p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {isInCall && (
              <div className="flex items-center text-sm text-gray-400">
                <Users className="w-4 h-4 mr-2" />
                <span>{allParticipants.length} in call</span>
              </div>
            )}
            
            {!isInCall ? (
              <button
                onClick={() => joinCall()}
                disabled={!canJoinCall || isJoiningCall}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>{isJoiningCall ? 'Joining...' : 'Join Call'}</span>
              </button>
            ) : (
              <button
                onClick={() => leaveCall()}
                disabled={isLeavingCall}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                <span>{isLeavingCall ? 'Leaving...' : 'Leave Call'}</span>
              </button>
            )}
            
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
            <span className="text-red-400">{typeof error === 'string' ? error : error.message}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Main Content Area */}
        <div className="flex-1 bg-gray-900">
          {isInCall ? (
            /* Voice Call Interface */
            <div className="h-full flex items-center justify-center">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 w-full max-w-6xl">
                {allParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700 relative overflow-hidden"
                  >
                    {participant.id === localParticipant?.id && participant.videoEnabled ? (
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
                      {!participant.audioEnabled && (
                        <div className="bg-red-500 rounded-full p-1">
                          <MicOff className="w-3 h-3" />
                        </div>
                      )}
                      {participant.videoEnabled && (
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
            </div>
          ) : (
            /* Text Chat Interface */
            <div className="h-full flex flex-col">
              {/* Chat Messages Area */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 mx-auto">
                      <span className="text-2xl font-semibold text-gray-400">#</span>
                    </div>
                    <h2 className="text-2xl font-semibold text-white mb-2">
                      Welcome to #{groupName && groupName !== 'admin' ? `${groupName}/` : ''}{channelName}
                    </h2>
                    <p className="text-gray-400 mb-6">
                      This is the beginning of the #{groupName && groupName !== 'admin' ? `${groupName}/` : ''}{channelName} channel.
                      {instanceFqdn && ` Hosted on ${instanceFqdn}.`}
                      {groupName && groupName !== 'admin' && ` Part of the ${groupName} group.`}
                    </p>
                    <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-blue-300 text-sm">
                        💡 Click &quot;Join Call&quot; in the header to start a voice/video conversation with others in this channel.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Message Input */}
              <div className="border-t border-gray-700 p-4">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center space-x-4">
                    <input
                      type="text"
                      placeholder={`Message #${channelName}`}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        {isInCall && allParticipants.length > 0 && (
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
                    {participant.audioEnabled ? (
                      <Mic className="w-3 h-3 text-green-400" />
                    ) : (
                      <MicOff className="w-3 h-3 text-red-400" />
                    )}
                    {participant.videoEnabled ? (
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
      {isInCall && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={toggleAudio}
              className={`p-3 rounded-full ${
                localParticipant?.audioEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } transition-colors`}
              title={localParticipant?.audioEnabled ? 'Mute' : 'Unmute'}
            >
              {localParticipant?.audioEnabled ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${
                localParticipant?.videoEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } transition-colors`}
              title={localParticipant?.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {localParticipant?.videoEnabled ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={() => leaveCall()}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              title="Leave call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 