import { EXHIBITION_API } from '@/lib/api';

export interface ExhibitionComponentPayload {
  id: string;
  atomId?: string;
  title?: string;
  category?: string;
  color?: string;
  metadata?: Record<string, any>;
  visualizationManifest?: Record<string, any>;
  visualization_manifest?: Record<string, any>;
  thumbnail?: string;
  skuDetails?: Record<string, any>;
  sku_details?: Record<string, any>;
}

export interface ExhibitionAtomPayload {
  id: string;
  atom_name: string;
  exhibited_components: ExhibitionComponentPayload[];
}

export interface ExhibitionConfigurationPayload {
  client_name: string;
  app_name: string;
  project_name: string;
  atoms: ExhibitionAtomPayload[];
}

export interface ExhibitionConfigurationResponse extends ExhibitionConfigurationPayload {
  updated_at?: string;
}

export interface ExhibitionComponentManifestResponse {
  client_name: string;
  app_name: string;
  project_name: string;
  atom_id: string;
  atom_name: string;
  component: ExhibitionComponentPayload;
  updated_at?: string;
}

const defaultHeaders = {
  'Content-Type': 'application/json',
};

export async function saveExhibitionConfiguration(payload: ExhibitionConfigurationPayload): Promise<void> {
  const response = await fetch(`${EXHIBITION_API}/configuration`, {
    method: 'POST',
    headers: defaultHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to save exhibition configuration');
  }
}

export interface ExhibitionConfigurationQuery {
  client_name: string;
  app_name: string;
  project_name: string;
}

export async function fetchExhibitionConfiguration(
  params: ExhibitionConfigurationQuery,
): Promise<ExhibitionConfigurationResponse | null> {
  const search = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${EXHIBITION_API}/configuration?${search.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch exhibition configuration');
  }

  return response.json() as Promise<ExhibitionConfigurationResponse>;
}

export interface ExhibitionComponentManifestQuery extends ExhibitionConfigurationQuery {
  component_id: string;
}

export async function fetchExhibitionComponentManifest(
  params: ExhibitionComponentManifestQuery,
): Promise<ExhibitionComponentManifestResponse> {
  const { component_id, ...context } = params;
  const search = new URLSearchParams(context as Record<string, string>);
  const response = await fetch(`${EXHIBITION_API}/catalogue/${component_id}?${search.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch exhibition component manifest');
  }

  return response.json() as Promise<ExhibitionComponentManifestResponse>;
}
