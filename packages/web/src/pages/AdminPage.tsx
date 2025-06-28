import { FC } from 'react';
import { useAdmin } from '../hooks/useAdmin';

export const AdminPage: FC = () => {
  const {
    instanceSettings,
    registrationStatus,
    isLoading,
    error,
  } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Error Loading Admin Panel</h2>
          <p className="text-gray-400">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
        
        <div className="grid gap-6">
          {/* Instance Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Instance Settings</h2>
                         {instanceSettings ? (
               <div className="space-y-2">
                 <p><strong>Instance Name:</strong> {instanceSettings.instance_name}</p>
                 <p><strong>Registration Mode:</strong> {instanceSettings.registration_mode}</p>
                 <p><strong>Invite Permission:</strong> {instanceSettings.invite_permission}</p>
               </div>
             ) : (
               <p className="text-gray-400">No settings available</p>
             )}
          </div>

          {/* Registration Status */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Registration Status</h2>
                         {registrationStatus ? (
               <div className="space-y-2">
                 <p><strong>Status:</strong> Available</p>
                 <p><strong>Data:</strong> {JSON.stringify(registrationStatus)}</p>
               </div>
             ) : (
               <p className="text-gray-400">No registration data available</p>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}; 