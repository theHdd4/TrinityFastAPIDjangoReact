import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  X,
  Save
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ACCOUNTS_API, TENANTS_API } from '@/lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_staff: boolean;
  last_login?: string | null;
  // optional custom fields
  phone?: string;
  department?: string;
}

const API_BASE = ACCOUNTS_API;

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '' });
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);

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

  useEffect(() => {
    loadUsers();
    loadDomains();
  }, []);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = form.email.split('@')[1]?.toLowerCase();
    if (domain && allowedDomains.length && !allowedDomains.includes(domain)) {
      alert('Email domain not allowed');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ username: '', password: '', email: '' });
        setShowAddForm(false);
        await loadUsers();
      }
    } catch {
      /* ignore */
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
        await loadUsers();
      }
    } catch {
      /* ignore */
    }
  };

  const getRole = (u: User) => (u.is_staff ? 'Admin' : 'Analyst');
  const getStatus = (_u: User) => 'Active';

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Analyst':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Viewer':
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
    return matchesSearch && matchesRole && matchesStatus;
  });

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
              onClick={() => setShowAddForm((v) => !v)}
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
                  className="border-gray-200"
                />
                <Input
                  name="password"
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={handleFormChange}
                  className="border-gray-200"
                />
                <Input
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={handleFormChange}
                  className="border-gray-200"
                />
                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-green-500 to-emerald-600">
                    <Save className="w-4 h-4 mr-2" /> Save User
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
                <option value="Analyst">Analyst</option>
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
            return (
              <Card key={user.id} className="p-6 hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
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
                      <DropdownMenuItem className="cursor-pointer" disabled>
                        <Edit className="w-4 h-4 mr-2" /> Edit User
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-700" onSelect={() => handleDelete(user.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span>{user.email}</span>
                  </div>
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
