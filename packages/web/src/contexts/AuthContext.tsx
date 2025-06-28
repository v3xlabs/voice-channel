import { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { tokenManager } from '../services/api';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
  const [token, setToken] = useState<string | null>(tokenManager.getToken());
  const [isAuthenticated, setIsAuthenticated] = useState(tokenManager.isAuthenticated());

  const login = (newToken: string) => {
    tokenManager.setToken(newToken);
    setToken(newToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    tokenManager.removeToken();
    setToken(null);
    setIsAuthenticated(false);
    // Trigger a custom event to notify other parts of the app
    window.dispatchEvent(new CustomEvent('auth:logout'));
  };

  // Listen for logout events from API errors
  useEffect(() => {
    const handleLogout = () => {
      setToken(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const value: AuthContextType = {
    isAuthenticated,
    token,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 