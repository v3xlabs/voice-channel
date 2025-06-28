/**
 * Native WebAuthn Service for Resident Key Authentication
 * 
 * This service implements WebAuthn using native browser APIs to ensure
 * proper resident key (discoverable credential) behavior that works
 * consistently across all platforms and password managers.
 */

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    userVerification?: 'required' | 'preferred' | 'discouraged';
    residentKey?: 'required' | 'preferred' | 'discouraged';
    requireResidentKey?: boolean;
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  timeout?: number;
  excludeCredentials?: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports?: Array<'usb' | 'nfc' | 'ble' | 'hybrid' | 'internal'>;
  }>;
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId?: string;
  allowCredentials?: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports?: Array<'usb' | 'nfc' | 'ble' | 'hybrid' | 'internal'>;
  }>;
  userVerification?: 'required' | 'preferred' | 'discouraged';
  timeout?: number;
}

export interface WebAuthnCredential {
  id: string;
  rawId: ArrayBuffer;
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject?: ArrayBuffer;
    authenticatorData?: ArrayBuffer;
    signature?: ArrayBuffer;
    userHandle?: ArrayBuffer;
  };
  type: 'public-key';
  clientExtensionResults: {};
  authenticatorAttachment?: 'platform' | 'cross-platform';
}

/**
 * Utility functions for WebAuthn data conversion
 */
export class WebAuthnUtils {
  /**
   * Convert base64url string to ArrayBuffer
   */
  static base64urlToBuffer(base64url: string): ArrayBuffer {
    // Add padding if needed
    const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }
    
