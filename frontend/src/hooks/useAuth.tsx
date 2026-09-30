import React, { createContext, useContext } from "react";
import { getMe, logout as apiLogout } from "../api/endpoints";
import { MeResponse, Permissions, User } from "../types/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthToken, getAuthToken } from "../api/client";

interface AuthContextType {
  user: User | null;
  role: "admin" | "operator" | "client" | "user" | null;
  permissions: Permissions | null;
  isLoading: boolean;
  isError: boolean;
  logout: () => void;
  refetchAuth: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<MeResponse>({
    queryKey: ["authMe"],
    queryFn: async () => {
      const token = getAuthToken();
      if (!token) {
        return null as any;
      }
      try {
        return await getMe();
      } catch (err: any) {
        if (err.status === 401) {
          clearAuthToken();
          return null as any;
        }
        throw err;
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });

  const logout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error("Logout error", err);
    }
    clearAuthToken();
    queryClient.clear();
    window.location.href = "/login";
  };

  // Resolve user: backend /api/auth/me returns User directly with permissions
  const currentUser: User | null = data ? ((data as any).id ? (data as User) : ((data as any).user || null)) : null;
  const currentPermissions: Permissions | null = currentUser?.permissions || (data as any)?.permissions || null;
  const role = currentUser?.role || null;

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        role,
        permissions: currentPermissions,
        isLoading,
        isError,
        logout,
        refetchAuth: refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
