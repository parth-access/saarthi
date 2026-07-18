'use client';

import { useEffect, useState, useRef } from 'react';
import { auth, isFirebaseEnabled } from '../../lib/firebase/client';
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult, AuthError } from 'firebase/auth';

export default function AuthPopupPage() {
  const [status, setStatus] = useState<string>('Initializing secure connection...');
  const [error, setError] = useState<string | null>(null);
  const flowStarted = useRef(false);

  useEffect(() => {
    if (flowStarted.current) return;
    flowStarted.current = true;

    if (!isFirebaseEnabled) {
      setError('Firebase is not configured or enabled.');
      setStatus('');
      return;
    }

    const performSignIn = async () => {
      try {
        setStatus('Checking auth response...');
        const result = await getRedirectResult(auth);
        
        if (result) {
          setStatus('Authentication successful! Closing window...');
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential) {
            if (window.opener) {
              window.opener.postMessage(
                {
                  type: 'GOOGLE_SIGNIN_SUCCESS',
                  idToken: credential.idToken,
                  accessToken: credential.accessToken,
                },
                window.location.origin
              );
              setTimeout(() => {
                window.close();
              }, 800);
            } else {
              setError('No parent window found to send credentials.');
              setStatus('');
            }
          } else {
            setError('Could not retrieve credentials from redirect result.');
            setStatus('');
          }
        } else {
          // If no redirect result yet, start the redirect flow
          setStatus('Redirecting to Google Sign-In...');
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({
            prompt: 'select_account',
          });
          await signInWithRedirect(auth, provider);
        }
      } catch (err: any) {
        console.error('Error during Google Redirect Auth:', err);
        const authErr = err as AuthError;
        let errMsg = authErr.message || String(err);
        
        if (authErr.code === 'auth/web-storage-unsupported') {
          errMsg = 'Web storage or cookies are disabled. Please enable them to sign in.';
        }
        
        setError(errMsg);
        setStatus('');
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'GOOGLE_SIGNIN_ERROR',
              error: errMsg,
            },
            window.location.origin
          );
        }
      }
    };

    performSignIn();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 font-sans text-center">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
        {/* Modern minimalistic loading indicator */}
        {!error && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-xl font-medium text-gray-800 mb-2">Saarthi Google Authentication</h2>
            <p className="text-gray-500 text-sm">{status}</p>
          </div>
        )}

        {/* Polished error presentation */}
        {error && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-2xl font-bold mb-6">!</div>
            <h2 className="text-xl font-medium text-gray-800 mb-2">Sign-In Failed</h2>
            <p className="text-rose-500 text-sm max-w-xs mb-6">{error}</p>
            <button 
              onClick={() => window.close()} 
              className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
