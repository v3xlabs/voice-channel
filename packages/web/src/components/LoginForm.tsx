import { FC, useState } from 'react';
import { authService } from '../services/auth';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

export const LoginForm: FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const invite = inviteCode.trim() || undefined;
      await authService.createAccount(displayName.trim(), invite);
      onLoginSuccess();
    } catch (error) {
      console.error('Failed to create account:', error);
      setError('Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const hasPasskey = authService.hasStoredPasskey();
      if (hasPasskey) {
        const success = await authService.loginWithPasskey();
        if (success) {
          onLoginSuccess();
        } else {
          setError('Failed to authenticate with saved passkey. Please create a new account.');
        }
      } else {
        setError('No saved account found. Please create a new account.');
      }
    } catch (error) {
      console.error('Failed to login:', error);
      setError('Failed to login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasStoredAccount = authService.hasStoredPasskey();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Voice Channel</h2>
          <p className="text-gray-400">Join voice channels and start talking with others</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          {hasStoredAccount ? (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white mb-2">Welcome back!</h3>
                <p className="text-gray-400 mb-4">Sign in with your saved account</p>
              </div>
              
              <button
                onClick={handleQuickLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-6 6c-3 0-5.5-1.5-5.5-4.5S7 6 10 6c3 0 5.5 1.5 5.5 4.5z" />
                    </svg>
                    Sign in with Passkey
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={() => {
                    authService.logout();
                    window.location.reload();
                  }}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Create new account instead
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white mb-2">Create Account</h3>
                <p className="text-gray-400 mb-4">Get started with just a display name</p>
              </div>

              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {showInviteCode && (
                <div>
                  <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-300 mb-2">
                    Invite Code (Optional)
                  </label>
                  <input
                    type="text"
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Enter invite code"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                    maxLength={8}
                  />
                </div>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowInviteCode(!showInviteCode)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {showInviteCode ? 'Hide invite code' : 'Have an invite code?'}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || !displayName.trim()}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-1a2 2 0 00-2-2H6a2 2 0 00-2 2v1a2 2 0 002 2zM12 7a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                    Create Account with Passkey
                  </>
                )}
              </button>

              <div className="text-center">
                <p className="text-xs text-gray-500">
                  A secure passkey will be generated and stored in your browser for future logins
                </p>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            No passwords required • Secure passkey authentication • Works offline
          </p>
        </div>
      </div>
    </div>
  );
}; 