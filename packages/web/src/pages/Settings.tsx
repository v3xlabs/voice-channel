import { FC, useState, useEffect } from 'react';
import { User, Settings as SettingsIcon, LogOut, Shield } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import classnames from 'classnames';
import { useUser } from '../hooks/useUser';
import { useAuth } from '../hooks/useAuth';

export const Settings: FC = () => {
  const { user, isLoading, updateUser, isUpdatingUser } = useUser();
  const { logout } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user || !displayName.trim()) return;

    setSaveMessage('');

    try {
      updateUser({
        display_name: displayName.trim()
      });
      
      setSaveMessage('Profile updated successfully!');
      
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to update profile:', error);
      setSaveMessage('Failed to update profile. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full mx-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
          <p className="text-gray-400 mb-6">You need to be logged in to access settings.</p>
          <Link
            to="/"
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <SettingsIcon className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Settings</h1>
            </div>
            <Link
              to="/"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <nav className="space-y-2">
              <div className="bg-gray-800 rounded-lg p-2">
                <div className="flex items-center space-x-3 px-3 py-2 bg-blue-600 rounded-lg">
                  <User className="w-4 h-4" />
                  <span className="text-sm font-medium">Profile</span>
                </div>
              </div>
              
              {user.is_admin && (
                <div className="bg-gray-800 rounded-lg p-2">
                  <a
                    href="/admin"
                    className="flex items-center space-x-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">Admin Panel</span>
                  </a>
                </div>
              )}
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 rounded-lg p-6">
              {/* Profile Section */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-6 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Profile Settings
                </h2>

                <div className="space-y-6">
                  {/* User Avatar */}
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-xl font-semibold">
                        {user.display_name?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium">{user.display_name}</h3>
                      <p className="text-sm text-gray-400">@{user.username}</p>
                      {user.is_admin && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-200 mt-1">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Display Name */}
                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your display name"
                    />
                  </div>

                  {/* Username (read-only) */}
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      id="username"
                      value={user.username}
                      disabled
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
                  </div>

                  {/* Instance */}
                  <div>
                    <label htmlFor="instance" className="block text-sm font-medium mb-2">
                      Instance
                    </label>
                    <input
                      type="text"
                      id="instance"
                      value={user.instance_fqdn}
                      disabled
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleSaveProfile}
                      disabled={isUpdatingUser || displayName.trim() === user.display_name}
                      className={classnames(
                        'px-4 py-2 rounded-lg font-medium transition-colors',
                        {
                          'bg-blue-600 hover:bg-blue-700 text-white': 
                            !isUpdatingUser && displayName.trim() !== user.display_name,
                          'bg-gray-600 text-gray-400 cursor-not-allowed': 
                            isUpdatingUser || displayName.trim() === user.display_name,
                        }
                      )}
                    >
                      {isUpdatingUser ? 'Saving...' : 'Save Changes'}
                    </button>

                    {saveMessage && (
                      <span className={classnames(
                        'text-sm',
                        {
                          'text-green-400': saveMessage.includes('successfully'),
                          'text-red-400': saveMessage.includes('Failed'),
                        }
                      )}>
                        {saveMessage}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Account Actions */}
              <div className="border-t border-gray-700 pt-8">
                <h2 className="text-xl font-semibold mb-6">Account Actions</h2>
                
                <div className="space-y-4">
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 