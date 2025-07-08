const hostIp = import.meta.env.VITE_HOST_IP;
let backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN;

if (!backendOrigin) {
  if (hostIp) {
    backendOrigin = `http://${hostIp}:8000`;
  } else if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'trinity.quanmatrixai.com'
  ) {
    // When the site is served from the Cloudflare domain the APIs live on the
    // admin subdomain, so switch automatically unless overridden.
    backendOrigin = 'https://admin.quantmatrixai.com';
  } else if (typeof window !== 'undefined') {
    backendOrigin = window.location.origin.replace(/:8080$/, ':8000');
  } else {
    backendOrigin = 'http://localhost:8000';
  }
}

// When hosting at trinity.quanmatrixai.com configure Nginx to proxy `/api/` paths
// to the Django backend so the frontend and backend share the same origin. Set
// `VITE_BACKEND_ORIGIN` if the APIs live on a different domain.

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
