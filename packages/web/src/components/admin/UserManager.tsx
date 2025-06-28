import { FC, useState } from 'react';
import classNames from 'classnames';
import { useAdmin } from '../../hooks/useAdmin';
import type { components } from '../../types/api';

type User = components['schemas']['User'];

interface UserRowProps {
  user: User;
}

const UserRow: FC<UserRowProps> = ({ user }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <tr className="border-b border-gray-700">
      <td className="px-4 py-3">
        <div>
          <div className="font-medium">{user.display_name}</div>
          <div className="text-sm text-gray-400">@{user.username}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm">{user.instance_fqdn}</div>
      </td>
      <td className="px-4 py-3">
        {user.is_admin ? (
          <span className="px-2 py-1 text-xs bg-purple-600 text-white rounded">Admin</span>
        ) : (
          <span className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded">User</span>
        )}
      </td>
      <td className="px-4 py-3">
        {user.has_passkey ? (
          <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">Yes</span>
        ) : (
          <span className="px-2 py-1 text-xs bg-red-600 text-white rounded">No</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {formatDate(user.created_at)}
      </td>
      <td className="px-4 py-3 text-sm">
        {formatTime(user.updated_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex space-x-2">
          {/* TODO: Add user management actions like promote/demote, disable, etc. */}
          <button className="px-2 py-1 text-xs bg-gray-600 text-gray-400 rounded cursor-not-allowed">
            Manage
          </button>
        </div>
      </td>
    </tr>
  );
};

interface UserStatsProps {
  users: User[];
}

const UserStats: FC<UserStatsProps> = ({ users }) => {
  const totalUsers = users.length;
  const adminUsers = users.filter(user => user.is_admin).length;
  const usersWithPasskeys = users.filter(user => user.has_passkey).length;
  const recentUsers = users.filter(user => {
    const createdAt = new Date(user.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return createdAt > weekAgo;
  }).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="text-2xl font-bold text-white">{totalUsers}</div>
        <div className="text-sm text-gray-400">Total Users</div>
      </div>
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="text-2xl font-bold text-purple-400">{adminUsers}</div>
        <div className="text-sm text-gray-400">Admins</div>
      </div>
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="text-2xl font-bold text-green-400">{usersWithPasskeys}</div>
        <div className="text-sm text-gray-400">With Passkeys</div>
      </div>
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="text-2xl font-bold text-blue-400">{recentUsers}</div>
        <div className="text-sm text-gray-400">New This Week</div>
      </div>
    </div>
  );
};

export const UserManager: FC = () => {
  const { users, isLoadingUsers } = useAdmin();
  const [filter, setFilter] = useState<'all' | 'admins' | 'users' | 'recent'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users.filter((user) => {
    // Apply text search filter
    const matchesSearch = searchTerm === '' || 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.instance_fqdn.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Apply category filter
    switch (filter) {
      case 'admins':
        return user.is_admin;
      case 'users':
        return !user.is_admin;
      case 'recent': {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(user.created_at) > weekAgo;
      }
      default:
        return true;
    }
  });

  const sortedUsers = filteredUsers.sort((a, b) => {
    // Sort by admin status first, then by creation date
    if (a.is_admin && !b.is_admin) return -1;
    if (!a.is_admin && b.is_admin) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-6">User Management</h2>
      
      {/* User Statistics */}
      <UserStats users={users} />
      
      {/* Search and Filter Controls */}
      <div className="mb-6 space-y-4">
        <div>
          <input
            type="text"
            placeholder="Search users by username, display name, or instance..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={classNames(
              'px-3 py-1 rounded text-sm',
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            All Users ({users.length})
          </button>
          <button
            onClick={() => setFilter('admins')}
            className={classNames(
              'px-3 py-1 rounded text-sm',
              filter === 'admins' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            Admins
          </button>
          <button
            onClick={() => setFilter('users')}
            className={classNames(
              'px-3 py-1 rounded text-sm',
              filter === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            Regular Users
          </button>
          <button
            onClick={() => setFilter('recent')}
            className={classNames(
              'px-3 py-1 rounded text-sm',
              filter === 'recent' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            Recent
          </button>
        </div>
      </div>
      
      {/* Users Table */}
      {isLoadingUsers ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading users...</p>
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {searchTerm ? `No users found matching "${searchTerm}".` : 'No users found.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Instance</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Passkey</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Joined</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Last Updated</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <UserRow key={user.user_id} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Summary */}
      {filteredUsers.length > 0 && (
        <div className="mt-4 text-sm text-gray-400">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      )}
    </div>
  );
}; 