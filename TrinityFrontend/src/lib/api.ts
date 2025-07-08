const hostIp = import.meta.env.VITE_HOST_IP;
let backendOrigin =
  import.meta.env.VITE_BACKEND_ORIGIN ||
  (hostIp
    ? `http://${hostIp}:8000`
    : typeof window !== 'undefined'
      ? window.location.origin.replace(/:8080$/, ':8000')
      : 'http://localhost:8000');

// When hosting at quantmatrixai.com without `VITE_BACKEND_ORIGIN`, Nginx should
// proxy `/api/` paths to the backend so we keep the origin unchanged to avoid
// CORS issues. Set `VITE_BACKEND_ORIGIN` if using a separate domain.

console.log('Using backend origin', backendOrigin);

export const ACCOUNTS_API =
  import.meta.env.VITE_ACCOUNTS_API || `${backendOrigin}/api/accounts`;

export const REGISTRY_API =
  import.meta.env.VITE_REGISTRY_API || `${backendOrigin}/api/registry`;

export const TENANTS_API =
  import.meta.env.VITE_TENANTS_API || `${backendOrigin}/api/tenants`;

export const TEXT_API =
  import.meta.env.VITE_TEXT_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api/t`;

export const CARD_API =
  import.meta.env.VITE_CARD_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api`;

export const SUBSCRIPTIONS_API =
  import.meta.env.VITE_SUBSCRIPTIONS_API || `${backendOrigin}/api/subscriptions`;

export const VALIDATE_API =
  import.meta.env.VITE_VALIDATE_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api/data-upload-validate`;

export const FEATURE_OVERVIEW_API =
  import.meta.env.VITE_FEATURE_OVERVIEW_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api/feature-overview`;

export const TRINITY_AI_API =
  import.meta.env.VITE_TRINITY_AI_API || backendOrigin.replace(/:8000$/, ':8002');

export const LAB_ACTIONS_API = `${REGISTRY_API}/laboratory-actions`;
