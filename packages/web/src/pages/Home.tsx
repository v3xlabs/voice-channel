import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Users, Clock } from 'lucide-react'
import { channelApi, Channel } from '../services/api'

export const Home: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newChannel, setNewChannel] = useState({
    name: '',
    description: '',
    max_participants: 50
  })

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      const channelList = await channelApi.list()
      setChannels(channelList)
    } catch (error) {
      console.error('Failed to load channels:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await channelApi.create(newChannel)
      setNewChannel({ name: '', description: '', max_participants: 50 })
      setShowCreateForm(false)
      loadChannels()
    } catch (error) {
      console.error('Failed to create channel:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Voice Channels</h1>
          <p className="text-gray-400 mt-2">Join or create voice channels to communicate with others</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Create Channel</span>
        </button>
      </div>

      {/* Create Channel Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Channel</h2>
            <form onSubmit={handleCreateChannel}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Channel Name</label>
                <input
                  type="text"
                  required
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500"
                  placeholder="Enter channel name"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <textarea
                  value={newChannel.description}
                  onChange={(e) => setNewChannel({ ...newChannel, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500"
                  placeholder="Describe your channel"
                  rows={3}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Max Participants</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newChannel.max_participants}
                  onChange={(e) => setNewChannel({ ...newChannel, max_participants: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((channel) => (
          <Link
            key={channel.id}
            to={`/${channel.name}`}
            className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-primary-500 transition-colors group"
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold group-hover:text-primary-400 transition-colors">
                {channel.name}
              </h3>
              <div className="flex items-center text-sm text-gray-400">
                <Users className="w-4 h-4 mr-1" />
                <span>{channel.current_participants}/{channel.max_participants}</span>
              </div>
            </div>
            
            {channel.description && (
              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {channel.description}
              </p>
            )}
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                <span>Created {formatDate(channel.created_at)}</span>
              </div>
              <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                {channel.instance_fqdn}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {channels.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-xl">No channels yet</p>
            <p className="text-sm">Create the first channel to get started</p>
          </div>
        </div>
      )}
    </div>
  )
} 