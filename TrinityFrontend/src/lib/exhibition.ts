import { EXHIBITION_API, EXHIBITION_PROJECT_STATE_API } from '@/lib/api';

export interface ExhibitionComponentPayload {
  id: string;
  atomId?: string;
  title?: string;
  category?: string;
  color?: string;
  metadata?: Record<string, any>;
  manifest?: Record<string, any>;
  manifest_id?: string;
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

export interface ExhibitionManifestQuery extends ExhibitionConfigurationQuery {
  component_id: string;
}

export interface ExhibitionManifestResponse {
  component_id: string;
  manifest?: Record<string, any> | null;
  manifest_id?: string | null;
  metadata?: Record<string, any> | null;
  atom_id?: string | null;
  atom_name?: string | null;
  updated_at?: string;
}

export interface ExhibitionLayoutPayload {
  client_name: string;
  app_name: string;
  project_name: string;
  cards: any[];
  slide_objects: Record<string, any[]>;
}

export interface ExhibitionLayoutResponse extends ExhibitionLayoutPayload {
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

export async function fetchExhibitionManifest(
  params: ExhibitionManifestQuery,
): Promise<ExhibitionManifestResponse | null> {
  const search = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${EXHIBITION_API}/manifest?${search.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch exhibition manifest');
  }

  return response.json() as Promise<ExhibitionManifestResponse>;
}

export async function saveExhibitionLayout(payload: ExhibitionLayoutPayload): Promise<void> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: defaultHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  };

  const primaryResponse = await fetch(`${EXHIBITION_PROJECT_STATE_API}/save`, requestInit);

  if (primaryResponse.ok) {
    return;
  }

  if (![404, 405].includes(primaryResponse.status)) {
    const message = await primaryResponse.text();
    throw new Error(message || 'Failed to save exhibition layout');
  }

  const fallbackResponse = await fetch(`${EXHIBITION_API}/layout`, requestInit);
  if (!fallbackResponse.ok) {
    const message = await fallbackResponse.text();
    throw new Error(message || 'Failed to save exhibition layout');
  }
}

export async function fetchExhibitionLayout(
  params: ExhibitionConfigurationQuery,
): Promise<ExhibitionLayoutResponse | null> {
  const search = new URLSearchParams(params as Record<string, string>);
  const projectStateResponse = await fetch(`${EXHIBITION_PROJECT_STATE_API}?${search.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (projectStateResponse.ok) {
    return projectStateResponse.json() as Promise<ExhibitionLayoutResponse>;
  }

  if ([404, 405].includes(projectStateResponse.status)) {
    const fallbackResponse = await fetch(`${EXHIBITION_API}/layout?${search.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (fallbackResponse.status === 404) {
      return null;
    }

    if (!fallbackResponse.ok) {
      const message = await fallbackResponse.text();
      throw new Error(message || 'Failed to fetch exhibition layout');
    }

    return fallbackResponse.json() as Promise<ExhibitionLayoutResponse>;
  }

  const message = await projectStateResponse.text();
  throw new Error(message || 'Failed to fetch exhibition layout');
}
