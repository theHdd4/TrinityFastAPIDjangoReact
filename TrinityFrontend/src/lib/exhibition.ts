import { EXHIBITION_API } from '@/lib/api';

export interface VisualizationManifest {
  manifestId: string;
  componentId: string;
  atomId?: string;
  view?: string;
  createdAt?: string;
  thumbnail?: string | null;
  vizSpec?: Record<string, any>;
  chartData?: Record<string, any>;
  skuData?: Record<string, any>;
}

export interface ExhibitionComponentPayload {
  id: string;
  atomId?: string;
  title?: string;
  category?: string;
  color?: string;
  metadata?: Record<string, any>;
  manifestRef?: string;
  manifest_ref?: string;
  visualisationManifest?: VisualizationManifest;
  visualisation_manifest?: VisualizationManifest;
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
