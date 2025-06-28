import { createFileRoute } from '@tanstack/react-router';
import { FC, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';

const TestAuthPage: FC = () => {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const testLogin = async () => {
    setIsLoading(true);
    setResult('');

    try {
      console.log('🔐 Testing WebAuthn authentication...');
      
      // Step 1: Start WebAuthn authentication
      const beginResponse = await fetch('/api/auth/login/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!beginResponse.ok) {
        throw new Error(`HTTP ${beginResponse.status}: ${beginResponse.statusText}`);
      }

      const beginData = await beginResponse.json();
      console.log('📡 Server login/begin response:', beginData);
      
      const optionsResponse = beginData.options;
      console.log('🔑 WebAuthn options response:', JSON.stringify(optionsResponse, null, 2));
      
      // Extract the publicKey options for SimpleWebAuthn
      const publicKeyOptions = optionsResponse.publicKey || optionsResponse;
      console.log('🔑 Extracted publicKey options:', JSON.stringify(publicKeyOptions, null, 2));
      
      console.log('🆔 RP ID:', publicKeyOptions.rpId);
      console.log('🌍 Origin (expected):', window.location.origin);
      console.log('🔗 Allow credentials:', publicKeyOptions.allowCredentials);

      // Step 2: Use WebAuthn browser API to authenticate
      console.log('🔍 Calling startAuthentication with publicKey options...');
      const credential = await startAuthentication(publicKeyOptions);
      console.log('✅ WebAuthn credential received:', credential);

      // Step 3: Complete authentication with server
      console.log('🏁 Finishing authentication with server...');
      const finishResponse = await fetch('/api/auth/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential,
        }),
      });

      if (!finishResponse.ok) {
        throw new Error(`HTTP ${finishResponse.status}: ${finishResponse.statusText}`);
      }

      const finishData = await finishResponse.json();
      console.log('🎉 Authentication successful:', finishData);
      
      setResult(`✅ Success! User ID: ${finishData.user_id}, Username: ${finishData.username}`);

    } catch (error) {
      console.error('❌ WebAuthn authentication failed:', error);
      
      // Check if it's a WebAuthn specific error
      if (error && typeof error === 'object' && 'name' in error) {
        console.error('❌ WebAuthn error name:', (error as any).name);
        console.error('❌ WebAuthn error message:', (error as any).message);
        setResult(`❌ WebAuthn Error: ${(error as any).name} - ${(error as any).message}`);
      } else {
        setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">WebAuthn Test</h2>
          <p className="text-gray-400">Test passkey authentication</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <button
            onClick={testLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              'Test Login with Passkey'
            )}
          </button>

          {result && (
            <div className="mt-4 p-3 bg-gray-700 border border-gray-600 rounded-lg">
              <p className="text-white text-sm whitespace-pre-wrap">{result}</p>
            </div>
          )}

          <div className="mt-4 text-xs text-gray-400">
            <p>This page tests WebAuthn authentication directly.</p>
            <p>Check the browser console for detailed logs.</p>
            <p>Make sure you have a passkey registered first.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/test-auth')({
  component: TestAuthPage,
}); 