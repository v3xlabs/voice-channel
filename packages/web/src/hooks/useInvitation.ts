import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import type { components } from '../schema.gen';

type Invitation = components['schemas']['Invitation'];

const getInvitationByCode = (inviteCode: string) => queryOptions({
  queryKey: ['invitation', inviteCode],
  async queryFn() {
    const response = await apiFetch('/invitations/{invite_code}', 'get', {
      path: { invite_code: inviteCode },
    });
    return response.data as Invitation | null;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  retry: false, // Don't retry failed invitation lookups
});

export const useInvitation = (inviteCode: string) => {
  const {
    data: invitation,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getInvitationByCode(inviteCode),
    enabled: !!inviteCode,
  });

  const isValid = invitation && 
    invitation.is_active &&
    (!invitation.expires_at || new Date(invitation.expires_at) > new Date()) &&
    (!invitation.max_uses || invitation.current_uses < invitation.max_uses);

  const isExpired = invitation && invitation.expires_at && new Date(invitation.expires_at) <= new Date();
  const isExhausted = invitation && invitation.max_uses && invitation.current_uses >= invitation.max_uses;
  const isInactive = invitation && !invitation.is_active;

  return {
    invitation,
    isLoading,
    error,
    refetch,
    isValid,
    isExpired,
    isExhausted,
    isInactive,
    exists: !!invitation,
  };
}; 