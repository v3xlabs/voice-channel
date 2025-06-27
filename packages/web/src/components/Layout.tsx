import { FC, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useUser } from '../hooks/useUser';
import { useChannels } from '../hooks/useChannels';
import { LoginForm } from './LoginForm';
import type { ChannelWithMembership } from '../services/auth';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const { user, isLoading: userLoading, isAuthenticated } = useUser();
  const { 
    channels, 
    isLoading: channelsLoading, 
    leaveChannel 
  } = useChannels();

  const isLoading = userLoading || (isAuthenticated && channelsLoading);

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
    return <LoginForm />;
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
        
        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide p-2">
                Channels
              </h3>
            </div>
            
            {channels.length === 0 ? (
              <div className="text-gray-500 px-2 space-y-1">
                <p className="text-xs">No channels joined</p>
                <p className="text-xs">Discover channels to join</p>
              </div>
            ) : (
              <div className="space-y-1">
                {channels.map((channelWithMembership) => (
                  <ChannelItem
                    key={`${channelWithMembership.membership.channel_instance_fqdn}-${channelWithMembership.membership.channel_name}`}
                    channelWithMembership={channelWithMembership}
                    onLeave={(instanceFqdn, channelName) => leaveChannel({ instanceFqdn, channelName })}
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
            <a
              href="/settings"
              className="text-gray-400 hover:text-white text-xs"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
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
  
  // Build the channel URL with group support
  // TODO: Update when backend provides group information
  const groupName = 'admin'; // Default to admin group for now
  const isAdminGroup = groupName === 'admin';
  
  let channelUrl: string;
  if (is_local) {
    channelUrl = isAdminGroup ? `/${membership.channel_name}` : `/${groupName}/${membership.channel_name}`;
  } else {
    channelUrl = isAdminGroup 
      ? `/${membership.channel_instance_fqdn}/${membership.channel_name}`
      : `/${membership.channel_instance_fqdn}/${groupName}/${membership.channel_name}`;
  }
  
  // Channel display name with group context
  const fullDisplayName = isAdminGroup || is_local 
    ? displayName 
    : `${groupName}/${displayName}`;
  
  return (
    <div className="group flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700">
      <a
        href={channelUrl}
        className="flex items-center space-x-2 flex-1 min-w-0 text-left hover:text-blue-300 transition-colors"
      >
        <span className="text-gray-400">#</span>
        <span className="text-sm text-white truncate">
          {fullDisplayName}
        </span>
        {!is_local && (
          <span className="text-xs text-blue-400 bg-blue-900 px-1 rounded">
            remote
          </span>
        )}
      </a>
      
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