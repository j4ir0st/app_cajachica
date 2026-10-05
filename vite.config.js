import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno del archivo .env
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_URL;

  return {
    plugins: [
      react()
    ],
    base: '/app_cajachica/',
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        usePolling: true,
      },
      // HMR dinámico: resuelve automáticamente host y puerto según la conexión del navegador
      hmr: true,
      // Configuración de Proxy Dinámico vía .env para evitar CORS en desarrollo
      proxy: {
        '/api': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/users': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/NewAPI': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        // Tablas del módulo de Caja Chica
        '/RC_TipoGasto': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/RC_SubGasto': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/RC_Entidades': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/RC_Provincia': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/RC_Detalle': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/Requerimiento_CajaChica': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
      }
    },
  }
})
