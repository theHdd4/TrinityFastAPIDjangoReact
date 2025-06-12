import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { TENANTS_API, REGISTRY_API } from '@/lib/api';
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
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [form, setForm] = useState({
    name: '',
    schema_name: '',
    domain: '',
    seats_allowed: '',
    project_cap: '',
    apps_allowed: [] as number[],
  });

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Create Client</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input name="name" placeholder="Client Name" value={form.name} onChange={handleChange} />
              <Input
                name="schema_name"
                placeholder="Schema Name"
                value={form.schema_name}
                onChange={handleChange}
              />
              <Input name="domain" placeholder="Email Domain" value={form.domain} onChange={handleChange} />
              <Input
                name="seats_allowed"
                type="number"
                placeholder="Users Allowed"
                value={form.seats_allowed}
                onChange={handleChange}
              />
              <Input
                name="project_cap"
                type="number"
                placeholder="Projects Allowed"
                value={form.project_cap}
                onChange={handleChange}
              />
              <select
                name="apps_allowed"
                multiple
                value={form.apps_allowed.map(String)}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded p-2 text-sm"
              >
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button type="submit">Add Client</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tenants.map((t) => (
                <li
                  key={t.id}
                  className="border-b pb-1 last:border-none flex justify-between items-center"
                >
                  <span>
                    {t.name} – {t.domain}
                  </span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-red-600 hover:text-red-800"
                  >
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

export default Clients;
