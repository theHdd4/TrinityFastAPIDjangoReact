import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  mfa_enabled: boolean;
  preferences: Record<string, unknown> | null;
  is_staff: boolean;
}

import { ACCOUNTS_API, TENANTS_API } from '@/lib/api';

const API_BASE = ACCOUNTS_API;

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
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
      /* ignore errors for demo */
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
        await loadUsers();
      }
    } catch {
      /* ignore errors for demo */
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
      /* ignore errors for demo */
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                name="username"
                placeholder="Username"
                value={form.username}
                onChange={handleChange}
              />
              <Input
                name="password"
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
              />
              <Input
                name="email"
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
              />
              <Button type="submit">Add User</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Users</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="border-b pb-1 last:border-none flex justify-between items-center">
                  <span>{u.username} – {u.email}</span>
                  <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-800">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Users;
