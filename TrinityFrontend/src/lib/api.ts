const hostIp = import.meta.env.VITE_HOST_IP;
// When running the dev stack the frontend listens on port 8081 while
// Django/FASTAPI are published on 8003/8004/8005 respectively. Detect this
// scenario using the current browser port so the correct defaults are used when
// no explicit environment variables are provided.
// Also detect development environment by hostname, port, or environment variable
const isDevStack =
  (typeof window !== 'undefined' && window.location.port === '8081') ; //||
  // import.meta.env.VITE_FRONTEND_PORT === '8081' ||
  // (typeof window !== 'undefined' && window.location.hostname === '172.19.128.1') ||
  // (typeof window !== 'undefined' && window.location.port === '8080') ||
  // import.meta.env.VITE_ENVIRONMENT === 'development';

const djangoPort =
  import.meta.env.VITE_DJANGO_PORT || (isDevStack ? '8003' : '8000');
const fastapiPort =
  import.meta.env.VITE_FASTAPI_PORT || (isDevStack ? '8004' : '8001');
const aiPort = import.meta.env.VITE_AI_PORT || (isDevStack ? '8005' : '8002');
const frontendPort =
  import.meta.env.VITE_FRONTEND_PORT || (isDevStack ? '8081' : '8080');
let backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN;

if (!backendOrigin) {
  if (hostIp) {
    backendOrigin = `http://${hostIp}:${djangoPort}`;
  } else if (typeof window !== 'undefined') {
    const regex = new RegExp(`:${frontendPort}$`);
    backendOrigin = window.location.origin.replace(regex, `:${djangoPort}`);
  } else {
    backendOrigin = `http://localhost:${djangoPort}`;
  }
} else if (isDevStack && backendOrigin.endsWith(`:${frontendPort}`)) {
  // When the dev stack is running the frontend uses port 8081 while
  // Django listens on 8003. Avoid hitting the nginx container by correcting
  // the port if the backend origin matches the frontend port.
  backendOrigin = backendOrigin.replace(
    new RegExp(`:${frontendPort}$`),
    `:${djangoPort}`,
  );
}

// When hosting through Traefik the Django service is exposed under the
// `/admin` prefix while direct container access uses the plain `/api` paths.
// Detect which form to use based on the backend origin. If it points at the
// container port `8000` we assume no proxy is stripping `/admin`.

const usesProxy = !backendOrigin.includes(`:${djangoPort}`);
const djangoPrefix = usesProxy ? '/admin/api' : '/api';

// Set `VITE_BACKEND_ORIGIN` if the APIs live on a different domain.

// console.log('🔧 API Configuration Debug:', {
//   hostIp,
//   isDevStack,
//   djangoPort,
//   fastapiPort,
//   aiPort,
//   frontendPort,
//   backendOrigin,
//   windowLocation: typeof window !== 'undefined' ? `${window.location.hostname}:${window.location.port}` : 'server-side',
//   buildModelApi: `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/build-model-feature-based`
// });
// console.log('Using backend origin', backendOrigin);

const normalizeUrl = (url?: string) => {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
};

export const ACCOUNTS_API =
  normalizeUrl(import.meta.env.VITE_ACCOUNTS_API) ||
  `${backendOrigin}${djangoPrefix}/accounts`;

export const REGISTRY_API =
  normalizeUrl(import.meta.env.VITE_REGISTRY_API) ||
  `${backendOrigin}${djangoPrefix}/registry`;

export const TENANTS_API =
  normalizeUrl(import.meta.env.VITE_TENANTS_API) ||
  `${backendOrigin}${djangoPrefix}/tenants`;

