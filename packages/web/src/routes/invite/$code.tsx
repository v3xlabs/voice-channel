import { createFileRoute, useParams } from '@tanstack/react-router';
import { FC } from 'react';
import { useInvitation } from '../../hooks/useInvitation';
import { useAuth } from '../../hooks/useAuth';
import { PasskeyLoginForm } from '../../components/PasskeyLoginForm';

const InvitePage: FC = () => {
  const { code } = useParams({ strict: false }) as { code: string };
  const { invitation, isLoading, isValid, isExpired, isExhausted, isInactive, exists } = useInvitation(code);
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Already Logged In</h1>
          <p className="text-gray-400 mb-6">
            You&apos;re already authenticated. You can now access public channels or request access to private ones.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (!exists) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 text-4xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-4">Invalid Invitation</h1>
          <p className="text-gray-400 mb-6">
            This invitation code doesn&apos;t exist or has been removed.
          </p>
          <p className="text-sm text-gray-500">
            Invitation Code: <code className="bg-gray-700 px-2 py-1 rounded">{code}</code>
          </p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    let reason = 'This invitation is no longer valid.';
    let icon = '❌';
    
    if (isInactive) {
      reason = 'This invitation has been deactivated.';
      icon = '🚫';
    } else if (isExpired) {
      reason = 'This invitation has expired.';
      icon = '⏰';
    } else if (isExhausted) {
      reason = 'This invitation has reached its maximum usage limit.';
      icon = '📊';
    }

    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">{icon}</div>
          <h1 className="text-2xl font-bold mb-4">Invitation Unavailable</h1>
          <p className="text-gray-400 mb-6">{reason}</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>Invitation Code: <code className="bg-gray-700 px-2 py-1 rounded">{code}</code></p>
            {invitation && (
              <>
                <p>Uses: {invitation.current_uses} / {invitation.max_uses || '∞'}</p>
                {invitation.expires_at && (
                  <p>Expires: {new Date(invitation.expires_at).toLocaleDateString()}</p>
                )}
                <p>Status: {invitation.is_active ? 'Active' : 'Inactive'}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // At this point, invitation is guaranteed to exist and be valid
  const validInvitation = invitation!;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-green-500 text-4xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">You&apos;re Invited!</h1>
          <p className="text-gray-400 mb-4">
            You&apos;ve been invited to join this voice channel instance.
          </p>
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-400 mb-1">Invitation Details</div>
            <div className="space-y-1 text-sm">
              <div>Code: <code className="bg-gray-600 px-2 py-1 rounded text-xs">{code}</code></div>
              <div>Uses: {validInvitation.current_uses} / {validInvitation.max_uses || '∞'}</div>
              {validInvitation.expires_at && (
                <div>Expires: {new Date(validInvitation.expires_at).toLocaleDateString()}</div>
              )}
              {validInvitation.invited_email && (
                <div>For: {validInvitation.invited_email}</div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Create Your Account</h2>
          <PasskeyLoginForm 
            className="space-y-4"
          />
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Use invitation code: <code className="bg-gray-600 px-2 py-1 rounded text-xs">{code}</code>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-400">
          <p>By creating an account, you&apos;ll be able to join voice channels and participate in conversations.</p>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/invite/$code')({
  component: InvitePage,
} as any); 