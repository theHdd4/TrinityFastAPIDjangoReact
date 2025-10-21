import { EXHIBITION_API, EXHIBITION_PROJECT_STATE_API } from '@/lib/api';

const logExhibitionRequest = (action: string, url: string, init: RequestInit) => {
  if (typeof window === 'undefined') return;

  const { method = 'GET', credentials } = init;
  const hasBody = Boolean(init.body);

  console.info(`[Exhibition API] ${action}`, {
    url,
    method,
    credentials,
    hasBody,
    origin: window.location.origin,
  });
};

const logExhibitionFailure = (action: string, error: unknown) => {
  if (typeof window === 'undefined') return;
  console.error(`[Exhibition API] ${action} failed`, error);
};

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
  const requestUrl = `${EXHIBITION_API}/configuration`;
  const requestInit: RequestInit = {
    method: 'POST',
    headers: defaultHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  };

  logExhibitionRequest('Saving exhibition configuration', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (!response.ok) {
    const message = await response.text();
    logExhibitionFailure('Saving exhibition configuration', message);
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
  const requestUrl = `${EXHIBITION_API}/configuration?${search.toString()}`;
  const requestInit: RequestInit = {
    method: 'GET',
    credentials: 'include',
  };

  logExhibitionRequest('Fetching exhibition configuration', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    logExhibitionFailure('Fetching exhibition configuration', message);
    throw new Error(message || 'Failed to fetch exhibition configuration');
  }

  return response.json() as Promise<ExhibitionConfigurationResponse>;
}

export async function fetchExhibitionManifest(
  params: ExhibitionManifestQuery,
): Promise<ExhibitionManifestResponse | null> {
  const search = new URLSearchParams(params as Record<string, string>);
  const requestUrl = `${EXHIBITION_API}/manifest?${search.toString()}`;
  const requestInit: RequestInit = {
    method: 'GET',
    credentials: 'include',
  };

  logExhibitionRequest('Fetching exhibition manifest', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    logExhibitionFailure('Fetching exhibition manifest', message);
    throw new Error(message || 'Failed to fetch exhibition manifest');
  }

  return response.json() as Promise<ExhibitionManifestResponse>;
}

export async function saveExhibitionLayout(payload: ExhibitionLayoutPayload): Promise<void> {
  const requestUrl = `${EXHIBITION_PROJECT_STATE_API}/save`;
  const requestInit: RequestInit = {
    method: 'POST',
    headers: defaultHeaders,
    credentials: 'include',
    body: JSON.stringify({ ...payload, mode: 'exhibition' }),
  };

  logExhibitionRequest('Saving exhibition layout', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (!response.ok) {
    const message = await response.text();
    logExhibitionFailure('Saving exhibition layout', message);
    throw new Error(message || 'Failed to save exhibition layout');
  }

  if (typeof window !== 'undefined') {
    console.info('[Exhibition API] Layout saved successfully');
  }
}

export async function fetchExhibitionLayout(
  params: ExhibitionConfigurationQuery,
): Promise<ExhibitionLayoutResponse | null> {
  const search = new URLSearchParams(params as Record<string, string>);
  const requestUrl = `${EXHIBITION_API}/layout?${search.toString()}`;
  const requestInit: RequestInit = {
    method: 'GET',
    credentials: 'include',
  };

  logExhibitionRequest('Fetching exhibition layout', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    logExhibitionFailure('Fetching exhibition layout', message);
    throw new Error(message || 'Failed to fetch exhibition layout');
  }

  return response.json() as Promise<ExhibitionLayoutResponse>;
}