export const TEXT_API =
  normalizeUrl(import.meta.env.VITE_TEXT_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/t`;

export const CARD_API =
  normalizeUrl(import.meta.env.VITE_CARD_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api`;

export const SUBSCRIPTIONS_API =
  normalizeUrl(import.meta.env.VITE_SUBSCRIPTIONS_API) ||
  `${backendOrigin}${djangoPrefix}/subscriptions`;

export const VALIDATE_API =
  normalizeUrl(import.meta.env.VITE_VALIDATE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/data-upload-validate`;

export const CONCAT_API =
  normalizeUrl(import.meta.env.VITE_CONCAT_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/concat`;

export const MERGE_API =
  normalizeUrl(import.meta.env.VITE_MERGE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/merge`;

export const SESSION_API =
  normalizeUrl(import.meta.env.VITE_SESSION_API) ||
  `${backendOrigin}${djangoPrefix}/session`;

export const FEATURE_OVERVIEW_API =
  normalizeUrl(import.meta.env.VITE_FEATURE_OVERVIEW_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/feature-overview`;

export const SCOPE_SELECTOR_API =
  normalizeUrl(import.meta.env.VITE_SCOPE_SELECTOR_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/scope-selector`;

export const CREATECOLUMN_API =
  import.meta.env.VITE_CREATECOLUMN_API || `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/create-column`;



export const GROUPBY_API =
  import.meta.env.VITE_GROUPBY_API || `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/groupby`;


let aiBase = normalizeUrl(import.meta.env.VITE_TRINITY_AI_API);
if (!aiBase) {
  aiBase = backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${aiPort}`);
}
// Ensure the base URL ends with the `/trinityai` prefix exactly once
const normalizedAiBase = aiBase.replace(/\/?$/, '');
export const TRINITY_AI_API = normalizedAiBase.endsWith('/trinityai')
  ? normalizedAiBase
  : `${normalizedAiBase}/trinityai`;

export const INSIGHT_API = `${TRINITY_AI_API}/insights`;

export const LAB_ACTIONS_API = `${REGISTRY_API}/laboratory-actions`;

export const CLASSIFIER_API =
  normalizeUrl(import.meta.env.VITE_CLASSIFIER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/classify`;

export const DATAFRAME_OPERATIONS_API =
  import.meta.env.VITE_DATAFRAME_OPERATIONS_API || `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/dataframe-operations`;

export const CLUSTERING_API =
  normalizeUrl(import.meta.env.VITE_CLUSTERING_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/clustering`;


export const CHART_MAKER_API =
  normalizeUrl(import.meta.env.VITE_CHART_MAKER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/chart-maker`;

export const BUILD_MODEL_API =
  normalizeUrl(import.meta.env.VITE_BUILD_MODEL_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/build-model-feature-based`;

export const AUTO_REGRESSIVE_API =
  normalizeUrl(import.meta.env.VITE_AUTO_REGRESSIVE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/build-autoregressive`;
export const SCENARIO_PLANNER_API =
  normalizeUrl(import.meta.env.VITE_SCENARIO_PLANNER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/scenario`;
 
export const SELECT_API =
  normalizeUrl(import.meta.env.VITE_SELECT_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/select`;

export const CORRELATION_API =
  normalizeUrl(import.meta.env.VITE_CORRELATION_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/correlation`;

export const EXPLORE_API =
  normalizeUrl(import.meta.env.VITE_EXPLORE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/explore`;

export const EVALUATE_API =
  normalizeUrl(import.meta.env.VITE_EVALUATE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/evaluate`;

// Growth Rates API functions
export const calculateFiscalGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  start_year?: number;
  run_id?: string;  // Add run_id parameter
}) => {
  const formData = new FormData();
  formData.append('scope', params.scope);
  formData.append('combination', params.combination);
  formData.append('forecast_horizon', params.forecast_horizon.toString());
  formData.append('fiscal_start_month', (params.fiscal_start_month || 1).toString());
  formData.append('frequency', params.frequency || 'M');
  formData.append('start_year', (params.start_year || 2017).toString());
  
  // Add run_id if provided
  if (params.run_id) {
    formData.append('run_id', params.run_id);
  }

  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-fiscal-growth`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const calculateHalfYearlyGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  run_id?: string;  // Add run_id parameter
}) => {
  const formData = new FormData();
  formData.append('scope', params.scope);
  formData.append('combination', params.combination);
  formData.append('forecast_horizon', params.forecast_horizon.toString());
  formData.append('fiscal_start_month', (params.fiscal_start_month || 1).toString());
  formData.append('frequency', params.frequency || 'M');
  
  // Add run_id if provided
  if (params.run_id) {
    formData.append('run_id', params.run_id);
  }

  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-halfyearly-growth`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const calculateQuarterlyGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  run_id?: string;  // Add run_id parameter
}) => {
  const formData = new FormData();
  formData.append('scope', params.scope);
  formData.append('combination', params.combination);
  formData.append('forecast_horizon', params.forecast_horizon.toString());
  formData.append('fiscal_start_month', (params.fiscal_start_month || 1).toString());
  formData.append('frequency', params.frequency || 'M');
  
  // Add run_id if provided
  if (params.run_id) {
    formData.append('run_id', params.run_id);
  }

  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-quarterly-growth`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};
