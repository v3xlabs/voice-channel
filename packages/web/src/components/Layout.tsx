import { FC, ReactNode, useEffect, useState } from 'react';
import { authService, type User, type ChannelWithMembership } from '../services/auth';
import { LoginForm } from './LoginForm';
import { Link } from '@tanstack/react-router';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<ChannelWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  // Expose refresh function globally for other components to use
  useEffect(() => {
    (window as any).refreshUserChannels = loadUserChannels;
    return () => {
      delete (window as any).refreshUserChannels;
    };
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      
      // Check if user is already logged in
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        await loadUserChannels();
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserChannels = async () => {
    try {
      const userChannels = await authService.getUserChannels();
      setChannels(userChannels);
    } catch (error) {
      console.error('Failed to load user channels:', error);
    }
  };

  const handleLoginSuccess = async () => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setIsAuthenticated(true);
      await loadUserChannels();
    }
  };

  const handleJoinChannel = async (instanceFqdn: string, channelName: string) => {
    try {
      await authService.joinChannel(instanceFqdn, channelName);
      await loadUserChannels(); // Refresh channels list
    } catch (error) {
      console.error('Failed to join channel:', error);
    }
  };

  const handleLeaveChannel = async (instanceFqdn: string, channelName: string) => {
    try {
      await authService.leaveChannel(instanceFqdn, channelName);
      await loadUserChannels(); // Refresh channels list
    } catch (error) {
      console.error('Failed to leave channel:', error);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setChannels([]);
    setIsAuthenticated(false);
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

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Instance Header */}
        <div className="p-2 border-b border-gray-700">
          <Link
            to="/"
            className="block hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
          >
            <h1 className="text-lg font-bold text-white">voice.channel</h1>
            <p className="text-xs text-gray-400">internal</p>
          </Link>
        </div>

        {/* Navigation */}
        <div className="p-2 border-b border-gray-700">
          <div className="space-y-2">
            <Link
              to="/"
              className="flex items-center w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
            >
              <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discover
            </Link>
          </div>
        </div>

        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Channels
              </h3>
            </div>
            
            {channels.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">No channels joined</p>
                <p className="text-xs mt-1">Discover channels to join</p>
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

        {/* User Profile Section */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold">
                {user?.display_name?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium text-white truncate">
                  {user?.display_name || 'Anonymous'}
                </p>
                {user?.is_admin && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-200">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 truncate">
                {user?.username || 'guest'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white text-xs"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
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
  
  // Build the channel URL
  const channelUrl = is_local 
    ? `/${membership.channel_name}`
    : `/${membership.channel_instance_fqdn}/${membership.channel_name}`;
  
  return (
    <div className="group flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700">
      <Link
        to={channelUrl}
        className="flex items-center space-x-2 flex-1 min-w-0 text-left"
      >
        <span className="text-gray-400">#</span>
        <span className="text-sm text-white truncate hover:text-blue-300 transition-colors">
          {displayName}
        </span>
        {!is_local && (
          <span className="text-xs text-blue-400 bg-blue-900 px-1 rounded">
            remote
          </span>
        )}
      </Link>
      
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