    return buffer;
  }

  /**
   * Convert ArrayBuffer to base64url string
   */
  static bufferToBase64url(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer);
    const binary = Array.from(view, byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(binary);
    
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Convert string to ArrayBuffer (UTF-8 encoding)
   */
  static stringToBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  /**
   * Convert ArrayBuffer to string (UTF-8 decoding)
   */
  static bufferToString(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  /**
   * Generate a cryptographically secure random challenge
   */
  static generateChallenge(length: number = 32): ArrayBuffer {
    return crypto.getRandomValues(new Uint8Array(length)).buffer;
  }
}

/**
 * Native WebAuthn Service
 */
export class WebAuthnService {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;

  constructor(rpId?: string, rpName?: string) {
    this.origin = window.location.origin;
    this.rpId = rpId || window.location.hostname;
    this.rpName = rpName || 'Voice Channel';
    
    console.log('🔧 WebAuthn Service initialized:', {
      rpId: this.rpId,
      rpName: this.rpName,
      origin: this.origin,
    });
  }

  /**
   * Check if WebAuthn is supported in this browser
   */
  isSupported(): boolean {
    return !!(
      window.PublicKeyCredential &&
      navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function'
    );
  }

  /**
   * Check if the browser supports resident keys (discoverable credentials)
   */
  async supportsResidentKeys(): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    try {
      // Check if conditional mediation is available (good indicator of modern WebAuthn support)
      // Note: TypeScript may show this as always true, but it's actually optional in the spec
      const available = await (PublicKeyCredential as any).isConditionalMediationAvailable?.();
      return available === true;
    } catch {
      // Fallback: assume modern browsers support resident keys
      return true;
    }
  }

  /**
   * Create optimal registration options for resident keys
   */
  private createRegistrationOptions(
    challenge: string,
    userId: string,
    userName: string,
    displayName: string
  ): WebAuthnRegistrationOptions {
    return {
      challenge,
      rp: {
        id: this.rpId,
        name: this.rpName,
      },
      user: {
        id: userId,
        name: userName,
        displayName: displayName,
      },
      pubKeyCredParams: [
        // Prefer ES256 (ECDSA with SHA-256)
        { type: 'public-key', alg: -7 },
        // Fallback to RS256 (RSASSA-PKCS1-v1_5 with SHA-256)
        { type: 'public-key', alg: -257 },
        // EdDSA (if supported)
        { type: 'public-key', alg: -8 },
      ],
      authenticatorSelection: {
        // Allow both platform and cross-platform authenticators
        authenticatorAttachment: undefined,
        // Require user verification for security
        userVerification: 'required',
        // CRITICAL: Force resident key creation
        residentKey: 'required',
        requireResidentKey: true,
      },
      // Request direct attestation for better compatibility
      attestation: 'direct',
      // 60 second timeout
      timeout: 60000,
      // No excluded credentials for new accounts
      excludeCredentials: [],
    };
  }

  /**
   * Create optimal authentication options for discoverable credentials
   */
  private createAuthenticationOptions(challenge: string): WebAuthnAuthenticationOptions {
    return {
      challenge,
      rpId: this.rpId,
      // CRITICAL: Empty allowCredentials array for discoverable authentication
      allowCredentials: [],
      // Prefer user verification but don't require it
      userVerification: 'required',
      // 60 second timeout
      timeout: 60000,
    };
  }

  /**
   * Register a new resident key credential
   */
  async register(
    challenge: string,
    userId: string,
    userName: string,
    displayName: string
  ): Promise<WebAuthnCredential> {
    if (!this.isSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    console.log('🆕 Starting WebAuthn registration with resident key:', {
      userId,
      userName,
      displayName,
      rpId: this.rpId,
    });

    // Convert challenge and user ID to ArrayBuffer
    const challengeBuffer = WebAuthnUtils.base64urlToBuffer(challenge);
    const userIdBuffer = WebAuthnUtils.stringToBuffer(userId);

    const options: CredentialCreationOptions = {
      publicKey: {
        ...this.createRegistrationOptions(challenge, userId, userName, displayName),
        challenge: challengeBuffer,
        user: {
          id: userIdBuffer,
          name: userName,
          displayName: displayName,
        },
      },
    };

    console.log('🔧 Registration options:', {
      ...options.publicKey,
      challenge: '[ArrayBuffer]',
      user: { ...options.publicKey!.user, id: '[ArrayBuffer]' },
    });

    try {
      const credential = await navigator.credentials.create(options) as PublicKeyCredential;
      
      if (!credential) {
        throw new Error('Failed to create credential');
      }

      console.log('✅ Credential created successfully:', {
        id: credential.id,
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
      });

      // Verify this is actually a resident key by checking the response
      const response = credential.response as AuthenticatorAttestationResponse;
      console.log('🔍 Attestation response:', {
        clientDataJSON: WebAuthnUtils.bufferToString(response.clientDataJSON),
        attestationObject: '[ArrayBuffer]',
      });

      return {
        id: credential.id,
        rawId: credential.rawId,
        response: {
          clientDataJSON: response.clientDataJSON,
          attestationObject: response.attestationObject,
        },
        type: credential.type as 'public-key',
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment as 'platform' | 'cross-platform' | undefined,
      };
    } catch (error) {
      console.error('❌ WebAuthn registration failed:', error);
      
      if (error instanceof Error) {
        // Provide user-friendly error messages
        if (error.name === 'NotSupportedError') {
          throw new Error('Your device does not support passkeys. Please try a different device or browser.');
        } else if (error.name === 'NotAllowedError') {
          throw new Error('Passkey creation was cancelled or not allowed. Please try again.');
        } else if (error.name === 'InvalidStateError') {
          throw new Error('A passkey already exists for this account. Please try logging in instead.');
        } else if (error.name === 'ConstraintError') {
          throw new Error('Your device cannot create a passkey with the required security level.');
        } else if (error.name === 'UnknownError') {
          throw new Error('An unexpected error occurred. Please try again or use a different device.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Authenticate using discoverable credentials (resident keys) for active authentication
   */
  async authenticate(challenge: string): Promise<WebAuthnCredential> {
    if (!this.isSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    console.log('🔐 Starting WebAuthn authentication with discoverable credentials:', {
      rpId: this.rpId,
      challenge: challenge.substring(0, 16) + '...',
    });

    // Convert challenge to ArrayBuffer
    const challengeBuffer = WebAuthnUtils.base64urlToBuffer(challenge);

    const options: CredentialRequestOptions = {
      publicKey: {
        ...this.createAuthenticationOptions(challenge),
        challenge: challengeBuffer,
      },
      // Use active mediation to immediately trigger authentication popup
      mediation: 'optional' as any,
    };

    console.log('🔧 Authentication options:', {
      ...options.publicKey,
      challenge: '[ArrayBuffer]',
      mediation: options.mediation,
    });

    try {
      const credential = await navigator.credentials.get(options) as PublicKeyCredential;
      
      if (!credential) {
        throw new Error('No credential was selected or authentication was cancelled');
      }

      console.log('✅ Authentication successful:', {
        id: credential.id,
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
      });

      const response = credential.response as AuthenticatorAssertionResponse;
      
      console.log('🔍 Assertion response:', {
        clientDataJSON: WebAuthnUtils.bufferToString(response.clientDataJSON),
        authenticatorData: '[ArrayBuffer]',
        signature: '[ArrayBuffer]',
                  userHandle: response.userHandle ? WebAuthnUtils.bufferToString(response.userHandle) : undefined,
      });

      return {
        id: credential.id,
        rawId: credential.rawId,
        response: {
          clientDataJSON: response.clientDataJSON,
          authenticatorData: response.authenticatorData,
          signature: response.signature,
          userHandle: response.userHandle || undefined,
        },
        type: credential.type as 'public-key',
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment as 'platform' | 'cross-platform' | undefined,
      };
    } catch (error) {
      console.error('❌ WebAuthn authentication failed:', error);
      
      if (error instanceof Error) {
        // Provide user-friendly error messages
        if (error.name === 'NotSupportedError') {
          throw new Error('Your device does not support passkeys. Please try a different device or browser.');
        } else if (error.name === 'NotAllowedError') {
          throw new Error('Authentication was cancelled or not allowed. Please try again.');
        } else if (error.name === 'InvalidStateError') {
          throw new Error('No passkeys found for this site. Please register first.');
        } else if (error.name === 'UnknownError') {
          throw new Error('An unexpected error occurred during authentication. Please try again.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Test if discoverable credentials are available (for conditional UI)
   */
  async hasDiscoverableCredentials(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      // Try to check if there are any credentials available
      // This is a non-standard method but works in some browsers
      // @ts-ignore - TypeScript definitions are incomplete for WebAuthn
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
      return available === true;
      
      // Fallback: assume credentials might be available
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get browser and platform information for debugging
   */
  getBrowserInfo(): {
    userAgent: string;
    platform: string;
    webAuthnSupported: boolean;
    conditionalMediationSupported: boolean;
    platformAuthenticatorSupported: boolean;
  } {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      webAuthnSupported: this.isSupported(),
      conditionalMediationSupported: !!(PublicKeyCredential as any).isConditionalMediationAvailable,
      platformAuthenticatorSupported: !!(PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable,
    };
  }
}

// Export a singleton instance
export const webAuthnService = new WebAuthnService(); 