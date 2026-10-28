import React, { useEffect, useState, useMemo } from 'react';
import { DollarSign, FileText, Info, ChevronDown, Users, Building } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useCatalogoStore } from '../../store/catalogoStore';
import { fetchAuth } from '../../utils/fetchAuth';
import { CLAVES_CATALOGO, guardarEnCache, leerDeCache } from '../../utils/catalogoCache';
import { obtenerTipoCaja, LISTA_EMPRESAS } from '../../utils/tipoCaja';
import { tieneRangoGerencial, obtenerPuestoLimpio } from '../../utils/permisos';
import Combobox from '../Combobox';

const API_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL;

/**
 * Funciones utilitarias para extraer el nombre de puesto y área:
 * - Para tabla users (serializer): siempre es u.puesto_id.nombre y u.area_id.nombre.
 * - Para respuesta de login (usuario logueado): viene personalizado como string en user.puesto y user.area_id.
 */
export const extraerPuesto = (u) => {
  if (!u) return '';
  return u.puesto_id?.nombre || u.puesto || '';
};

export const extraerArea = (u) => {
  if (!u) return '';
  return u.area_id?.nombre || (typeof u.area_id === 'string' ? u.area_id : '');
};

/**
 * Paso 1: Datos de cabecera del requerimiento.
 * - Gerentes y Superusuarios ven a todos los usuarios activos de Surgicorp con subtítulo (Área - Puesto).
 * - Jefes, Coordinadores y Supervisores ven a los usuarios activos de su área (vía area_id) sin subtítulo.
 * - Usuarios operativos solo pueden solicitar para sí mismos.
 * - La consulta se realiza con top=1000 e is_active=true (omite inactivos).
 * - La fecha toma la hora actual y permite modificarla.
 * - Permite elegir la empresa de SI_Empresas para definir el Tipo de Caja (A, B, C, D, E).
 * @param {Object} datos - Estado actual del formulario maestro.
 * @param {Function} onChange - Callback para actualizar el estado maestro.
 */
