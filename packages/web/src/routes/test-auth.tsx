import { createFileRoute } from '@tanstack/react-router';
import { FC, useState } from 'react';
import { webAuthnService, WebAuthnUtils } from '../services/webauthn';

const TestAuthPage: FC = () => {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const testRegistration = async () => {
    setIsLoading(true);
    setResult('');

    try {
      console.log('🆕 Testing native WebAuthn registration...');
      
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

      // Step 2: Create credential using native WebAuthn
      const serverOptions = beginData.options.publicKey || beginData.options;
      const challenge = serverOptions.challenge;
      const user = serverOptions.user;

      if (!challenge || !user) {
        throw new Error('Invalid registration options from server');
      }

      const credential = await webAuthnService.register(
        challenge,
        user.id,
        user.name,
        user.displayName
      );
      console.log('🔑 Created credential with native WebAuthn:', credential);

      // Step 3: Convert credential to backend format
      const backendCredential = {
        id: credential.id,
        rawId: WebAuthnUtils.bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: WebAuthnUtils.bufferToBase64url(credential.response.clientDataJSON),
          attestationObject: credential.response.attestationObject 
            ? WebAuthnUtils.bufferToBase64url(credential.response.attestationObject)
            : undefined,
        },
        type: credential.type,
        clientExtensionResults: credential.clientExtensionResults || {},
        authenticatorAttachment: credential.authenticatorAttachment,
      };

      // Step 4: Finish registration
      const finishResponse = await fetch('/api/auth/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential: backendCredential,
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
      console.log('🔐 Testing native WebAuthn authentication...');
      
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

      // Step 2: Authenticate using native WebAuthn
      const serverOptions = beginData.options.publicKey || beginData.options;
      const challenge = serverOptions.challenge;

      if (!challenge) {
        throw new Error('Invalid authentication options from server');
      }

      console.log('🚀 Starting authentication with native WebAuthn...');
      const credential = await webAuthnService.authenticate(challenge);
      console.log('🎯 Authentication credential:', credential);

      // Step 3: Convert credential to backend format
      const backendCredential = {
        id: credential.id,
        rawId: WebAuthnUtils.bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: WebAuthnUtils.bufferToBase64url(credential.response.clientDataJSON),
          authenticatorData: credential.response.authenticatorData
            ? WebAuthnUtils.bufferToBase64url(credential.response.authenticatorData)
            : undefined,
          signature: credential.response.signature
            ? WebAuthnUtils.bufferToBase64url(credential.response.signature)
            : undefined,
          userHandle: credential.response.userHandle
            ? WebAuthnUtils.bufferToBase64url(credential.response.userHandle)
            : undefined,
        },
        type: credential.type,
        clientExtensionResults: credential.clientExtensionResults || {},
        authenticatorAttachment: credential.authenticatorAttachment,
      };

      // Step 4: Finish authentication
      const finishResponse = await fetch('/api/auth/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential: backendCredential,
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

  const testSupport = async () => {
    const support = webAuthnService.getBrowserInfo();
    const supportsResidentKeys = await webAuthnService.supportsResidentKeys();
    const hasCredentials = await webAuthnService.hasDiscoverableCredentials();

    setResult(`
🔧 WebAuthn Support Information:
• Browser: ${support.userAgent.split(' ').pop()}
• Platform: ${support.platform}
• WebAuthn Supported: ${support.webAuthnSupported ? '✅' : '❌'}
• Conditional Mediation: ${support.conditionalMediationSupported ? '✅' : '❌'}
• Platform Authenticator: ${support.platformAuthenticatorSupported ? '✅' : '❌'}
• Resident Keys: ${supportsResidentKeys ? '✅' : '❌'}
• Has Credentials: ${hasCredentials ? '✅' : '❌'}
• Origin: ${window.location.origin}
• RP ID: ${window.location.hostname}
    `.trim());
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Native WebAuthn Test & Debug
          </h1>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Native WebAuthn Configuration</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Implementation: Native browser WebAuthn APIs</li>
                <li>• Resident Keys: Required (enforced)</li>
                <li>• User Verification: Required</li>
                <li>• Attestation: Direct</li>
                <li>• Allow Credentials: Empty (discoverable)</li>
                <li>• Origin: {window.location.origin}</li>
                <li>• RP ID: {window.location.hostname}</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={testSupport}
                disabled={isLoading}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Test Support
              </button>

              <button
                onClick={testRegistration}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Test Registration
              </button>

              <button
                onClick={testLogin}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Test Login
              </button>

              <button
                onClick={clearCredentials}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Clear Credentials
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Testing...</span>
              </div>
            )}

            {result && (
              <div className="bg-gray-100 border rounded-md p-4">
                <h3 className="text-sm font-medium text-gray-800 mb-2">Result:</h3>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {result}
                </pre>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">Testing Notes</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Registration creates a resident key that should appear in your password manager</li>
                <li>• Login uses discoverable credentials (no username required)</li>
                <li>• Check browser console for detailed WebAuthn logs</li>
                <li>• Try logging out and back in to test the full flow</li>
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
