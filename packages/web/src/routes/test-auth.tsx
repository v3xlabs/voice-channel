import { createFileRoute } from '@tanstack/react-router';
import { FC, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

const TestAuthPage: FC = () => {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const testRegistration = async () => {
    setIsLoading(true);
    setResult('');

    try {
      console.log('🆕 Testing WebAuthn registration...');
      
      // Step 1: Start WebAuthn registration
      const beginResponse = await fetch('/api/auth/register/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: 'Test User ' + Date.now(),
        }),
      });

      if (!beginResponse.ok) {
        throw new Error(`Registration begin failed: ${beginResponse.status}`);
      }

      const beginData = await beginResponse.json();
      console.log('📡 Registration begin response:', beginData);

      // Step 2: Create credential
      const credential = await startRegistration(beginData.options);
      console.log('🔑 Created credential:', credential);

      // Step 3: Finish registration
      const finishResponse = await fetch('/api/auth/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential: credential,
        }),
      });

      if (!finishResponse.ok) {
        throw new Error(`Registration finish failed: ${finishResponse.status}`);
      }

      const finishData = await finishResponse.json();
      console.log('🎉 Registration completed:', finishData);

      setResult(`✅ Registration successful! User ID: ${finishData.user_id}`);
    } catch (error) {
      console.error('❌ Registration failed:', error);
      setResult(`❌ Registration failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

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
        throw new Error(`Login begin failed: ${beginResponse.status}`);
      }

      const beginData = await beginResponse.json();
      console.log('📡 Login begin response:', beginData);
      console.log('🔍 Authentication options:', JSON.stringify(beginData.options, null, 2));

      // Check for resident key configuration
      const options = beginData.options;
      if (options.publicKey) {
        console.log('🔑 RP ID:', options.publicKey.rpId);
        console.log('🔗 Allow credentials:', options.publicKey.allowCredentials);
        console.log('🎭 Mediation:', options.mediation);
        console.log('✅ User verification:', options.publicKey.userVerification);
      }

      // Step 2: Authenticate
      console.log('🚀 Starting authentication with browser...');
      const credential = await startAuthentication(beginData.options);
      console.log('🎯 Authentication credential:', credential);

      // Step 3: Finish authentication
      const finishResponse = await fetch('/api/auth/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential: credential,
        }),
      });

      if (!finishResponse.ok) {
        throw new Error(`Login finish failed: ${finishResponse.status}`);
      }

      const finishData = await finishResponse.json();
      console.log('🎉 Authentication completed:', finishData);

      setResult(`✅ Authentication successful! User ID: ${finishData.user_id}`);
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      setResult(`❌ Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearCredentials = async () => {
    if (confirm('This will clear all credentials from your browser. Continue?')) {
      // Note: There's no standard way to clear WebAuthn credentials from JavaScript
      // This is just for testing - users would need to manually remove from their password manager
      setResult('ℹ️ Please manually remove credentials from your password manager/browser settings');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            WebAuthn Test & Debug
          </h1>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Current Configuration</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Origin: {window.location.origin}</li>
                <li>• RP ID: localhost</li>
                <li>• Expected: Resident keys with discoverable credentials</li>
                <li>• Browser: {navigator.userAgent.split(' ').pop()}</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={testRegistration}
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? 'Testing...' : '🆕 Test Registration'}
              </button>

              <button
                onClick={testLogin}
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {isLoading ? 'Testing...' : '🔐 Test Login'}
              </button>

              <button
                onClick={clearCredentials}
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
              >
                🗑️ Clear Credentials
              </button>
            </div>

            {result && (
              <div className={`mt-6 p-4 rounded-md ${
                result.includes('✅') 
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : result.includes('❌')
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
              }`}>
                <pre className="whitespace-pre-wrap text-sm font-mono">{result}</pre>
              </div>
            )}

            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">Debugging Tips</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>1. Open browser console to see detailed logs</li>
                <li>2. Try registration first, then login after a few seconds</li>
                <li>3. Check if your password manager shows the new credential</li>
                <li>4. Try refreshing the page and testing login again</li>
                <li>5. Ensure you're using the same browser/device for both operations</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/test-auth')({
  component: TestAuthPage,
}); 