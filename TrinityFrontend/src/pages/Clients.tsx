import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  Building2,
  Users,
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  ArrowUpRight,
  Mail,
  MapPin,
  X,
  Save,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TENANTS_API, REGISTRY_API } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import NotFound from './NotFound';
console.log('TENANTS_API', TENANTS_API);
console.log('REGISTRY_API', REGISTRY_API);

interface Tenant {
  id: number;
  name: string;
  schema_name: string;
  created_on: string;
  domain: string;
}

interface App {
  id: number;
  name: string;
}

const Clients = () => {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();
  const hasAccess =
    role === 'admin' ||
    role === 'super_admin' ||
    user?.is_staff ||
    user?.is_superuser;

  if (!hasAccess) {
    return <NotFound />;
  }
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    schema_name: '',
    domain: '',
    seats_allowed: '',
    project_cap: '',
    apps_allowed: [] as number[],
  });

  const navigate = useNavigate();

  const loadTenants = async () => {
    try {
      const res = await fetch(`${TENANTS_API}/tenants/`, {
        credentials: 'include',
      });
      console.log('Load tenants status', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('Tenants data', data);
        // fetch first domain for each tenant
        const domainsRes = await fetch(`${TENANTS_API}/domains/`, {
          credentials: 'include',
        });
        let domains: any[] = [];
        console.log('Domains fetch status', domainsRes.status);
        if (domainsRes.ok) {
          domains = await domainsRes.json();
          console.log('Domains data', domains);
        } else {
          console.log('Domains fetch error', await domainsRes.text());
        }
        setTenants(
          data.map((t: any) => ({
            ...t,
            domain:
              domains.find((d) => d.tenant === t.id && d.is_primary)?.domain || '',
          }))
        );
      }
    } catch {
      console.log('Load tenants error');
    }
  };

  const loadApps = async () => {
    try {
      const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
      console.log('Load apps status', res.status);
      if (res.ok) {
        const appsData = await res.json();
        console.log('Apps data', appsData);
        setApps(appsData);
      }
    } catch {
      console.log('Load apps error');
    }
  };

  useEffect(() => {
    console.log('Clients page mounted');
    loadTenants();
    loadApps();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, options } = e.target as HTMLSelectElement;
    if (name === 'apps_allowed') {
      const selected = Array.from(options)
        .filter((o) => o.selected)
        .map((o) => Number(o.value));
      setForm({ ...form, apps_allowed: selected });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      schema_name: form.schema_name,
      domain: form.domain,
      seats_allowed: Number(form.seats_allowed),
      project_cap: Number(form.project_cap),
      apps_allowed: form.apps_allowed,
    };
    console.log('Submitting tenant payload', payload);
    try {
      const res = await fetch(`${TENANTS_API}/tenants/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('Create tenant status', res.status);
      const body = await res.text();
      console.log('Create tenant body', body);
      if (res.ok) {
        setForm({
          name: '',
          schema_name: '',
          domain: '',
          seats_allowed: '',
          project_cap: '',
          apps_allowed: [],
        });
        loadTenants();
      }
    } catch (err) {
      console.log('Tenant creation error', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete tenant?')) return;
    try {
      const res = await fetch(`${TENANTS_API}/tenants/${id}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      console.log('Delete tenant status', res.status);
      if (res.ok) {
        await loadTenants();
      }
    } catch {
      /* ignore */
    }
  };

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-1">Client Management</h1>
                <p className="text-gray-600">Manage and monitor your client relationships</p>
              </div>
            </div>

            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-3"
            >
              {showAddForm ? (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Client
                </>
              )}
            </Button>
          </div>

          {showAddForm && (
            <Card className="mb-8 p-6 bg-white border-0 shadow-lg">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Add New Client</h2>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">Client Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Client Name"
                    className="border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schema_name" className="text-sm font-medium text-gray-700">Schema Name *</Label>
                  <Input
                    id="schema_name"
                    name="schema_name"
                    value={form.schema_name}
                    onChange={handleChange}
                    placeholder="schema"
                    className="border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain" className="text-sm font-medium text-gray-700">Primary Domain</Label>
                  <Input
                    id="domain"
                    name="domain"
                    value={form.domain}
                    onChange={handleChange}
                    placeholder="client.example.com"
                    className="border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seats_allowed" className="text-sm font-medium text-gray-700">Users Allowed</Label>
                  <Input
                    id="seats_allowed"
                    name="seats_allowed"
                    type="number"
                    value={form.seats_allowed}
                    onChange={handleChange}
                    placeholder="0"
                    className="border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project_cap" className="text-sm font-medium text-gray-700">Projects Allowed</Label>
                  <Input
                    id="project_cap"
                    name="project_cap"
                    type="number"
                    value={form.project_cap}
                    onChange={handleChange}
                    placeholder="0"
                    className="border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="apps_allowed" className="text-sm font-medium text-gray-700">Allowed Apps</Label>
                  <select
                    id="apps_allowed"
                    name="apps_allowed"
                    multiple
                    value={form.apps_allowed.map(String)}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 lg:col-span-3 flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 shadow-md">
                    <Save className="w-4 h-4 mr-2" />
                    Save Client
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Clients</p>
                  <p className="text-2xl font-bold text-green-600">{tenants.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">0</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Projects</p>
                  <p className="text-2xl font-bold text-purple-600">0</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </Card>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Clients Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((client) => (
            <Card key={client.id} className="bg-white border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {client.name}
                      </h3>
                      <p className="text-sm text-gray-500">{client.domain}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-white border border-gray-200 shadow-lg">
                        <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate(`/clients/${client.id}`)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate(`/clients/${client.id}/edit`)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Client
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-red-600" onSelect={() => handleDelete(client.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="w-4 h-4 mr-2" />
                    <span>{client.domain}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>Schema: {client.schema_name}</span>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-400">Created on: {new Date(client.created_on).toLocaleDateString()}</div>
              </div>
            </Card>
          ))}
        </div>

        {filteredTenants.length === 0 && (
          <div className="text-center py-16">
            <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mx-auto mb-8">
              <Building2 className="w-16 h-16 text-gray-400" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No clients found</h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">Try adjusting your search criteria.</p>
            <Button onClick={() => setShowAddForm(true)} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 shadow-lg hover:shadow-xl transition-all duration-300">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Client
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Clients;
