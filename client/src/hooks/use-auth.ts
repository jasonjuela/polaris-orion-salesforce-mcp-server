import { useState, useEffect, createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// Authentication types
export interface User {
  id: string;
  username: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  requiresLogin?: boolean;
}

// Custom hook for authentication management
export function useAuth() {
  const queryClient = useQueryClient();

  // Query to check current authentication status
  const {
    data: authStatus,
    isLoading,
    error,
    refetch: checkAuthStatus
  } = useQuery({
    queryKey: ['/api/auth/status'],
    retry: false,
    staleTime: 0, // Always check fresh status
    refetchOnWindowFocus: true,
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials): Promise<AuthResponse> => {
      const response = await apiRequest('POST', '/api/auth/login', credentials);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate auth status to refresh user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/status'] });
        // Invalidate all queries to refresh with new authentication context
        queryClient.invalidateQueries();
      }
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async (): Promise<AuthResponse> => {
      const response = await apiRequest('POST', '/api/auth/logout');
      return response.json();
    },
    onSuccess: () => {
      // Clear all cached data on logout
      queryClient.clear();
      // Refresh auth status
      checkAuthStatus();
    },
  });

  // Register mutation (development only)
  const registerMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials): Promise<AuthResponse> => {
      const response = await apiRequest('POST', '/api/auth/register', credentials);
      return response.json();
    },
  });

  // Computed authentication state
  const authState: AuthState = {
    isAuthenticated: (authStatus as any)?.authenticated || false,
    user: (authStatus as any)?.user || null,
    isLoading: isLoading || loginMutation.isPending || logoutMutation.isPending,
    error: error?.message || loginMutation.error?.message || logoutMutation.error?.message || null,
  };

  return {
    // State
    ...authState,
    
    // Actions
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    register: registerMutation.mutate,
    checkAuthStatus,
    
    // Mutation states
    loginError: loginMutation.error?.message,
    loginIsLoading: loginMutation.isPending,
    logoutIsLoading: logoutMutation.isPending,
    registerError: registerMutation.error?.message,
    registerIsLoading: registerMutation.isPending,
    
    // Last operation results
    loginResult: loginMutation.data,
    logoutResult: logoutMutation.data,
    registerResult: registerMutation.data,
  };
}

// Helper hook to require authentication
export function useRequireAuth() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      // Could redirect to login page or show login modal
      console.warn('Authentication required');
    }
  }, [auth.isLoading, auth.isAuthenticated]);
  
  return auth;
}

// Helper to check if user is authenticated (for conditional rendering)
export function useIsAuthenticated(): boolean {
  const auth = useAuth();
  return auth.isAuthenticated;
}