import { FC, useState } from 'react';
import classNames from 'classnames';
import { useAdmin } from '../../hooks/useAdmin';

// Define the invitation type based on what we expect from the backend
interface InvitationWithCreator {
  invitation_id: string;
  invite_code: string;
  created_by: string;
  invited_by?: string;
  invited_email?: string;
  instance_fqdn: string;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
  expires_at?: string;
  used_at?: string;
  created_at: string;
  updated_at: string;
  creator_username?: string;
  creator_display_name?: string;
}

interface CreateInvitationFormProps {
  onSubmit: (data: { max_uses?: number; expires_at?: string; invited_email?: string }) => void;
  isSubmitting: boolean;
}

const CreateInvitationForm: FC<CreateInvitationFormProps> = ({ onSubmit, isSubmitting }) => {
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [expiryDays, setExpiryDays] = useState<number | ''>('');
  const [invitedEmail, setInvitedEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: { max_uses?: number; expires_at?: string; invited_email?: string } = {};
    
    if (maxUses && maxUses > 0) {
      data.max_uses = Number(maxUses);
    }
    
    if (expiryDays && expiryDays > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + Number(expiryDays));
      data.expires_at = expiryDate.toISOString();
    }
    
    if (invitedEmail.trim()) {
      data.invited_email = invitedEmail.trim();
    }
    
    onSubmit(data);
    
    // Reset form
    setMaxUses('');
    setExpiryDays('');
    setInvitedEmail('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Max Uses (optional)
          </label>
          <select
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
          >
            <option value="">Unlimited</option>
            <option value={1}>1 use</option>
            <option value={5}>5 uses</option>
            <option value={10}>10 uses</option>
            <option value={25}>25 uses</option>
            <option value={50}>50 uses</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Expires in (days, optional)
          </label>
          <select
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
          >
            <option value="">Never</option>
            <option value={1}>1 day</option>
            <option value={7}>1 week</option>
            <option value={30}>1 month</option>
            <option value={90}>3 months</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Email (optional)
          </label>
          <input
            type="email"
            value={invitedEmail}
            onChange={(e) => setInvitedEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
            disabled={isSubmitting}
          />
        </div>
      </div>
      
      <button
        type="submit"
        disabled={isSubmitting}
        className={classNames(
          'w-full px-4 py-2 rounded-lg font-medium transition-colors',
          isSubmitting
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        )}
      >
        {isSubmitting ? 'Creating...' : 'Create Invitation'}
      </button>
    </form>
  );
};

interface InvitationRowProps {
  invitation: InvitationWithCreator;
  onDeactivate: (id: string) => void;
  onDelete: (id: string) => void;
  isDeactivating: boolean;
  isDeleting: boolean;
}

const InvitationRow: FC<InvitationRowProps> = ({
  invitation,
  onDeactivate,
  onDelete,
  isDeactivating,
  isDeleting,
}) => {
  const [showCode, setShowCode] = useState(false);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // TODO: Add toast notification
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  const getStatusBadge = () => {
    if (!invitation.is_active) {
      return <span className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded">Inactive</span>;
    }
    
    if (invitation.expires_at && new Date(invitation.expires_at) <= new Date()) {
      return <span className="px-2 py-1 text-xs bg-red-600 text-white rounded">Expired</span>;
    }
    
    if (invitation.max_uses && invitation.current_uses >= invitation.max_uses) {
      return <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded">Exhausted</span>;
    }
    
    return <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">Active</span>;
  };
  
  const inviteUrl = `${window.location.origin}/invite/${invitation.invite_code}`;
  
  return (
    <tr className="border-b border-gray-700">
      <td className="px-4 py-3">
        <div className="flex items-center space-x-2">
          <code className="bg-gray-700 px-2 py-1 rounded text-sm">
            {showCode ? invitation.invite_code : '••••••••'}
          </code>
          <button
            onClick={() => setShowCode(!showCode)}
            className="text-gray-400 hover:text-white text-sm"
          >
            {showCode ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => copyToClipboard(invitation.invite_code)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Copy Code
          </button>
          <button
            onClick={() => copyToClipboard(inviteUrl)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Copy URL
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        {invitation.creator_username || 'Unknown'}
      </td>
      <td className="px-4 py-3">
        {formatDate(invitation.created_at)}
      </td>
      <td className="px-4 py-3">
        {invitation.current_uses} / {invitation.max_uses || '∞'}
      </td>
      <td className="px-4 py-3">
        {invitation.expires_at ? formatDate(invitation.expires_at) : 'Never'}
      </td>
      <td className="px-4 py-3">
        {getStatusBadge()}
      </td>
      <td className="px-4 py-3">
        <div className="flex space-x-2">
          {invitation.is_active && (
            <button
              onClick={() => onDeactivate(invitation.invitation_id)}
              disabled={isDeactivating}
              className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50"
            >
              {isDeactivating ? 'Deactivating...' : 'Deactivate'}
            </button>
          )}
          <button
            onClick={() => onDelete(invitation.invitation_id)}
            disabled={isDeleting}
            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
};

export const InvitationManager: FC = () => {
  const {
    invitations: { data: invitations, isLoading: isLoadingInvitations },
    createInvitation,
    isCreatingInvitation,
    deactivateInvitation,
    isDeactivatingInvitation,
    deleteInvitation,
    isDeletingInvitation,
  } = useAdmin();

  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');

  const filteredInvitations = invitations?.filter((invitation) => {
    switch (filter) {
      case 'active':
        return invitation.invitation.is_active && 
               (!invitation.invitation.expires_at || new Date(invitation.invitation.expires_at) > new Date()) &&
               (!invitation.invitation.max_uses || invitation.invitation.current_uses < invitation.invitation.max_uses);
      case 'inactive':
        return !invitation.invitation.is_active;
      case 'expired':
        return invitation.invitation.expires_at && new Date(invitation.invitation.expires_at) <= new Date();
      default:
        return true;
    }
  });

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-6">Invitation Management</h2>
      
      {/* Create Invitation Form */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">Create New Invitation</h3>
        <CreateInvitationForm
          onSubmit={createInvitation}
          isSubmitting={isCreatingInvitation}
        />
      </div>
      
      {/* Filter Controls */}
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => setFilter('all')}
          className={classNames(
            'px-3 py-1 rounded text-sm',
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          )}
        >
          All ({invitations?.length})
        </button>
        <button
          onClick={() => setFilter('active')}
          className={classNames(
            'px-3 py-1 rounded text-sm',
            filter === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          )}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('inactive')}
          className={classNames(
            'px-3 py-1 rounded text-sm',
            filter === 'inactive' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          )}
        >
          Inactive
        </button>
        <button
          onClick={() => setFilter('expired')}
          className={classNames(
            'px-3 py-1 rounded text-sm',
            filter === 'expired' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          )}
        >
          Expired
        </button>
      </div>
      
      {/* Invitations Table */}
      {isLoadingInvitations ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading invitations...</p>
        </div>
      ) : filteredInvitations && filteredInvitations.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No invitations found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Invite Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created By</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Uses</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Expires</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvitations?.map((invitation) => (
                <InvitationRow
                  key={invitation.invitation.invitation_id}
                  invitation={invitation.invitation}
                  onDeactivate={deactivateInvitation}
                  onDelete={deleteInvitation}
                  isDeactivating={isDeactivatingInvitation}
                  isDeleting={isDeletingInvitation}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}; 