const Step1Cabecera = ({ datos, onChange }) => {
  const { user, updateUser } = useUserStore();
  const { empresas } = useCatalogoStore();

  // Roles según el campo puesto del usuario logueado con normalización robusta
  const puestoLimpio = obtenerPuestoLimpio(user);

  // 1. Gerente o Superusuario: Ve TODOS los usuarios activos y ve el subtítulo de área y puesto
  const esGerenteOSuperuser = Boolean(
    user?.is_superuser || tieneRangoGerencial(user) || puestoLimpio.includes('gerente')
  );

  // 2. Jefe, Coordinador o Supervisor (y Administrador / is_staff): Ve los usuarios de su área (sin subtítulo)
  const esMandoArea = Boolean(
    puestoLimpio.includes('jefe') ||
    puestoLimpio.includes('coordinador') ||
    puestoLimpio.includes('supervisor') ||
    user?.is_staff
  );

  // Puede elegir solicitante si tiene cualquiera de estos roles
  const puedeElegirSolicitante = esGerenteOSuperuser || esMandoArea;

  const listaEmpresasDisponibles = useMemo(() => {
    if (Array.isArray(empresas) && empresas.length > 0) {
      return empresas.map((emp) => {
        const idNum = emp.id;
        const info = obtenerTipoCaja(idNum);
        return {
          id: idNum,
          nombre: emp.nombre || emp.razon_social || `Empresa #${idNum}`,
          tipo: info.tipo,
        };
      });
    }
    return LISTA_EMPRESAS;
  }, [empresas]);

  // Fecha-hora actual en formato datetime-local (YYYY-MM-DDTHH:mm)
  const [ahora] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [todosUsuarios, setTodosUsuarios] = useState([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);

  // Pre-poblar datos del usuario autenticado al montar
  useEffect(() => {
    if (!user || datos.usuario_id) return;

    const inicializarConUrl = async () => {
      let usuarioUrl = user.url || null;
      let areaUrl = user.area_url || null;

      if (!usuarioUrl || !areaUrl) {
        try {
          const res = await fetchAuth(`${API_URL}/users/${user.id}/?format=json`);
          const data = await res.json();
          usuarioUrl = data.url || null;
          areaUrl = data.area_id?.url || null;
          updateUser({ url: usuarioUrl, area_url: areaUrl });
        } catch {
          console.warn('No se pudo recuperar la URL de perfil del usuario.');
        }
      }

      onChange({
        usuario_id: user.id,
        usuario_url: usuarioUrl,
        area_id: user.area_id,
        area_url: areaUrl,
        area_nombre: user.area_id,
        usuario_nombre: user.nombre,
        usuario_puesto: user.puesto,
        fecha_solicitud: ahora,
      });
    };

    inicializarConUrl();
  }, []);

  // Cargar usuarios activos con top=1000 e is_active=true (con soporte de caché y paginación)
  useEffect(() => {
    if (!puedeElegirSolicitante) return;

    const cargarUsuariosActivos = async () => {
      setCargandoUsuarios(true);
      try {
        // 1. Revisar caché persistente
        const enCache = leerDeCache(CLAVES_CATALOGO.usuarios);
        if (enCache && Array.isArray(enCache) && enCache.length > 0) {
          setTodosUsuarios(enCache);
          setCargandoUsuarios(false);
          return;
        }

        // 2. Fetch con top=1000 e is_active=true
        let urlPeticion = `${API_URL}/users/?format=json&is_active=true&top=1000`;
        let listaTotal = [];

        while (urlPeticion) {
          const res = await fetchAuth(urlPeticion);
          if (!res.ok) throw new Error(`Error ${res.status} al cargar usuarios`);
          const data = await res.json();
          const items = data.results ?? (Array.isArray(data) ? data : []);
          listaTotal = [...listaTotal, ...items];
          urlPeticion = data.next || null;
        }

        guardarEnCache(CLAVES_CATALOGO.usuarios, listaTotal);
        setTodosUsuarios(listaTotal);
      } catch (err) {
        console.error('Error al cargar catálogo de usuarios:', err);
        setTodosUsuarios([]);
      } finally {
        setCargandoUsuarios(false);
      }
    };

    cargarUsuariosActivos();
  }, [puedeElegirSolicitante]);

  // Filtrado de usuarios según rol:
  // - Gerente / Superuser: todos los usuarios activos (>70 empleados)
  // - Jefe / Coordinador / Supervisor / Staff: solo los de su área (vía area_id.nombre con user.area_id)
  const usuariosDisponibles = useMemo(() => {
    if (!todosUsuarios || todosUsuarios.length === 0) return [];

    if (esGerenteOSuperuser) {
      return todosUsuarios;
    }

    if (esMandoArea) {
      const miAreaNombre = (user?.area_id || '').toLowerCase().trim();

      return todosUsuarios.filter((u) => {
        // En users serializer el área siempre es u.area_id.nombre
        const uAreaNombre = (u.area_id?.nombre || '').toLowerCase().trim();

        if (miAreaNombre && uAreaNombre && miAreaNombre === uAreaNombre) {
          return true;
        }

        if (String(u.id) === String(user?.id)) return true;

        return false;
      });
    }

    return [];
  }, [todosUsuarios, esGerenteOSuperuser, esMandoArea, user]);

  // Opciones para el Combobox:
  // Subtítulo con "Área - Puesto" visible ÚNICAMENTE si el usuario logueado es Gerente o Superusuario
  const opcionesUsuarios = useMemo(() => {
    return usuariosDisponibles
      .map((u) => {
        const nombreCompleto =
          u.full_name ||
          `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
          u.username ||
          `Usuario #${u.id}`;

        // El área siempre es area_id.nombre y el puesto puesto_id.nombre para users serializer
        const nombreArea = u.area_id?.nombre || '';
        const nombrePuesto = u.puesto_id?.nombre || '';
        const subtituloAreaPuesto = [nombreArea, nombrePuesto].filter(Boolean).join(' - ');

        return {
          value: u.id,
          label: nombreCompleto,
          // Indicador de área y puesto como subtítulo solo visible para Gerente o Superusuario
          sublabel: esGerenteOSuperuser ? (subtituloAreaPuesto || null) : null,
          busquedaExtra: subtituloAreaPuesto,
          url: u.url || `${API_URL}/users/${u.id}/`,
          area_id: u.area_id?.id || u.area_id,
          area_url: u.area_id?.url || null,
          area_nombre: nombreArea,
          puesto_nombre: nombrePuesto,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [usuariosDisponibles, esGerenteOSuperuser]);

  const manejarCambio = (campo, valor) => onChange({ [campo]: valor });

  const manejarSolicitante = (usuarioId) => {
    const seleccionado = opcionesUsuarios.find((opt) => String(opt.value) === String(usuarioId));
    if (seleccionado) {
      onChange({
        usuario_id: seleccionado.value,
        usuario_url: seleccionado.url,
        usuario_nombre: seleccionado.label,
        usuario_puesto: seleccionado.puesto_nombre,
        ...(seleccionado.area_nombre ? {
          area_id: seleccionado.area_id || user.area_id,
          area_url: seleccionado.area_url || user.area_url,
          area_nombre: seleccionado.area_nombre || user.area_id,
        } : {})
      });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in font-outfit">
      <div>
        <h2 className="text-lg font-black text-brand-dark tracking-tight">Datos del Requerimiento</h2>
        <p className="text-xs text-gray-400 mt-0.5">Complete los datos generales de la solicitud de caja chica.</p>
      </div>

      {/* Alerta si falta el área del usuario */}
      {(!user?.area_id || user.area_id === 'Sin Área') && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 text-sm font-bold rounded-2xl px-4 py-3 animate-shake">
          <Info size={18} />
          <span>Error: Tu usuario no tiene un área asignada. No podrás continuar con la solicitud.</span>
        </div>
      )}

      {/* Área (solo lectura del requerimiento) y Solicitante */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">Área</label>
          <div className="bg-brand-light border border-gray-100 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-500 flex items-center gap-2">
            <Info size={15} className="text-brand-primary shrink-0" />
            {datos.area_nombre || datos.area_id || user?.area_id || '—'}
          </div>
        </div>

        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">
            {puedeElegirSolicitante ? (
              <span className="flex items-center gap-1.5">
                <Users size={13} className="text-brand-primary" />
                Solicitante
                {esGerenteOSuperuser && (
                  <span className="text-[10px] font-bold text-gray-400 lowercase">
                    ({opcionesUsuarios.length} activos)
                  </span>
                )}
              </span>
            ) : (
              'Solicitante'
            )}
          </label>
          {puedeElegirSolicitante ? (
            <Combobox
              options={opcionesUsuarios}
              value={datos.usuario_id}
              onChange={(val) => manejarSolicitante(val)}
              placeholder={cargandoUsuarios ? 'Cargando colaboradores...' : 'Seleccione o busque solicitante...'}
              disabled={cargandoUsuarios}
              minParaBusqueda={6}
              icon={<Users size={14} className="text-brand-primary" />}
            />
          ) : (
            <div className="bg-brand-light border border-gray-100 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-500 flex items-center gap-2">
              <Info size={15} className="text-brand-primary shrink-0" />
              {user?.nombre || '—'}
            </div>
          )}
        </div>
      </div>

      {/* Monto solicitado y Fecha-hora */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">
            Monto Solicitado
            <span className="ml-1 text-gray-400 font-medium normal-case tracking-normal">(opcional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-primary">S/.</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00 — se calcula del detalle"
              value={datos.monto_solicitado || ''}
              onChange={(e) => manejarCambio('monto_solicitado', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl pl-12 pr-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">Fecha y Hora de Solicitud</label>
          <input
            type="datetime-local"
            value={datos.fecha_solicitud || ahora}
            onChange={(e) => manejarCambio('fecha_solicitud', e.target.value)}
            className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
          />
        </div>
      </div>

      {/* Observaciones — solo visible para supervisores/jefes/gerentes */}
      {puedeElegirSolicitante && (
        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2 flex items-center gap-2">
            <FileText size={14} className="text-brand-primary" />
            Observaciones
          </label>
          <textarea
            rows={2}
            placeholder="Notas o indicaciones adicionales para el requerimiento..."
            value={datos.obs || ''}
            onChange={(e) => manejarCambio('obs', e.target.value)}
            className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-medium text-brand-dark outline-none transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
};

export default Step1Cabecera;
