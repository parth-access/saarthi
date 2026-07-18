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

    const sendSuccessToParent = (idToken: string, accessToken?: string) => {
      const payload = {
        type: 'GOOGLE_SIGNIN_SUCCESS',
        idToken,
        accessToken,
        timestamp: Date.now(),
      };

      let sent = false;

      // A. Try postMessage
      if (window.opener) {
        try {
          window.opener.postMessage(payload, '*');
          sent = true;
          console.log('Sent success via postMessage');
        } catch (e) {
          console.error('Failed to postMessage to opener:', e);
        }
      }

      // B. Try BroadcastChannel
      try {
        const bc = new BroadcastChannel('saarthi_auth');
        bc.postMessage(payload);
        bc.close();
        sent = true;
        console.log('Sent success via BroadcastChannel');
      } catch (e) {
        console.error('BroadcastChannel failed:', e);
      }

      // C. Try localStorage
      try {
        localStorage.setItem('saarthi_auth_success', JSON.stringify(payload));
        sent = true;
        console.log('Sent success via localStorage');
      } catch (e) {
        console.error('localStorage failed:', e);
      }

      return sent;
    };

    const sendErrorToParent = (errorMsg: string) => {
      const payload = {
        type: 'GOOGLE_SIGNIN_ERROR',
        error: errorMsg,
        timestamp: Date.now(),
      };

      // A. Try postMessage
      if (window.opener) {
        try {
          window.opener.postMessage(payload, '*');
        } catch {
          // Ignore
        }
      }

      // B. Try BroadcastChannel
      try {
        const bc = new BroadcastChannel('saarthi_auth');
        bc.postMessage(payload);
        bc.close();
      } catch {
        // Ignore
      }

      // C. Try localStorage
      try {
        localStorage.setItem('saarthi_auth_error', JSON.stringify(payload));
      } catch {
        // Ignore
      }
    };

    const performSignIn = async () => {
      try {
        setStatus('Checking auth response...');
        const result = await getRedirectResult(auth);
        
        if (result) {
          setStatus('Authentication successful! Closing window...');
          const credential = GoogleAuthProvider.credentialFromResult(result);
          
          if (credential && credential.idToken) {
            sendSuccessToParent(credential.idToken, credential.accessToken || undefined);
            setTimeout(() => {
              window.close();
            }, 800);
          } else {
            // Even if credentialFromResult is null or lacks idToken,
            // we can try to get the ID token from the user object directly!
            // This is extremely robust: result.user.getIdToken() is guaranteed to return a fresh Firebase ID Token.
            if (result.user) {
              console.log('Retrieving ID token directly from result.user...');
              const idToken = await result.user.getIdToken(true);
              sendSuccessToParent(idToken, undefined);
              setTimeout(() => {
                window.close();
              }, 800);
            } else {
              setError('Could not retrieve credentials or user from redirect result.');
              setStatus('');
            }
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
      } catch (err: unknown) {
        console.error('Error during Google Redirect Auth:', err);
        const authErr = err as AuthError;
        let errMsg = authErr.message || String(err);
        
        if (authErr.code === 'auth/web-storage-unsupported') {
          errMsg = 'Web storage or cookies are disabled. Please enable them to sign in.';
        }
        
        setError(errMsg);
        setStatus('');
        sendErrorToParent(errMsg);
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
