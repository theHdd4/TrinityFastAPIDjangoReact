import { resolveTaskResponse } from './taskQueue';

const hostIp = import.meta.env.VITE_HOST_IP;
const isDevStack =
  (typeof window !== 'undefined' && window.location.port === '8081'); //||
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

// Detect protocol from current page (HTTPS or HTTP)
const getProtocol = () => {
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:' ? 'https:' : 'http:';
  }
  return 'http:';
};

const protocol = getProtocol();

// Helper function to check if hostname is a domain name (not an IP address)
const isDomainName = (hostname: string): boolean => {
  if (!hostname) return false;
  // Check if it's localhost or 127.0.0.1
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  // Check if it matches IP address pattern (IPv4: xxx.xxx.xxx.xxx)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipPattern.test(hostname)) return false;
  // If it contains letters or is not a valid IP, it's a domain name
  return true;
};

if (!backendOrigin) {
  if (hostIp) {
    // If accessing via localhost, use localhost for backend too (for cookie/session compatibility)
    if (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      backendOrigin = `${protocol}//${window.location.hostname}:${djangoPort}`;
    } else if (typeof window !== 'undefined' && isDomainName(window.location.hostname)) {
      // If accessing via domain name, use the same domain WITHOUT port (uses reverse proxy)
      // This makes usesProxy = true, which uses /admin/api prefix
      // Requests will go to: https://domain.com/admin/api/... (proxied by nginx to Django)
      backendOrigin = window.location.origin;
    } else {
      // Use IP address only when accessing via IP directly
      // Use the same protocol as the current page (HTTPS if page is HTTPS)
      backendOrigin = `${protocol}//${hostIp}:${djangoPort}`;
    }
  } else if (typeof window !== 'undefined') {
    // Check if accessing via domain name
    if (isDomainName(window.location.hostname)) {
      // Use same domain without port (reverse proxy)
      backendOrigin = window.location.origin;
    } else {
      // Use IP/port for direct access
      const regex = new RegExp(`:${frontendPort}$`);
      backendOrigin = window.location.origin.replace(regex, `:${djangoPort}`);
    }
  } else {
    backendOrigin = `http://localhost:${djangoPort}`;
  }
} else if (isDevStack && backendOrigin.endsWith(`:${frontendPort}`)) {
  backendOrigin = backendOrigin.replace(
    new RegExp(`:${frontendPort}$`),
    `:${djangoPort}`,
  );
}

// If accessing via localhost but backendOrigin uses IP, switch to localhost for cookie compatibility
if (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  backendOrigin && !backendOrigin.includes('localhost') && !backendOrigin.includes('127.0.0.1')) {
  // Replace IP address with localhost to ensure cookies work properly
  backendOrigin = backendOrigin.replace(/http:\/\/[\d.]+:/, `${protocol}//${window.location.hostname}:`);
}

// CRITICAL: If accessing via domain name, ALWAYS use the same domain (without port) for reverse proxy
// This overrides any hardcoded VITE_BACKEND_ORIGIN or IP-based configuration
if (typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  const isDomain = isDomainName(hostname);

  if (isDomain) {
    // Force use of domain without port to enable reverse proxy routing
    // This ensures requests go through nginx at /admin/api/... instead of direct IP:port
    const currentOrigin = window.location.origin;
    const oldBackendOrigin = backendOrigin;

    // ALWAYS override when accessing via domain - no conditions
    backendOrigin = currentOrigin;

    // Log the override for debugging
    if (oldBackendOrigin !== currentOrigin) {
      console.warn(`[API Config] DOMAIN ACCESS DETECTED: Overriding backendOrigin`);
      console.warn(`  From: ${oldBackendOrigin}`);
      console.warn(`  To: ${currentOrigin}`);
      console.warn(`  Hostname: ${hostname}`);
      console.warn(`  This enables reverse proxy routing via /admin/api/`);
    }
  }
}


const usesProxy = !backendOrigin.includes(`:${djangoPort}`);
const djangoPrefix = usesProxy ? '/admin/api' : '/api';

// Set `VITE_BACKEND_ORIGIN` if the APIs live on a different domain.

