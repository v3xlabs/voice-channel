import { FC, useState, useEffect } from 'react';
import { Shield, Fingerprint, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import classnames from 'classnames';
import { useAuth } from '../hooks/useAuth';
import { useWebAuthnSupport } from '../hooks/useWebAuthn';

interface PasskeyLoginFormProps {
  className?: string;
}

export const PasskeyLoginForm: FC<PasskeyLoginFormProps> = ({ className }) => {
  const { login, register, isLoggingIn, isRegistering, loginError, registerError, isAuthenticated } = useAuth();
  const { data: webAuthnSupport, isLoading: supportLoading } = useWebAuthnSupport();
  
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Clear errors when switching modes
  useEffect(() => {
    setError('');
    setSuccess('');
  }, [mode]);

  // Handle login/register errors
  useEffect(() => {
    if (loginError) {
      setError(loginError.message || 'Authentication failed');
    } else if (registerError) {
      setError(registerError.message || 'Registration failed');
    }
  }, [loginError, registerError]);

  const handleLogin = async () => {
    try {
      setError('');
      setSuccess('');
      await login();
      setSuccess('Successfully logged in with passkey!');
    } catch (err) {
      // Error is already handled by useAuth
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    try {
      setError('');
      setSuccess('');
      await register({
        displayName: displayName.trim(),
        inviteCode: inviteCode.trim() || undefined,
      });
      setSuccess('Account created successfully with passkey!');
      setDisplayName('');
      setInviteCode('');
    } catch (err) {
      // Error is already handled by useAuth
    }
  };

  if (isAuthenticated) {
    return null; // Don't show login form when already authenticated
  }

  if (supportLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Checking passkey support...</p>
        </div>
      </div>
    );
  }

  if (!webAuthnSupport?.isSupported) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Passkeys Not Supported</h2>
            <p className="text-gray-400 mb-6">
              Your browser or device doesn't support passkeys. Please try:
            </p>
            <ul className="text-left text-gray-400 text-sm space-y-2 mb-6">
              <li>• Updating your browser to the latest version</li>
              <li>• Using Chrome, Firefox, Safari, or Edge</li>
              <li>• Trying on a different device</li>
            </ul>
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
              <p className="text-blue-300 text-sm">
                This application requires passkeys for secure authentication without passwords.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={classnames("min-h-screen bg-gray-900 flex items-center justify-center px-4", className)}>
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Voice Channel</h2>
          <p className="text-gray-400">Secure passkey authentication</p>
        </div>

        {/* WebAuthn Support Info */}
        {webAuthnSupport && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <Fingerprint className="w-5 h-5 text-green-400 mr-2" />
              <h3 className="text-sm font-medium text-white">Passkey Support</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between">
                <span>WebAuthn:</span>
                <span className="text-green-400">✓ Supported</span>
              </div>
              <div className="flex justify-between">
                <span>Resident Keys:</span>
                <span className={webAuthnSupport.supportsResidentKeys ? "text-green-400" : "text-yellow-400"}>
                  {webAuthnSupport.supportsResidentKeys ? "✓ Supported" : "⚠ Limited"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Platform:</span>
                <span className="text-gray-300">{webAuthnSupport.browserInfo.platform}</span>
              </div>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setMode('login')}
            className={classnames(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors",
              mode === 'login'
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            )}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('register')}
            className={classnames(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors",
              mode === 'register'
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            )}
          >
            Create Account
          </button>
        </div>

        {/* Login Form */}
        {mode === 'login' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Sign in with Passkey</h3>
            
            <div className="space-y-4">
              <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  🔑 Click below to sign in with your passkey. Your browser or password manager will prompt you to authenticate.
                </p>
              </div>

              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5 mr-2" />
                    Sign in with Passkey
                  </>
                )}
              </button>

              {webAuthnSupport?.hasCredentials && (
                <div className="text-center">
                  <p className="text-xs text-green-400">
                    ✓ Passkeys detected for this site
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Register Form */}
        {mode === 'register' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create Account with Passkey</h3>
            
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
                  placeholder="Enter your display name"
                  disabled={isRegistering}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Invite Code (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowInviteCode(!showInviteCode)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showInviteCode ? (
                      <>
                        <EyeOff className="w-3 h-3 inline mr-1" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3 inline mr-1" />
                        Show
                      </>
                    )}
                  </button>
                </div>
                {showInviteCode && (
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
                    placeholder="Enter invite code if you have one"
                    disabled={isRegistering}
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={isRegistering || !displayName.trim()}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegistering ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Create Account with Passkey
                  </>
                )}
              </button>

              <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  🔑 A secure passkey will be created and stored in your browser or password manager for future logins.
                </p>
              </div>
            </form>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
              <p className="text-green-300 text-sm">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            No passwords required • Secure passkey authentication • Works across devices
          </p>
        </div>
      </div>
    </div>
  );
}; 