import { create } from 'zustand';
import { CLAVES_CATALOGO, guardarEnCache, leerDeCache } from '../utils/catalogoCache';
import { fetchAuth } from '../utils/fetchAuth';
import { formatearNombreEntidad, esEntidadValidaEntrega } from '../utils/entidades';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Store para manejar los catálogos globales de la aplicación
export const useCatalogoStore = create((set, get) => ({
  tiposGasto: [],
  subgastos: [],
  entidades: [],
  provincias: [],
  empresas: [],
  placas: [],
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

    /**
     * Carga exhaustiva de Entidades / Sedes de Entrega con top=1000 y seguimiento
     * automático de next links para garantizar carga completa en memoria y caché semanal.
     * Filtros institucionales: tipo_sede='E' y de_baja='N'.
     */
    const resuelveEntidades = async () => {
      if (!forzarRecarga) {
        const enCache = leerDeCache(CLAVES_CATALOGO.entidades);
        if (enCache && Array.isArray(enCache) && enCache.length > 0) {
          return enCache.filter(esEntidadValidaEntrega).map((ent) => ({
            ...ent,
            nombreDisplay: formatearNombreEntidad(ent),
          }));
        }
      }

      try {
        let urlActual = `${API_URL}/RC_Entidades/?tipo_sede=E&de_baja=N&top=1000&format=json`;
        const acumuladas = [];
        let pagina = 1;
        const maxPaginas = 25; // Seguridad contra bucles infinitos

        while (urlActual && pagina <= maxPaginas) {
          const res = await fetchAuth(urlActual);
          if (!res.ok) {
            throw new Error(`Error ${res.status} al cargar página ${pagina} de RC_Entidades`);
          }

          const json = await res.json();
          const lista = json.results ?? (Array.isArray(json) ? json : []);
          acumuladas.push(...lista);

          if (json.next) {
            let proximaUrl = json.next;
            // En desarrollo local convertir URL absoluta en relativa para el proxy de Vite
            if (import.meta.env.DEV) {
              proximaUrl = proximaUrl.replace(/^https?:\/\/[^\/]+/, '');
            }
            urlActual = proximaUrl;
            pagina++;
          } else {
            urlActual = null;
          }
        }

        // Filtrar estrictamente solo sedes de entrega (tipo_sede='E')
        const soloEntregas = acumuladas.filter(esEntidadValidaEntrega);

        // Normalizar y enriquecer cada entidad con su nombre de sede formateado
        const normalizadas = soloEntregas.map((ent) => ({
          ...ent,
          nombreDisplay: formatearNombreEntidad(ent),
        }));

        guardarEnCache(CLAVES_CATALOGO.entidades, normalizadas);
        return normalizadas;
      } catch (errEnt) {
        console.warn('[Catálogos] Advertencia al cargar RC_Entidades:', errEnt);
        const enCache = leerDeCache(CLAVES_CATALOGO.entidades);
        if (enCache) {
          return enCache.filter(esEntidadValidaEntrega).map((ent) => ({
            ...ent,
            nombreDisplay: formatearNombreEntidad(ent),
          }));
        }
        return [];
      }
    };

    try {
      const [tiposData, subData, entData, provData, emprData, placasData] = await Promise.all([
        resuelveCatalogo(CLAVES_CATALOGO.tiposGasto, `${API_URL}/RC_TipoGasto/?format=json`),
        resuelveCatalogo(CLAVES_CATALOGO.subgastos, `${API_URL}/RC_SubGasto/?format=json`),
        resuelveEntidades(),
        resuelveCatalogo(CLAVES_CATALOGO.provincias, `${API_URL}/RC_Provincia/?format=json&top=200`),
        resuelveCatalogo(CLAVES_CATALOGO.empresas, `${API_URL}/Empresa/?format=json`, [
          { id: 1, nombre: 'SURGICORP SRL', empresa: 'SURGICORP S.R.L.' },
          { id: 4, nombre: 'RR MEDICAL SRL', empresa: 'RR MEDICAL S.R.L.' },
          { id: 3, nombre: 'MCKINSEY MEDICA SRL', empresa: 'MCKINSEY MEDICA S.R.L.' },
          { id: 2, nombre: 'BIOPRO PERU SRL', empresa: 'BIOPRO PERU S.R.L.' },
        ]),
        resuelveCatalogo(CLAVES_CATALOGO.placas, `${API_URL}/RC_Placas/?format=json&top=1000`, []),
      ]);

      const MAPA_TIPO_POR_ID = { 1: 'A', 4: 'B', 3: 'D', 2: 'E' };
      const emprNormalizadas = (emprData || []).map((e) => ({
        ...e,
        nombre: e.nombre || e.empresa || `Empresa ${e.id}`,
        tipo: e.tipo || MAPA_TIPO_POR_ID[e.id] || '',
      }));

      console.log(`[Catálogos] ✅ Tablas maestras cargadas: Tipos (${tiposData.length}), Subgastos (${subData.length}), Entidades (${entData.length}), Provincias (${provData.length}), Empresas (${emprNormalizadas.length}), Placas (${placasData.length}).`);

      set({
        tiposGasto: tiposData,
        subgastos: subData,
        entidades: entData,
        provincias: provData,
        empresas: emprNormalizadas,
        placas: placasData,
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
    placas: [],
    error: null
  }),
}));
