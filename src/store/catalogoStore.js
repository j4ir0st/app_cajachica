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
  empresas: [],
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
    const resuelveCatalogo = async (clave, url, datosRespaldo = null) => {
      if (!forzarRecarga) {
        const enCache = leerDeCache(clave);
        if (enCache) return enCache;
      }

      try {
        const res = await fetchAuth(url);
        if (!res.ok) {
          if (datosRespaldo) return datosRespaldo;
          throw new Error(`Error ${res.status} al cargar ${clave}`);
        }

        const json = await res.json();
        const data = json.results ?? json;

        if (!Array.isArray(data)) {
          if (datosRespaldo) return datosRespaldo;
          throw new Error(`Respuesta inesperada para ${clave}`);
        }

        guardarEnCache(clave, data);
        return data;
      } catch (errCat) {
        if (datosRespaldo) return datosRespaldo;
        throw errCat;
      }
    };

    try {
      const [tiposData, subData, entData, provData, emprData] = await Promise.all([
        resuelveCatalogo(CLAVES_CATALOGO.tiposGasto, `${API_URL}/RC_TipoGasto/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.subgastos, `${API_URL}/RC_SubGasto/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.entidades, `${API_URL}/RC_Entidades/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.provincias, `${API_URL}/RC_Provincia/?format=json&top=200`),
        resuelveCatalogo(CLAVES_CATALOGO.empresas, `${API_URL}/SI_Empresas/?format=json`, [
          { id: 1, nombre: 'Surgicorp SRL' },
          { id: 4, nombre: 'RR MEDICAL SRL' },
          { id: 3, nombre: 'MCKINSEY MEDICA S.R.L.' },
          { id: 2, nombre: 'BIOPRO PERU S.R.L.' },
        ]),
      ]);

      console.log(`[Catálogos] ✅ Tablas maestras cargadas: Tipos (${tiposData.length}), Subgastos (${subData.length}), Entidades (${entData.length}), Provincias (${provData.length}), Empresas (${emprData.length}).`);

      set({
        tiposGasto: tiposData,
        subgastos: subData,
        entidades: entData,
        provincias: provData,
        empresas: emprData,
        cargando: false
      });
    } catch (err) {
      console.error('[Catálogos] ❌ Error al cargar tablas maestras:', err.message || err);
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
    empresas: [],
    error: null
  }),
}));