// Debug logging - always show in browser for troubleshooting
if (typeof window !== 'undefined') {
  console.log('[Trinity API] Resolved backend endpoints', {
    windowOrigin: window.location.origin,
    backendOrigin,
    fastapiOrigin: backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`),
    exhibitionApi: `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/exhibition`,
    laboratoryApi: `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/laboratory`,
    accountsApi: `${backendOrigin}${djangoPrefix}/accounts`,
    usesProxy,
    djangoPrefix,
    isDomain: isDomainName(window.location.hostname),
    hostname: window.location.hostname
  });
}

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

export const USECASES_API =
  normalizeUrl(import.meta.env.VITE_USECASES_API) ||
  `${backendOrigin}${djangoPrefix}/usecases`;

export const TRINITY_V1_ATOMS_API =
  normalizeUrl(import.meta.env.VITE_TRINITY_V1_ATOMS_API) ||
  `${backendOrigin}${djangoPrefix}`;

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

export const WORKFLOWS_API =
  normalizeUrl(import.meta.env.VITE_WORKFLOWS_API) ||
  `${backendOrigin}${djangoPrefix}/workflows`;

export const SIGNUPS_API =
  normalizeUrl(import.meta.env.VITE_SIGNUPS_API) ||
  `${backendOrigin}${djangoPrefix}/signups`;

export const VALIDATE_API =
  normalizeUrl(import.meta.env.VITE_VALIDATE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/data-upload-validate`;

export const EXHIBITION_API =
  normalizeUrl(import.meta.env.VITE_EXHIBITION_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/exhibition`;

export const SHARE_LINKS_API =
  normalizeUrl(import.meta.env.VITE_SHARE_LINKS_API) ||
  `${backendOrigin}${djangoPrefix}/share-links`;

export const DASHBOARD_API =
  normalizeUrl(import.meta.env.VITE_DASHBOARD_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/dashboard`;

export const IMAGES_API =
  normalizeUrl(import.meta.env.VITE_IMAGES_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/images`;

export const LABORATORY_PROJECT_STATE_API =
  normalizeUrl(import.meta.env.VITE_LABORATORY_PROJECT_STATE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/laboratory-project-state`;

export const EXHIBITION_PROJECT_STATE_API =
  normalizeUrl(import.meta.env.VITE_EXHIBITION_PROJECT_STATE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/exhibition-project-state`;

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

const normalizedAiBase = aiBase.replace(/\/?$/, '');
export const TRINITY_AI_API = normalizedAiBase.endsWith('/trinityai')
  ? normalizedAiBase
  : `${normalizedAiBase}/trinityai`;

export const INSIGHT_API = `${TRINITY_AI_API}/insights`;

export const LAB_ACTIONS_API = `${REGISTRY_API}/laboratory-actions`;

export const LABORATORY_API =
  normalizeUrl(import.meta.env.VITE_LABORATORY_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/laboratory`;

export const CLASSIFIER_API =
  normalizeUrl(import.meta.env.VITE_CLASSIFIER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/classify`;

export const DATAFRAME_OPERATIONS_API =
  import.meta.env.VITE_DATAFRAME_OPERATIONS_API || `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/dataframe-operations`;

export const BUILD_FEATURE_BASED_API =
  normalizeUrl(import.meta.env.VITE_BUILD_FEATURE_BASED_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/build-feature-based`;

export const CLUSTERING_API =
  normalizeUrl(import.meta.env.VITE_CLUSTERING_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/clustering`;


export const CHART_MAKER_API =
  normalizeUrl(import.meta.env.VITE_CHART_MAKER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/chart-maker`;

export const PIVOT_API =
  normalizeUrl(import.meta.env.VITE_PIVOT_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/pivot`;

export const UNPIVOT_API =
  normalizeUrl(import.meta.env.VITE_UNPIVOT_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/v1/atoms/unpivot`;

export const TASK_QUEUE_API =
  normalizeUrl(import.meta.env.VITE_TASK_QUEUE_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/task-queue`;

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

export const MOLECULES_API =
  normalizeUrl(import.meta.env.VITE_MOLECULES_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/molecules`;

export const CUSTOM_MOLECULES_API =
  normalizeUrl(import.meta.env.VITE_CUSTOM_MOLECULES_API) ||
  `${backendOrigin}${djangoPrefix}/custom-molecules`;

const shouldLogApiConfig =
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || import.meta.env.VITE_SHOW_API_DEBUG === 'true');

if (shouldLogApiConfig) {
  const fastapiOrigin = backendOrigin.replace(
    new RegExp(`:${djangoPort}$`),
    `:${fastapiPort}`,
  );

  console.info('[Trinity API] Resolved backend endpoints', {
    windowOrigin: window.location.origin,
    backendOrigin,
    fastapiOrigin,
    exhibitionApi: EXHIBITION_API,
    laboratoryApi: LABORATORY_API,
  });
}

// Signup API function
export const submitSignup = async (data: {
  first_name: string;
  last_name: string;
  email: string;
  institution_company: string;
}) => {
  const response = await fetch(`${SIGNUPS_API}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.email?.[0] || errorData.message || 'Signup failed');
  }

  return response.json();
};

// Growth Rates API functions
export const calculateFiscalGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  start_year?: number;
  run_id?: string;
}) => {
  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-fiscal-growth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const raw = await response.json();
  return resolveTaskResponse(raw);
};


export const calculateHalfYearlyGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  run_id?: string;
}) => {
  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-halfyearly-growth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const raw = await response.json();
  return resolveTaskResponse(raw);
};

export const calculateQuarterlyGrowth = async (params: {
  scope: string;
  combination: string;
  forecast_horizon: number;
  fiscal_start_month?: number;
  frequency?: string;
  run_id?: string;
}) => {
  const response = await fetch(`${AUTO_REGRESSIVE_API}/calculate-quarterly-growth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const raw = await response.json();
  return resolveTaskResponse(raw);
};
