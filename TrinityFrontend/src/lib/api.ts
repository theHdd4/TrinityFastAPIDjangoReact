const hostIp = import.meta.env.VITE_HOST_IP;
let backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN;

if (!backendOrigin) {
  if (hostIp) {
    backendOrigin = `http://${hostIp}:8000`;
  } else if (typeof window !== 'undefined') {
    backendOrigin = window.location.origin.replace(/:8080$/, ':8000');
  } else {
    backendOrigin = 'http://localhost:8000';
  }
}

// When hosting at trinity.quantmatrixai.com configure the reverse proxy so
// `/admin/` requests reach the Django backend and `/app/` goes to FastAPI.
// Set
// `VITE_BACKEND_ORIGIN` if the APIs live on a different domain.

console.log('Using backend origin', backendOrigin);

export const ACCOUNTS_API =
  import.meta.env.VITE_ACCOUNTS_API || `${backendOrigin}/admin/api/accounts`;

export const REGISTRY_API =
  import.meta.env.VITE_REGISTRY_API || `${backendOrigin}/admin/api/registry`;

export const TENANTS_API =
  import.meta.env.VITE_TENANTS_API || `${backendOrigin}/admin/api/tenants`;

export const TEXT_API =
  import.meta.env.VITE_TEXT_API || `${backendOrigin.replace(/:8000$/, ':8001')}/app/t`;

export const CARD_API =
  import.meta.env.VITE_CARD_API || `${backendOrigin.replace(/:8000$/, ':8001')}/app`;

export const SUBSCRIPTIONS_API =
  import.meta.env.VITE_SUBSCRIPTIONS_API || `${backendOrigin}/admin/api/subscriptions`;

export const VALIDATE_API =
  import.meta.env.VITE_VALIDATE_API || `${backendOrigin.replace(/:8000$/, ':8001')}/app/data-upload-validate`;

export const FEATURE_OVERVIEW_API =
  import.meta.env.VITE_FEATURE_OVERVIEW_API || `${backendOrigin.replace(/:8000$/, ':8001')}/app/feature-overview`;

export const TRINITY_AI_API =
  import.meta.env.VITE_TRINITY_AI_API || backendOrigin.replace(/:8000$/, ':8002');

export const LAB_ACTIONS_API = `${REGISTRY_API}/laboratory-actions`;
