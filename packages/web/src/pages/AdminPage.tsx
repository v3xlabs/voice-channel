import { FC } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { InvitationManager } from '../components/admin/InvitationManager';
import { UserManager } from '../components/admin/UserManager';

export const AdminPage: FC = () => {
  const {
    instanceSettings,
    isAdmin,
  } = useAdmin();

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-gray-400">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  if (instanceSettings.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (instanceSettings.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Error Loading Admin Panel</h2>
          <p className="text-gray-400">{instanceSettings.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-gray-400">Manage your voice channel instance</p>
        </div>
        
        <div className="space-y-8">
          {/* Instance Settings Overview */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Instance Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Instance Name</div>
                <div className="text-lg font-medium">
                  {instanceSettings.data?.instance_name || 'Voice Channel'}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Registration Mode</div>
                <div className="text-lg font-medium capitalize">
                  {instanceSettings.data?.registration_mode?.replace('_', ' ') || 'Invite Only'}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Invite Permission</div>
                <div className="text-lg font-medium capitalize">
                  {instanceSettings.data?.invite_permission?.replace('_', ' ') || 'Admin Only'}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Status</div>
                <div className="text-lg font-medium text-green-400">
                  Active
                </div>
              </div>
            </div>
          </div>

          {/* Invitation Management */}
          <InvitationManager />

          {/* User Management */}
          <UserManager />
        </div>
      </div>
    </div>
  );
}; 