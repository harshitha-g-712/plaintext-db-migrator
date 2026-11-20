import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userService, type ManagedUser } from '../services/user.service';
import type { UserRole } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
  AlertCircle,
  FolderOpen,
  Calendar,
  Lock,
} from 'lucide-react';

export const UsersManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'DEVELOPER'>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await userService.list();
      setUsers(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load user roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleStatus = async (targetUser: ManagedUser) => {
    if (targetUser.id === currentUser?.id) {
      setError('You cannot deactivate your own account.');
      return;
    }

    try {
      setActionLoading(targetUser.id);
      setError('');
      setSuccess('');
      const updated = await userService.updateStatus(targetUser.id, !targetUser.is_active);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, is_active: updated.is_active } : u))
      );
      setSuccess(
        `User ${targetUser.name} has been ${updated.is_active ? 'activated' : 'deactivated'}.`
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update user status.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (targetUser: ManagedUser, newRole: UserRole) => {
    if (targetUser.id === currentUser?.id && newRole !== 'ADMIN') {
      setError('You cannot remove your own Admin permissions.');
      return;
    }

    try {
      setActionLoading(targetUser.id);
      setError('');
      setSuccess('');
      const updated = await userService.updateRole(targetUser.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u))
      );
      setSuccess(`Role for ${targetUser.name} changed to ${newRole}.`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update user role.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (targetUser: ManagedUser) => {
    if (targetUser.id === currentUser?.id) {
      setError('You cannot delete your own account.');
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to permanently delete user "${targetUser.name}" (${targetUser.email}) and all their associated projects? This cannot be undone.`
    );
    if (!confirm) return;

    try {
      setActionLoading(targetUser.id);
      setError('');
      setSuccess('');
      await userService.delete(targetUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      setSuccess(`User ${targetUser.name} deleted successfully.`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete user.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const devCount = users.filter((u) => u.role === 'DEVELOPER').length;
  const activeCount = users.filter((u) => u.is_active).length;

  if (currentUser?.role !== 'ADMIN') {
    return (
      <Card className="text-center py-16">
        <Lock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900">Access Restricted</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          User Management is an exclusive feature reserved for Administrators.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <Shield className="h-4 w-4" /> Administration Control Panel
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-7 w-7 text-indigo-600" /> User & Developer Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage developer accounts, assign roles, inspect project allocations, and enforce access controls.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm flex items-start gap-2 shadow-sm">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-start gap-2 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{success}</div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Users</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{users.length}</p>
          <p className="text-xs text-slate-400 mt-1">Platform members</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Developers</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{devCount}</p>
          <p className="text-xs text-slate-400 mt-1">Active builders</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Administrators</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{adminCount}</p>
          <p className="text-xs text-slate-400 mt-1">Governance superusers</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Status</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {activeCount} / {users.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Authorized accounts</p>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-1">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs font-medium">
            <span className="text-slate-500">Filter Role:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['ALL', 'DEVELOPER', 'ADMIN'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    roleFilter === r
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* User Roster Table */}
      <Card className="overflow-hidden p-0 border border-slate-200">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-medium">No users found matching your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Projects</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  const isBusy = actionLoading === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        !u.is_active ? 'opacity-60 bg-slate-50/30' : ''
                      }`}
                    >
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm ${
                              u.role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {u.name}
                              {isCurrent && (
                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Dropdown */}
                      <td className="py-3.5 px-4">
                        <select
                          value={u.role}
                          disabled={isBusy || (isCurrent && u.role === 'ADMIN')}
                          onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                          className={`text-xs font-semibold py-1 px-2.5 rounded-lg border focus:outline-none cursor-pointer transition-colors ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          <option value="DEVELOPER">Developer</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          disabled={isBusy || isCurrent}
                          onClick={() => handleToggleStatus(u)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                          } ${isCurrent ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                          title={isCurrent ? 'Cannot deactivate yourself' : 'Click to toggle status'}
                        >
                          {u.is_active ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-rose-600" /> Inactive
                            </>
                          )}
                        </button>
                      </td>

                      {/* Projects Count */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium text-xs">
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
                          {u.projects_count} project{u.projects_count === 1 ? '' : 's'}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Delete Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isBusy || isCurrent}
                          onClick={() => handleDeleteUser(u)}
                          className={`text-xs py-1 px-2.5 text-red-600 hover:bg-red-50 hover:border-red-200 ${
                            isCurrent ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
                          title={isCurrent ? 'Cannot delete yourself' : 'Delete user'}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
