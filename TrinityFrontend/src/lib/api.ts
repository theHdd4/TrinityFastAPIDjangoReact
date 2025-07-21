const hostIp = import.meta.env.VITE_HOST_IP;
// When running the dev stack the frontend listens on port 8081 while
// Django/FASTAPI are published on 8003/8004/8005 respectively. Detect this
// scenario using the current browser port so the correct defaults are used when
// no explicit environment variables are provided.
const isDevStack =
  (typeof window !== 'undefined' && window.location.port === '8081') ||
  import.meta.env.VITE_FRONTEND_PORT === '8081';

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

console.log('Using backend origin', backendOrigin);

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

export const FEATURE_OVERVIEW_API =
  normalizeUrl(import.meta.env.VITE_FEATURE_OVERVIEW_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/feature-overview`;

export const TRINITY_AI_API =
  normalizeUrl(import.meta.env.VITE_TRINITY_AI_API) ||
  backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${aiPort}`);

export const LAB_ACTIONS_API = `${REGISTRY_API}/laboratory-actions`;

export const CLASSIFIER_API =
  normalizeUrl(import.meta.env.VITE_CLASSIFIER_API) ||
  `${backendOrigin.replace(new RegExp(`:${djangoPort}$`), `:${fastapiPort}`)}/api/classify`;
