import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { limpiarCatalogos } from '../utils/catalogoCache';

// Store para manejar el estado del usuario y la autenticación
export const useUserStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      // Acción para iniciar sesión con datos reales de la API
      login: (userData, access, refresh) => set({
        user: userData,
        token: access,
        refreshToken: refresh,
        isAuthenticated: true
      }),

      // Acción para cerrar sesión (limpieza total, incluye caché de catálogos)
      logout: () => {
        limpiarCatalogos();
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false
        });
      },

      // Actualiza solo el access token (tras renovación exitosa)
      setToken: (nuevoToken) => set({ token: nuevoToken }),

      // Actualizar datos del usuario (útil para cambios de perfil)
      updateUser: (userData) => set((state) => ({
        user: state.user ? { ...state.user, ...userData } : userData
      })),
    }),
    {
      name: 'cajachica-auth-storage', // Persistencia en localStorage
    }
  )
);
