import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Middleware para compatibilidad con IIS Reverse Proxy ({R:1}).
 * Si IIS reenvía la petición sin el prefijo '/app_cajachica/' (ej: http://localhost:8006/{R:1}),
 * este middleware reescribe la URL internamente hacia '/app_cajachica/...' para que Vite dev server
 * la resuelva transparentemente sin redirecciones ni errores 404.
 */
function iisFallbackPlugin() {
  return {
    name: 'iis-fallback-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const prefijosExcluidos = [
          '/app_cajachica',
          '/api',
          '/users',
          '/Usuario',
          '/NewAPI',
          '/RC_',
          '/Requerimiento_CajaChica',
          '/saldos_semanales',
          '/media',
          '/static',
          '/Empresa',
          '/SI_Empresa',
          '/SI_Empresas'
        ];

        const esRutaExcluida = prefijosExcluidos.some(prefix => url.startsWith(prefix));

        if (!esRutaExcluida) {
          req.url = '/app_cajachica' + (url.startsWith('/') ? url : '/' + url);
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno del archivo .env
  const env = loadEnv(mode, process.cwd(), '');
  const target = (env.VITE_API_URL || 'https://appsurgicorperu.com/').replace(/\/$/, '');

  return {
    plugins: [
      react(),
      iisFallbackPlugin()
    ],
    base: '/app_cajachica/',
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        usePolling: true,
      },
      // HMR dinámico con overlay desactivado para evitar alertas intrusivas por WebSocket detrás de proxy
      hmr: {
        overlay: false,
      },
      // Configuración de Proxy Dinámico para evitar CORS en desarrollo
      proxy: {
        '/Empresa': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/SI_Empresa': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/SI_Empresas': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
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
        '/Usuario': {
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
        '/RC_Placas': {
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
        '/RC_SaldoSemanal': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/saldos_semanales': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
        '/static': {
          target: target,
          changeOrigin: true,
          secure: false,
        },
      }
    },
  }
})
