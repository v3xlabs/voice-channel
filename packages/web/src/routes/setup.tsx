import { createFileRoute } from '@tanstack/react-router';
import { FC, useState, useEffect } from 'react';
import { Shield, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { webAuthnService, WebAuthnUtils } from '../services/webauthn';

interface SetupStatus {
  setup_required: boolean;
  user_count: number;
  message: string;
}

const SetupPage: FC = () => {
  const navigate = useNavigate();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Check setup status
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await fetch('/setup/status');
        const data = await response.json();
        setSetupStatus(data);
        
        // If setup is not required, redirect to home
        if (!data.setup_required) {
          navigate({ to: '/' });
          return;
        }
      } catch (error) {
        console.error('Failed to check setup status:', error);
        setError('Failed to connect to server. Please ensure the server is running.');
      } finally {
        setIsLoading(false);
      }
    };

    checkSetupStatus();
  }, [navigate]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsCreatingAdmin(true);
    setError('');

    try {
      console.log('🚀 Starting bootstrap admin creation...');
      
      // Step 1: Start WebAuthn registration
      const beginResponse = await fetch('/setup/register/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });

      if (!beginResponse.ok) {
        const errorData = await beginResponse.json();
        throw new Error(errorData.message || 'Failed to start registration');
      }

      const beginData = await beginResponse.json();
      console.log('📡 Bootstrap begin response:', beginData);

      // Step 2: Create WebAuthn credential using native WebAuthn
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
      console.log('✅ Native WebAuthn credential created for admin');

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
      const finishResponse = await fetch('/setup/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: beginData.challenge_id,
          credential: backendCredential,
        }),
      });

      if (!finishResponse.ok) {
        const errorData = await finishResponse.json();
        throw new Error(errorData.message || 'Failed to complete registration');
      }

             const finishData = await finishResponse.json();
       console.log('🎉 Bootstrap admin created successfully:', finishData);

       if (finishData.success) {
         setSuccess(true);
         
         // Redirect to home after a short delay
         setTimeout(() => {
           navigate({ to: '/' });
         }, 2000);
       } else {
         throw new Error(finishData.message || 'Bootstrap setup failed');
       }

    } catch (error) {
      console.error('❌ Bootstrap admin creation failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to create admin account');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Checking setup status...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Setup Complete!</h2>
            <p className="text-gray-400 mb-4">
              Your admin account has been created successfully. You&apos;ll be redirected to the homepage shortly.
            </p>
            <p className="text-sm text-blue-300">
              You can now manage your instance from the admin panel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Instance Setup</h2>
          <p className="text-gray-400">Create the first admin account for this voice channel instance</p>
        </div>

        {setupStatus && (
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <Users className="w-5 h-5 text-blue-400 mr-2" />
              <h3 className="text-lg font-semibold text-white">Instance Status</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Current Users:</span>
                <span className="text-white">{setupStatus.user_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Setup Required:</span>
                <span className={setupStatus.setup_required ? "text-yellow-400" : "text-green-400"}>
                  {setupStatus.setup_required ? "Yes" : "No"}
                </span>
              </div>
            </div>
            <p className="text-gray-400 text-sm mt-3">{setupStatus.message}</p>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create Admin Account</h3>
          
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="Enter your display name"
                disabled={isCreatingAdmin}
              />
            </div>

            <button
              type="submit"
              disabled={isCreatingAdmin || !displayName.trim()}
              className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingAdmin ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Shield className="w-5 h-5 mr-2" />
                  Create Admin Account with Passkey
                </>
              )}
            </button>
          </form>

          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
            <p className="text-blue-300 text-sm">
              🔑 A secure passkey will be created and stored in your browser. This will be your only way to access the admin panel.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-gray-500">
            This setup wizard will only appear when the instance has no users.
          </p>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/setup')({
  component: SetupPage,
}); 