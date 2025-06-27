import { FC, useState, useEffect } from 'react';
import { channelApi } from '../services/api';
import { authService } from '../services/auth';
import type { components } from '../types/api';

type Channel = components['schemas']['Channel'];

export const ChannelDiscovery: FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinedChannels, setJoinedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadChannels();
    loadUserChannels();
  }, []);

  const loadChannels = async () => {
    try {
      const channelList = await channelApi.list();
      setChannels(channelList);
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserChannels = async () => {
    try {
      const userChannels = await authService.getUserChannels();
      const joinedSet = new Set(
        userChannels.map(ch => `${ch.membership.channel_instance_fqdn}:${ch.membership.channel_name}`)
      );
      setJoinedChannels(joinedSet);
    } catch (error) {
      console.error('Failed to load user channels:', error);
    }
  };

  const handleJoinChannel = async (channel: Channel) => {
    try {
      await authService.joinChannel(channel.instance_fqdn, channel.name);
      await loadUserChannels(); // Refresh joined channels
      
      // Also refresh the sidebar channels list
      if ((window as any).refreshUserChannels) {
        await (window as any).refreshUserChannels();
      }
    } catch (error) {
      console.error('Failed to join channel:', error);
    }
  };

  const isChannelJoined = (channel: Channel) => {
    return joinedChannels.has(`${channel.instance_fqdn}:${channel.name}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Discover Channels</h1>
        <p className="text-gray-400">Find and join voice channels to start talking with others.</p>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No channels available</h3>
          <p className="text-gray-400 mb-4">There are no channels to discover right now.</p>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            Create a Channel
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isJoined={isChannelJoined(channel)}
              onJoin={() => handleJoinChannel(channel)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ChannelCardProps {
  channel: Channel;
  isJoined: boolean;
  onJoin: () => void;
}

const ChannelCard: FC<ChannelCardProps> = ({ channel, isJoined, onJoin }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold text-lg">#</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{channel.name}</h3>
            <p className="text-sm text-gray-400">{channel.instance_fqdn}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <span>{channel.current_participants}</span>
          <span>/</span>
          <span>{channel.max_participants}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
      </div>

      {channel.description && (
        <p className="text-gray-300 text-sm mb-4 line-clamp-2">{channel.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Created {new Date(channel.created_at).toLocaleDateString()}
        </div>
        
        {isJoined ? (
          <span className="px-3 py-1 bg-green-600 text-green-100 text-sm rounded-full">
            Joined
          </span>
        ) : (
          <button
            onClick={onJoin}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Join Channel
          </button>
        )}
      </div>
    </div>
  );
}; 