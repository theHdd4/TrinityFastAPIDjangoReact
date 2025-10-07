import { EXHIBITION_API } from '@/lib/api';

export interface ExhibitionCatalogueComponentPayload {
  type: string;
  title: string;
  label?: string;
  catalogue_id?: string;
}

export interface ExhibitionSkuPayload {
  id: string;
  title: string;
  details?: Record<string, any>;
  catalogue_components?: ExhibitionCatalogueComponentPayload[];
}

export interface ExhibitionFeatureOverviewPayload {
  atomId: string;
  cardId: string;
  components: {
    skuStatistics: boolean;
    trendAnalysis: boolean;
  };
  skus: ExhibitionSkuPayload[];
}

export interface ExhibitionConfigurationPayload {
  client_name: string;
  app_name: string;
  project_name: string;
  cards: any[];
  feature_overview?: ExhibitionFeatureOverviewPayload[];
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
