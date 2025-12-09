import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  Building2,
  Users,
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
  RotateCcw,
  Eye,
  ArrowUpRight,
  Mail,
  MapPin,
  X,
  Save,
  FileText,
  DollarSign,
  Clock,
  Folder,
  Database,
  RefreshCw,
  Lock,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TENANTS_API, USECASES_API } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import NotFound from './NotFound';
console.log('TENANTS_API', TENANTS_API);
console.log('USECASES_API', USECASES_API);

interface Tenant {
  id: number;
  name: string;
  schema_name: string;
  created_on: string;
  primary_domain: string;
  seats_allowed: number;
  project_cap: number;
  allowed_apps: number[];
  projects_allowed: string[];
  users_in_use: number;
  admin_name?: string;
  admin_email?: string;
  is_active?: boolean;
}

interface App {
  id: number;
  name: string;
}

const Clients = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  // Client Management: Available ONLY to is_staff or is_superuser (no UserRole check)
  const hasAccess = user?.is_staff || user?.is_superuser;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'bills' | 'quota'>('general');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ width: 0, left: 0 });
  const [form, setForm] = useState({
    name: '',
    schema_name: '',
    primary_domain: '',
    seats_allowed: '',
    project_cap: '',
    apps_allowed: [] as number[],
    projects_allowed: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
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
        setTenants(data);
      }
    } catch {
      console.log('Load tenants error');
    }
  };

  const loadApps = async () => {
    try {
      const res = await fetch(`${USECASES_API}/usecases/`, { credentials: 'include' });
      console.log('Load apps status', res.status);
      if (res.ok) {
        const appsData = await res.json();
        console.log('Apps data', appsData);
        // UseCase API returns a list directly, extract it if needed
        const appsList = Array.isArray(appsData) ? appsData : appsData.results || [];
        setApps(appsList);
      }
    } catch {
      console.log('Load apps error');
    }
  };

  useEffect(() => {
    console.log('Clients page mounted');
    if (!hasAccess) return;
    loadTenants();
    loadApps();
  }, [hasAccess]);

  // Update pill dimensions based on active tab
  const updatePillDimensions = useCallback(() => {
    const activeButton = tabButtonRefs.current[activeTab];
    const container = tabsContainerRef.current;
    
    if (activeButton && container) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      setPillStyle({
        width: buttonRect.width,
        left: buttonRect.left - containerRect.left,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    if (!showAddForm) return;
    
    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      updatePillDimensions();
      setTimeout(updatePillDimensions, 0);
      setTimeout(updatePillDimensions, 10);
      setTimeout(updatePillDimensions, 50);
    });

    // Recalculate on window resize
    window.addEventListener('resize', updatePillDimensions);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePillDimensions);
    };
  }, [updatePillDimensions, showAddForm, activeTab]);

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

  const handleEditClient = (tenantId: number) => {
    const client = tenants.find((t) => t.id === tenantId);
    if (!client) return;

    setEditingTenantId(tenantId);
    setForm({
      name: client.name,
      schema_name: client.schema_name,
      primary_domain: client.primary_domain || '',
      seats_allowed: String(client.seats_allowed),
      project_cap: String(client.project_cap),
      apps_allowed: client.allowed_apps || [],
      projects_allowed: Array.isArray(client.projects_allowed) 
        ? client.projects_allowed.join(', ') 
        : client.projects_allowed || '',
      admin_name: client.admin_name || '',
      admin_email: client.admin_email || '',
      admin_password: '',
    });
    setShowAddForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingTenantId !== null) {
      // Update existing tenant - only send seats_allowed and allowed_apps
      const payload = {
        seats_allowed: Number(form.seats_allowed),
        allowed_apps: form.apps_allowed,
      };
      console.log('Updating tenant payload', payload);
      try {
        const res = await fetch(`${TENANTS_API}/tenants/${editingTenantId}/`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log('Update tenant status', res.status);
        if (res.ok) {
          toast({
            title: 'Success',
            description: 'Client has been updated successfully.',
          });
          setForm({
            name: '',
            schema_name: '',
            primary_domain: '',
            seats_allowed: '',
            project_cap: '',
            apps_allowed: [],
            projects_allowed: '',
            admin_name: '',
            admin_email: '',
            admin_password: '',
          });
          setEditingTenantId(null);
          setShowAddForm(false);
          loadTenants();
        } else {
          let errorMessage = 'Failed to update client. Please try again.';
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
      } catch (err) {
        toast({
          title: 'Error',
          description: 'An unexpected error occurred while updating the client.',
          variant: 'destructive',
        });
      }
    } else {
      // Create new tenant
      const payload = {
        name: form.name,
        schema_name: form.schema_name,
        primary_domain: form.primary_domain,
        seats_allowed: Number(form.seats_allowed),
        project_cap: Number(form.project_cap),
        allowed_apps: form.apps_allowed,
        projects_allowed: form.projects_allowed
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
        admin_name: form.admin_name,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
      };
      console.log('Submitting tenant payload', payload);
      setIsCreatingClient(true);
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
          // Parse response to get onboarding token
          let tenantData;
          try {
            tenantData = JSON.parse(body);
          } catch {
            tenantData = {};
          }
          
          // Wait a moment to show the success state, then close
          setTimeout(() => {
            // Show onboarding token link if available
            if (tenantData.onboard_token) {
              const loginUrl = `${window.location.origin}/login?token=${tenantData.onboard_token}`;
              toast({
                title: 'Client Created Successfully',
                description: (
                  <div className="space-y-2">
                    <p>Client <strong>{tenantData.name}</strong> has been created.</p>
                    <p className="text-sm">Admin: <strong>{tenantData.admin_username || form.admin_name}</strong></p>
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
                      Open Admin Onboarding Link
                    </a>
                    <p className="text-xs text-gray-500">Or copy this link: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded break-all">{loginUrl}</code></p>
                  </div>
                ),
                duration: 15000,
              });
            } else {
              toast({
                title: 'Success',
                description: 'Client has been created successfully.',
              });
            }
            
            setForm({
              name: '',
              schema_name: '',
              primary_domain: '',
              seats_allowed: '',
              project_cap: '',
              apps_allowed: [],
              projects_allowed: '',
              admin_name: '',
              admin_email: '',
              admin_password: '',
            });
            setIsCreatingClient(false);
            setShowAddForm(false);
            setActiveTab('general');
            loadTenants();
          }, 1000);
        } else {
          setIsCreatingClient(false);
          let errorMessage = 'Failed to create client. Please try again.';
          try {
            const errorData = await JSON.parse(body);
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
      } catch (err) {
        setIsCreatingClient(false);
        toast({
          title: 'Error',
          description: 'An unexpected error occurred while creating the client.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete tenant? This will deactivate the tenant and all its users.')) return;
    try {
      const res = await fetch(`${TENANTS_API}/tenants/${id}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      console.log('Delete tenant status', res.status);
      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Tenant has been deactivated successfully.',
        });
        await loadTenants();
      } else {
        let errorMessage = 'Failed to delete tenant. Please try again.';
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
        description: 'An unexpected error occurred while deleting the tenant.',
        variant: 'destructive',
      });
    }
  };

  const handleReactivate = async (id: number) => {
    if (!confirm('Reactivate tenant? This will reactivate the tenant and all its users.')) return;
    try {
      const res = await fetch(`${TENANTS_API}/tenants/${id}/reactivate/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Tenant has been reactivated successfully.',
        });
        await loadTenants();
      } else {
        let errorMessage = 'Failed to reactivate tenant. Please try again.';
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
        description: 'An unexpected error occurred while reactivating the tenant.',
        variant: 'destructive',
      });
    }
  };

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.primary_domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!hasAccess) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50">
      <Header />

      {/* Loading Overlay for Client Creation */}
      {isCreatingClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-8 bg-white border-0 shadow-2xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mb-4 animate-pulse">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Creating client environment…
              </h3>
              <p className="text-gray-600 mb-4">Almost there.</p>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          </Card>
        </div>
      )}

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
              onClick={() => {
                if (showAddForm) {
                  setEditingTenantId(null);
                  setForm({
                    name: '',
                    schema_name: '',
                    primary_domain: '',
                    seats_allowed: '',
                    project_cap: '',
                    apps_allowed: [],
                    projects_allowed: '',
                    admin_name: '',
                    admin_email: '',
                    admin_password: '',
                  });
                }
                setShowAddForm(!showAddForm);
              }}
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

          {showAddForm && !isCreatingClient && (
            <Card className="mb-8 p-6 bg-white border-0 shadow-lg">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {editingTenantId !== null ? 'Edit Client' : 'Add New Client'}
                </h2>
                
                {/* Pill-style Tabs */}
                <div ref={tabsContainerRef} className="relative inline-flex items-center gap-2 p-1 bg-gray-100 rounded-full">
                  {/* Sliding Pill Background */}
                  {pillStyle.width > 0 && (
                    <div
                      className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
                      style={{
                        left: `${pillStyle.left}px`,
                        width: `${pillStyle.width}px`,
                      }}
                    />
                  )}
                  
                  <button
                    type="button"
                    ref={(el) => {
                      tabButtonRefs.current['general'] = el;
                      if (activeTab === 'general' && el) {
                        requestAnimationFrame(() => {
                          updatePillDimensions();
                        });
                      }
                    }}
                    onClick={() => setActiveTab('general')}
                    className={cn(
                      "relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200",
                      activeTab === 'general'
                        ? "text-gray-900"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <span>General Settings</span>
                  </button>
                  
                  <button
                    type="button"
                    ref={(el) => {
                      tabButtonRefs.current['bills'] = el;
                      if (activeTab === 'bills' && el) {
                        requestAnimationFrame(() => {
                          updatePillDimensions();
                        });
                      }
                    }}
                    onClick={() => setActiveTab('bills')}
                    className={cn(
                      "relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200",
                      activeTab === 'bills'
                        ? "text-gray-900"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <span>Bills and Plans</span>
                  </button>
                  
                  <button
                    type="button"
                    ref={(el) => {
                      tabButtonRefs.current['quota'] = el;
                      if (activeTab === 'quota' && el) {
                        requestAnimationFrame(() => {
                          updatePillDimensions();
                        });
                      }
                    }}
                    onClick={() => setActiveTab('quota')}
                    className={cn(
                      "relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200",
                      activeTab === 'quota'
                        ? "text-gray-900"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <span>Client's Quota</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* General Settings Tab Content */}
                {activeTab === 'general' && (
                  <>
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">Client Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Client Name"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary_domain" className="text-sm font-medium text-gray-700">Primary Domain</Label>
                  <Input
                    id="primary_domain"
                    name="primary_domain"
                    value={form.primary_domain}
                    onChange={handleChange}
                    placeholder="client.example.com"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="projects_allowed" className="text-sm font-medium text-gray-700">Allowed Projects (comma separated)</Label>
                  <Input
                    id="projects_allowed"
                    name="projects_allowed"
                    value={form.projects_allowed}
                    onChange={handleChange}
                    placeholder="project1, project2"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <h3 className="text-lg font-semibold text-gray-800">Admin Details</h3>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_name" className="text-sm font-medium text-gray-700">Admin Username *</Label>
                  <Input
                    id="admin_name"
                    name="admin_name"
                    value={form.admin_name}
                    onChange={handleChange}
                    placeholder="admin"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    required={editingTenantId === null}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_email" className="text-sm font-medium text-gray-700">Admin Email *</Label>
                  <Input
                    id="admin_email"
                    name="admin_email"
                    type="email"
                    value={form.admin_email}
                    onChange={handleChange}
                    placeholder="admin@example.com"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    required={editingTenantId === null}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_password" className="text-sm font-medium text-gray-700">Admin Password *</Label>
                  <Input
                    id="admin_password"
                    name="admin_password"
                    type="password"
                    value={form.admin_password}
                    onChange={handleChange}
                    placeholder="********"
                    disabled={editingTenantId !== null}
                    readOnly={editingTenantId !== null}
                    className={`border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingTenantId !== null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    required={editingTenantId === null}
                  />
                </div>

                <div className="md:col-span-2 lg:col-span-3 flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 shadow-md">
                    <Save className="w-4 h-4 mr-2" />
                    {editingTenantId !== null ? 'Update Client' : 'Save Client'}
                  </Button>
                </div>
                  </>
                )}

                {/* Bills and Plans Tab Content */}
                {activeTab === 'bills' && (
                  <div className="md:col-span-2 lg:col-span-3 space-y-6">
                    {/* Current Plan Section */}
                    <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
                      <div className="flex items-start gap-4 mb-6">
                        <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">Current Plan</h3>
                          <p className="text-sm text-gray-600">Enterprise Plan - Active</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4 bg-white border-0 shadow-sm">
                          <p className="text-2xl font-bold text-gray-900">$999</p>
                          <p className="text-xs text-gray-500 mt-1">Monthly Cost</p>
                        </Card>
                        <Card className="p-4 bg-white border-0 shadow-sm">
                          <p className="text-2xl font-bold text-gray-900">Dec 15</p>
                          <p className="text-xs text-gray-500 mt-1">Next Billing</p>
                        </Card>
                        <Card className="p-4 bg-white border-0 shadow-sm">
                          <p className="text-2xl font-bold text-gray-900">12</p>
                          <p className="text-xs text-gray-500 mt-1">Months Active</p>
                        </Card>
                        <Card className="p-4 bg-white border-0 shadow-sm">
                          <p className="text-2xl font-bold text-green-600">98%</p>
                          <p className="text-xs text-gray-500 mt-1">Uptime</p>
                        </Card>
                      </div>
                    </Card>

                    {/* Plan Type and Billing Cycle */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="plan_type" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Plan Type
                        </Label>
                        <select
                          id="plan_type"
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                        >
                          <option>Enterprise - $999/mo</option>
                          <option>Professional - $499/mo</option>
                          <option>Starter - $99/mo</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="billing_cycle" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Billing Cycle
                        </Label>
                        <select
                          id="billing_cycle"
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                        >
                          <option>Monthly</option>
                          <option>Quarterly</option>
                          <option>Yearly</option>
                        </select>
                      </div>
                    </div>

                    {/* Payment History */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
                      </div>
                      <Card className="p-4 border-0 shadow-sm">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-600">Nov 15, 2024</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-900">$999.00</span>
                              <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-600">Oct 15, 2024</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-900">$999.00</span>
                              <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-gray-600">Sep 15, 2024</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-900">$999.00</span>
                              <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Custom Price and Discount */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="custom_price" className="text-sm font-medium text-gray-700">
                          Custom Monthly Price
                        </Label>
                        <Input
                          id="custom_price"
                          type="number"
                          step="0.01"
                          defaultValue="0.00"
                          className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="discount_code" className="text-sm font-medium text-gray-700">
                          Discount Code
                        </Label>
                        <Input
                          id="discount_code"
                          placeholder="Enter discount code"
                          className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4">
                      <Button type="button" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 shadow-md">
                        <Save className="w-4 h-4 mr-2" />
                        Save Client
                      </Button>
                    </div>
                  </div>
                )}

                {/* Client's Quota Tab Content */}
                {activeTab === 'quota' && (
                  <div className="md:col-span-2 lg:col-span-3 space-y-6">
                    {/* Usage Metrics Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Usage Metrics</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Active Users */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                              <Users className="w-5 h-5 text-orange-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">Active Users</p>
                              <p className="text-xs text-gray-500">45 / 100 used</p>
                            </div>
                            <span className="text-sm font-semibold text-orange-600">45%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-orange-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                          </div>
                        </Card>

                        {/* Projects */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                              <Folder className="w-5 h-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">Projects</p>
                              <p className="text-xs text-gray-500">8 / 25 used</p>
                            </div>
                            <span className="text-sm font-semibold text-green-600">32%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: '32%' }}></div>
                          </div>
                        </Card>

                        {/* Storage */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                              <Database className="w-5 h-5 text-purple-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">Storage</p>
                              <p className="text-xs text-gray-500">234GB / 500GB used</p>
                            </div>
                            <span className="text-sm font-semibold text-purple-600">47%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-purple-500 h-2 rounded-full" style={{ width: '47%' }}></div>
                          </div>
                        </Card>

                        {/* API Calls */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <RefreshCw className="w-5 h-5 text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">API Calls</p>
                              <p className="text-xs text-gray-500">15420 / 50000 used</p>
                            </div>
                            <span className="text-sm font-semibold text-red-600">31%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-red-500 h-2 rounded-full" style={{ width: '31%' }}></div>
                          </div>
                        </Card>

                        {/* Data Processing */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                              <Lock className="w-5 h-5 text-orange-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">Data Processing</p>
                              <p className="text-xs text-gray-500">78GB/day / 100GB/day used</p>
                            </div>
                            <span className="text-sm font-semibold text-orange-600">78%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-orange-500 h-2 rounded-full" style={{ width: '78%' }}></div>
                          </div>
                        </Card>

                        {/* Compute Hours */}
                        <Card className="p-4 border-0 shadow-sm">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                              <Activity className="w-5 h-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">Compute Hours</p>
                              <p className="text-xs text-gray-500">156hrs / 500hrs used</p>
                            </div>
                            <span className="text-sm font-semibold text-green-600">31%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: '31%' }}></div>
                          </div>
                        </Card>
                      </div>
                    </div>

                    {/* Custom Quota Limits Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Custom Quota Limits</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="max_users" className="text-sm font-medium text-gray-700">
                            Maximum Users
                          </Label>
                          <Input
                            id="max_users"
                            type="number"
                            defaultValue="100"
                            className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="max_projects" className="text-sm font-medium text-gray-700">
                            Maximum Projects
                          </Label>
                          <Input
                            id="max_projects"
                            type="number"
                            defaultValue="25"
                            className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="storage_limit" className="text-sm font-medium text-gray-700">
                            Storage Limit (GB)
                          </Label>
                          <Input
                            id="storage_limit"
                            type="number"
                            defaultValue="500"
                            className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="monthly_api_calls" className="text-sm font-medium text-gray-700">
                            Monthly API Calls
                          </Label>
                          <Input
                            id="monthly_api_calls"
                            type="number"
                            defaultValue="50000"
                            className="border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Usage Alerts Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Usage Alerts</h3>
                      <Card className="p-4 border-0 shadow-sm">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">Alert at 80% usage</p>
                                <p className="text-xs text-gray-500">Get notified when usage reaches 80%</p>
                              </div>
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Active</Badge>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">Critical alert at 95% usage</p>
                                <p className="text-xs text-gray-500">Get notified when usage reaches 95%</p>
                              </div>
                            </div>
                            <Badge className="bg-red-100 text-red-800 border-red-200">Active</Badge>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4">
                      <Button type="button" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 shadow-md">
                        <Save className="w-4 h-4 mr-2" />
                        Save Client
                      </Button>
                    </div>
                  </div>
                )}
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
                  <p className="text-2xl font-bold text-green-600">{tenants.filter(t => t.is_active !== false).length}</p>
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
          {filteredTenants.map((client) => {
            const isInactive = client.is_active === false;
            return (
            <Card key={client.id} className={`border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group ${isInactive ? 'opacity-60 bg-gray-100/80' : 'bg-white'}`}>
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
                      <p className="text-sm text-gray-500">{client.primary_domain}</p>
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
                        <DropdownMenuItem className="cursor-pointer" onSelect={() => handleEditClient(client.id)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Client
                        </DropdownMenuItem>
                        {isInactive ? (
                          <DropdownMenuItem className="cursor-pointer text-green-600 focus:text-green-700" onSelect={() => handleReactivate(client.id)}>
                            <RotateCcw className="w-4 h-4 mr-2" /> Reactivate Client
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="cursor-pointer text-red-600" onSelect={() => handleDelete(client.id)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Client
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="w-4 h-4 mr-2" />
                    <span>{client.primary_domain}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>Schema: {client.schema_name}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="w-4 h-4 mr-2" />
                    <span>
                      Users: {client.users_in_use}/{client.seats_allowed}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>Projects allowed: {client.project_cap}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-400">Created on: {new Date(client.created_on).toLocaleDateString()}</div>
                  <Badge className={`text-xs border ${isInactive ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                    {isInactive ? 'Inactive' : 'Active'}
                  </Badge>
                </div>
              </div>
            </Card>
            );
          })}
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
