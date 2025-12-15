import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Plus,
  Users as UsersIcon,
  Shield,
  Mail,
  Phone,
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
  RotateCcw,
  Building,
  X,
  Save,
  Key
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ACCOUNTS_API, TENANTS_API, REGISTRY_API } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import NotFound from './NotFound';

interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_staff: boolean;
  is_active?: boolean;
  tenant_name?: string;
  last_login?: string | null;
  // optional custom fields
  phone?: string;
  department?: string;
  role?: string;
}

const API_BASE = ACCOUNTS_API;

interface App {
  id: number;
  name: string;
  usecase_id?: number;
}

const Users = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role?.toLowerCase();
  const hasAccess =
    role === 'admin' ||
    role === 'super_admin' ||
    user?.is_staff ||
    user?.is_superuser;
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedTenant, setSelectedTenant] = useState<string>('All');
  const [tenants, setTenants] = useState<Array<{id: number, name: string}>>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    role: 'viewer',
    allowed_apps: [] as number[],
  });
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [tenantAppIds, setTenantAppIds] = useState<number[]>([]);

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      /* ignore */
    }
  };

  const loadDomains = async () => {
    try {
      const res = await fetch(`${TENANTS_API}/domains/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAllowedDomains(data.map((d: any) => d.domain.toLowerCase()));
      }
    } catch {
      /* ignore */
    }
  };

  const loadApps = async () => {
    try {
      const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setApps(data);
      }
    } catch {
      /* ignore */
    }
  };

  const loadTenantApps = async () => {
    try {
      // Use /tenants/current/ to get the current user's tenant instead of the first tenant
      const res = await fetch(`${TENANTS_API}/tenants/current/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // tenant.allowed_apps contains UseCase IDs from public schema
        // We'll filter apps by matching their usecase_id with these UseCase IDs
        setTenantAppIds(data.allowed_apps || []);
      }
    } catch {
      /* ignore */
    }
  };

  const loadTenants = async () => {
    try {
      const res = await fetch(`${TENANTS_API}/tenants/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.map((t: any) => ({ id: t.id, name: t.name })));
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadUsers();
    loadDomains();
    loadApps();
    loadTenantApps();
    // Only load tenants for staff/superusers
    if (user?.is_staff || user?.is_superuser) {
      loadTenants();
    }
  }, [hasAccess]);

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleAppToggle = (appId: number) => {
    setForm((prev) => {
      const currentApps = prev.allowed_apps;
      const isSelected = currentApps.includes(appId);
      return {
        ...prev,
        allowed_apps: isSelected
          ? currentApps.filter((id) => id !== appId)
          : [...currentApps, appId],
      };
    });
  };

  const handleEditUser = (userId: number) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      setEditingUserId(userId);
      setForm({
        username: user.username,
        email: user.email,
        role: user.role || 'viewer',
        allowed_apps: user.allowed_apps_read || [],
      });
      setShowAddForm(true);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Only validate email domain for new users
    if (editingUserId === null) {
      const domain = form.email.split('@')[1]?.toLowerCase();
      if (domain && allowedDomains.length && !allowedDomains.includes(domain)) {
        alert('Email domain not allowed');
        return;
      }
    }
    
    try {
      const url = editingUserId !== null 
        ? `${API_BASE}/users/${editingUserId}/`
        : `${API_BASE}/users/`;
      const method = editingUserId !== null ? 'PATCH' : 'POST';
      
      // For update, only send role and allowed_apps
      const body = editingUserId !== null
        ? { role: form.role, allowed_apps: form.allowed_apps }
        : form;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Show onboarding token link if it's a new user creation
        if (editingUserId === null && data.onboard_token) {
          const loginUrl = `${window.location.origin}/login?token=${data.onboard_token}`;
          toast({
            title: 'User Created Successfully',
            description: (
              <div className="space-y-2">
                <p>User <strong>{data.username}</strong> has been created.</p>
                <a 
                  href={loginUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline text-sm font-medium block"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(loginUrl, '_blank');
                  }}
                >
                  Open Onboarding Link
                </a>
                <p className="text-xs text-gray-500">Or copy this link: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded break-all">{loginUrl}</code></p>
              </div>
            ),
            duration: 15000,
          });
        } else {
          toast({
            title: 'Success',
            description: editingUserId !== null 
              ? 'User has been updated successfully.'
              : 'User has been created successfully.',
          });
        }
        
        setForm({ username: '', email: '', role: 'viewer', allowed_apps: [] });
        setEditingUserId(null);
        setShowAddForm(false);
        await loadUsers();
      } else {
        // Try to parse error message from response
        let errorMessage = editingUserId !== null 
          ? 'Failed to update user. Please try again.'
          : 'Failed to create user. Please try again.';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
          
          // Check if error is related to user quota
          if (errorMessage && (
            errorMessage.toLowerCase().includes('maximum allowed users') ||
            errorMessage.toLowerCase().includes('quota') ||
            errorMessage.toLowerCase().includes('seats_allowed')
          )) {
            errorMessage = 'You have exceeded your users quota. Please contact Quant Matrix to increase your quota.';
          }
        } catch {
          // If response is not JSON, use default message
        }
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: editingUserId !== null
          ? 'An unexpected error occurred while updating the user.'
          : 'An unexpected error occurred while creating the user.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete user?')) return;
    try {
      const res = await fetch(`${API_BASE}/users/${id}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({
          title: 'Success',
          description: 'User has been deleted successfully.',
        });
        await loadUsers();
      } else {
        // Try to parse error message from response
        let errorMessage = 'Failed to delete user. Please try again.';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting the user.',
        variant: 'destructive',
      });
    }
  };

  const handleReactivate = async (id: number) => {
    if (!confirm('Reactivate user?')) return;
    try {
      const res = await fetch(`${API_BASE}/users/${id}/reactivate/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast({
          title: 'Success',
          description: 'User has been reactivated successfully.',
        });
        await loadUsers();
      } else {
        // Try to parse error message from response
        let errorMessage = 'Failed to reactivate user. Please try again.';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
          
          // Check if error is related to user quota
          if (errorMessage && (
            errorMessage.toLowerCase().includes('maximum allowed users') ||
            errorMessage.toLowerCase().includes('quota') ||
            errorMessage.toLowerCase().includes('seats_allowed')
          )) {
            errorMessage = 'You have exceeded your users quota. Please contact Quant Matrix to increase your quota.';
          }
        } catch {
          // If response is not JSON, use default message
        }
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while reactivating the user.',
        variant: 'destructive',
      });
    }
  };

  const handleGeneratePasswordResetToken = async (id: number, username: string) => {
    try {
      const res = await fetch(`${API_BASE}/users/${id}/generate_password_reset_token/`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        // Construct the login URL with token
        const loginUrl = `${window.location.origin}/login?token=${data.token}`;
        
        toast({
          title: 'Password Reset Token Generated',
          description: (
            <div className="space-y-2">
              <p>Token for {username}: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{data.token}</code></p>
              <a 
                href={loginUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(loginUrl, '_blank');
                }}
              >
                Open Password Reset Link
              </a>
              <p className="text-xs text-gray-500">Or copy this link: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded break-all">{loginUrl}</code></p>
            </div>
          ),
          duration: 15000, // Show for 15 seconds to allow copying
        });
      } else {
        let errorMessage = 'Failed to generate password reset token. Please try again.';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while generating the password reset token.',
        variant: 'destructive',
      });
    }
  };

  const getRole = (u: User) => {
    const r = u.role?.toLowerCase();
    switch (r) {
      case 'admin':
      case 'super_admin':
        return 'Admin';
      case 'editor':
        return 'Editor';
      case 'viewer':
      case 'analyst':
        return 'Viewer';
      default:
        return u.is_staff ? 'Admin' : 'Viewer';
    }
  };
  const getStatus = (u: User) => {
    return u.is_active === false ? 'Inactive' : 'Active';
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Editor':
        return 'bg-[#fec107] text-black border-black';
      case 'Viewer':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'Active'
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const role = getRole(u);
    const status = getStatus(u);
    const matchesRole = selectedRole === 'All' || role === selectedRole;
    const matchesStatus = selectedStatus === 'All' || status === selectedStatus;
    const matchesTenant = selectedTenant === 'All' || u.tenant_name === selectedTenant;
    return matchesSearch && matchesRole && matchesStatus && matchesTenant;
  });

  if (!hasAccess) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <UsersIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                <p className="text-gray-600">Manage user accounts, roles, and permissions</p>
              </div>
            </div>
            <Button
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:opacity-90 shadow-lg hover:shadow-xl transition-all duration-300"
              onClick={() => {
                setShowAddForm((v) => !v);
                if (showAddForm) {
                  setEditingUserId(null);
                  setForm({ username: '', email: '', role: 'viewer', allowed_apps: [] });
                }
              }}
            >
              {showAddForm ? (
                <>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" /> Add User
                </>
              )}
            </Button>
          </div>

          {showAddForm && (
            <Card className="mb-8 p-6 bg-white border-0 shadow-lg">
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  name="username"
                  placeholder="Username"
                  value={form.username}
                  onChange={handleFormChange}
                  disabled={editingUserId !== null}
                  readOnly={editingUserId !== null}
                  className={`border-gray-200 ${editingUserId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />
                <Input
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={handleFormChange}
                  disabled={editingUserId !== null}
                  readOnly={editingUserId !== null}
                  className={`border-gray-200 ${editingUserId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />
                <div className="md:col-span-3 space-y-2">
                  <label htmlFor="role" className="text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={form.role}
                    onChange={handleFormChange}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <label htmlFor="allowed_apps" className="text-sm font-medium text-gray-700">
                    Allowed Apps
                  </label>
                  <div className="w-full max-h-[200px] overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2 bg-white">
                    {apps
                      .filter((a) => !a.usecase_id || tenantAppIds.includes(a.usecase_id))
                      .map((a) => (
                        <label
                          key={a.id}
                          htmlFor={`app-${a.id}`}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                        >
                          <Checkbox
                            id={`app-${a.id}`}
                            checked={form.allowed_apps.includes(a.id)}
                            onCheckedChange={() => handleAppToggle(a.id)}
                          />
                          <span className="text-sm text-gray-700">{a.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-green-500 to-emerald-600">
                    <Save className="w-4 h-4 mr-2" /> {editingUserId !== null ? 'Update User' : 'Save User'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="All">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="Editor">Editor</option>
                <option value="Viewer">Viewer</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              {(user?.is_staff || user?.is_superuser) && (
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="All">All Tenants</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.name}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => {
            const role = getRole(user);
            const status = getStatus(user);
            const initials = (
              user.first_name?.[0] || user.username[0]
            ) + (user.last_name?.[0] || '');
            const isInactive = user.is_active === false;
            return (
              <Card key={user.id} className={`p-6 hover:shadow-xl transition-all duration-300 border-0 backdrop-blur-sm ${isInactive ? 'opacity-60 bg-gray-100/80' : 'bg-white/80'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-gray-200 to-gray-300 flex items-center justify-center">
                      <span className="text-gray-700 font-semibold text-lg">{initials}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{user.username}</h3>
                      {user.first_name && (
                        <p className="text-sm text-gray-600">{user.first_name} {user.last_name}</p>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="p-2">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg">
                      <DropdownMenuItem className="cursor-pointer" onSelect={() => handleEditUser(user.id)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit User
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className={isInactive ? "cursor-not-allowed opacity-50" : "cursor-pointer"} 
                        disabled={isInactive}
                        onSelect={() => !isInactive && handleGeneratePasswordResetToken(user.id, user.username)}
                      >
                        <Key className="w-4 h-4 mr-2" /> Generate Password Reset Token
                      </DropdownMenuItem>
                      {isInactive ? (
                        <DropdownMenuItem className="cursor-pointer text-green-600 focus:text-green-700" onSelect={() => handleReactivate(user.id)}>
                          <RotateCcw className="w-4 h-4 mr-2" /> Reactivate User
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-700" onSelect={() => handleDelete(user.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete User
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span>{user.email}</span>
                  </div>
                  {user.tenant_name && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Building className="w-4 h-4" />
                      <span>{user.tenant_name}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  {user.last_login && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Last login: {new Date(user.last_login).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="flex space-x-2">
                    <Badge className={`text-xs border ${getRoleColor(role)}`}>
                      <Shield className="w-3 h-3 mr-1" /> {role}
                    </Badge>
                    <Badge className={`text-xs border ${getStatusColor(status)}`}>{status}</Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-16">
            <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No users found</h3>
            <p className="text-gray-500 mb-6">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Users;
