import { FC, ReactNode, useEffect, useState } from 'react';
import { authService, type User, type ChannelWithMembership } from '../services/auth';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<ChannelWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);
      
      // Auto-login (create temp account if needed)
      const authResult = await authService.autoLogin();
      setUser(authResult.user);

      // Load user's joined channels
      const userChannels = await authService.getUserChannels();
      setChannels(userChannels);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinChannel = async (instanceFqdn: string, channelName: string) => {
    try {
      await authService.joinChannel(instanceFqdn, channelName);
      // Refresh channels list
      const userChannels = await authService.getUserChannels();
      setChannels(userChannels);
    } catch (error) {
      console.error('Failed to join channel:', error);
    }
  };

  const handleLeaveChannel = async (instanceFqdn: string, channelName: string) => {
    try {
      await authService.leaveChannel(instanceFqdn, channelName);
      // Refresh channels list
      const userChannels = await authService.getUserChannels();
      setChannels(userChannels);
    } catch (error) {
      console.error('Failed to leave channel:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* User Profile Section */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold">
                {user?.display_name?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.display_name || 'Anonymous'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {user?.username || 'guest'}
              </p>
              {user?.is_temporary && (
                <span className="inline-block px-2 py-1 text-xs bg-yellow-600 text-yellow-100 rounded mt-1">
                  Temporary
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Channels
              </h3>
              <button 
                onClick={() => handleJoinChannel('localhost:3001', 'general')}
                className="text-gray-400 hover:text-white text-sm"
                title="Join a channel"
              >
                +
              </button>
            </div>
            
            {channels.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">No channels joined</p>
                <p className="text-xs mt-1">Click + to join a channel</p>
              </div>
            ) : (
              <div className="space-y-1">
                {channels.map((channelWithMembership) => (
                  <ChannelItem
                    key={`${channelWithMembership.membership.channel_instance_fqdn}-${channelWithMembership.membership.channel_name}`}
                    channelWithMembership={channelWithMembership}
                    onLeave={handleLeaveChannel}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-gray-700">
          <div className="space-y-2">
            <button
              onClick={() => handleJoinChannel('localhost:3001', 'general')}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
            >
              Join #general
            </button>
            <button
              onClick={() => handleJoinChannel('v3x.vc', 'community')}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
            >
              Join v3x.vc#community
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
};

interface ChannelItemProps {
  channelWithMembership: ChannelWithMembership;
  onLeave: (instanceFqdn: string, channelName: string) => void;
}

const ChannelItem: FC<ChannelItemProps> = ({ channelWithMembership, onLeave }) => {
  const { membership, channel, is_local } = channelWithMembership;
  
  const displayName = channel?.name || membership.channel_name;
  const instanceDisplay = is_local ? '' : `${membership.channel_instance_fqdn}/`;
  
  return (
    <div className="group flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <span className="text-gray-400">#</span>
        <span className="text-sm text-white truncate">
          {instanceDisplay}{displayName}
        </span>
        {!is_local && (
          <span className="text-xs text-blue-400 bg-blue-900 px-1 rounded">
            remote
          </span>
        )}
      </div>
      
      <button
        onClick={() => onLeave(membership.channel_instance_fqdn, membership.channel_name)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 text-xs transition-opacity"
        title="Leave channel"
      >
        ×
      </button>
    </div>
  );
}; 