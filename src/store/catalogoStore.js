import { create } from 'zustand';
import { CLAVES_CATALOGO, guardarEnCache, leerDeCache } from '../utils/catalogoCache';
import { fetchAuth } from '../utils/fetchAuth';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Store para manejar los catálogos globales de la aplicación
export const useCatalogoStore = create((set, get) => ({
  tiposGasto: [],
  subgastos: [],
  entidades: [],
  provincias: [],
  cargando: false,
  error: null,

  // Acción para cargar todos los catálogos de manera asíncrona
  cargarCatalogos: async (forzarRecarga = false) => {
    // Si ya se está cargando, no hacer nada
    if (get().cargando) return;

    set({ cargando: true, error: null });

    /**
     * Resuelve un catálogo individual usando caché o API.
     */
    const resuelveCatalogo = async (clave, url) => {
      if (!forzarRecarga) {
        const enCache = leerDeCache(clave);
        if (enCache) return enCache;
      }

      const res = await fetchAuth(url);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar ${clave}`);

      const json = await res.json();
      const data = json.results ?? json;

      if (!Array.isArray(data)) throw new Error(`Respuesta inesperada para ${clave}`);

      guardarEnCache(clave, data);
      return data;
    };

    try {
      console.log('[catalogoStore] Iniciando carga de catálogos...');
      const [tiposData, subData, entData, provData] = await Promise.all([
        resuelveCatalogo(CLAVES_CATALOGO.tiposGasto, `${API_URL}/RC_TipoGasto/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.subgastos, `${API_URL}/RC_SubGasto/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.entidades, `${API_URL}/RC_Entidades/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.provincias, `${API_URL}/RC_Provincia/?format=json&top=200`),
      ]);

      console.log('[catalogoStore] Catálogos cargados exitosamente:', {
        tipos: tiposData.length,
        subgastos: subData.length,
        entidades: entData.length,
        provincias: provData.length
      });

      set({
        tiposGasto: tiposData,
        subgastos: subData,
        entidades: entData,
        provincias: provData,
        cargando: false
      });
    } catch (err) {
      console.error('[catalogoStore] Error crítico cargando catálogos:', err);
      set({
        error: `Error al cargar datos: ${err.message}`,
        cargando: false
      });
    }

  },

  // Limpia el estado de los catálogos
  limpiarCatalogos: () => set({
    tiposGasto: [],
    subgastos: [],
    entidades: [],
    provincias: [],
    error: null
  }),
}));
