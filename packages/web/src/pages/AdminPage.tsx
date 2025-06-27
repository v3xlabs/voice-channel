import { FC, useEffect, useState } from 'react';
import { Shield, Users, Settings, UserPlus, Layers, ArrowLeft } from 'lucide-react';
import { authService, type InstanceSettings } from '../services/auth';
import classnames from 'classnames';

interface TabProps {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabProps[] = [
  { id: 'overview', title: 'Overview', icon: Shield },
  { id: 'users', title: 'Users & Permissions', icon: Users },
  { id: 'groups', title: 'Groups', icon: Layers },
  { id: 'instance', title: 'Instance Settings', icon: Settings },
  { id: 'invitations', title: 'Invitations', icon: UserPlus },
];

export const AdminPage: FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [settings, setSettings] = useState<InstanceSettings | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [settingsData, statusData] = await Promise.all([
        authService.getInstanceSettings(),
        authService.getRegistrationStatus(),
        // TODO: Add API calls for users and groups when endpoints are available
        // fetch('/api/admin/users-permissions'),
        // fetch('/api/groups'),
      ]);

      setSettings(settingsData);
      setRegistrationStatus(statusData);
      
      // Mock data for now
      setUsers([]);
      setGroups([]);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      setError('Failed to load admin data. Make sure you have admin permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!authService.isAdmin()) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400">You need admin permissions to access this page.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={loadAdminData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-gray-400">Manage your voice channel instance</p>
        </div>

        {/* Instance Settings */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Instance Settings</h2>
            {settings && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-300">Instance Name</label>
                  <p className="text-white">{settings.instance_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">FQDN</label>
                  <p className="text-white">{settings.instance_fqdn}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Registration Mode</label>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    settings.registration_mode === 'open' 
                      ? 'bg-green-900 text-green-200' 
                      : 'bg-yellow-900 text-yellow-200'
                  }`}>
                    {settings.registration_mode}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Invitation Permission</label>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-900 text-blue-200">
                    {settings.invite_permission}
                  </span>
                </div>
                {settings.instance_description && (
                  <div>
                    <label className="text-sm font-medium text-gray-300">Description</label>
                    <p className="text-white">{settings.instance_description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Registration Status */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Registration Status</h2>
            {registrationStatus && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-300">Registration Open</label>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      registrationStatus.registration_open ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-white">
                      {registrationStatus.registration_open ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Current Mode</label>
                  <p className="text-white">{registrationStatus.registration_mode}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Invite Permission</label>
                  <p className="text-white">{registrationStatus.invite_permission}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors">
              Create Invitation
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors">
              Manage Users
            </button>
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg transition-colors">
              View Analytics
            </button>
          </div>
        </div>

        {/* Admin Info */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Admin Information</h2>
          <div className="text-sm text-gray-400">
            <p>• You are the administrator of this voice channel instance</p>
            <p>• You can manage user registrations and invitations</p>
            <p>• Instance settings control who can join and create invitations</p>
            <p>• The first user to join an instance automatically becomes admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}; 