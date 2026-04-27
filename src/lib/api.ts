import { auth } from './firebase';

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_REGION = import.meta.env.VITE_FIREBASE_REGION || 'us-central1';

// In development, the vite proxy might still be used, but the prompt says 
// "Replace all calls from: /api/* To: https://<firebase-project-id>.cloudfunctions.net/api/*"
export const API_BASE_URL = import.meta.env.VITE_API_URL || (FIREBASE_PROJECT_ID
  ? `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/api`
  : '/api'); // Fallback if no project ID

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiClient<T = any>(endpoint: string, options: FetchOptions = {}): Promise<{ success: boolean; data?: T; error?: string; message?: string }> {
  const { requireAuth, headers, ...customConfig } = options;
  
  // Clean endpoint path, handle potential double slashes
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Use VITE_API_URL if we want an explicit override, else construct the cloud function URL
  const configHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (requireAuth !== false && auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      (configHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Error fetching auth token:', error);
    }
  }

  const config: RequestInit = {
    method: customConfig.body ? 'POST' : 'GET',
    ...customConfig,
    headers: configHeaders,
  };

  // Ensure path starts without /api since API_BASE_URL already includes it
  let requestPath = path.replace(/^\/api/, '');
  if (!requestPath.startsWith('/')) {
    requestPath = '/' + requestPath;
  }

  const url = `${API_BASE_URL}${requestPath}`;

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error(`API Client Error (${url}):`, error);
    throw error;
  }
}

