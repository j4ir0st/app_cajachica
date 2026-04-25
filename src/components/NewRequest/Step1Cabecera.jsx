import React, { useEffect, useState } from 'react';
import { DollarSign, FileText, Info, ChevronDown, Users } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { fetchAuth } from '../../utils/fetchAuth';

const API_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL;

// Puestos con permisos ampliados para elegir solicitante de su área
const PUESTOS_SUPERVISORES = ['coordinador', 'supervisor', 'jefe', 'gerente'];

/**
 * Determina si el puesto del usuario le permite seleccionar el solicitante.
 */
const esSupervisor = (puesto) =>
  PUESTOS_SUPERVISORES.some((p) => puesto?.toLowerCase().includes(p));

/**
 * Paso 1: Datos de cabecera del requerimiento.
 * - Supervisores/Jefes/Gerentes pueden elegir el solicitante de su área.
 * - El campo observaciones solo es visible para supervisores.
 * - La fecha toma la hora actual y permite al usuario modificarla.
 * @param {Object} datos - Estado actual del formulario maestro.
 * @param {Function} onChange - Callback para actualizar el estado maestro.
 */
const Step1Cabecera = ({ datos, onChange }) => {
  const { user, updateUser } = useUserStore();
  const esSup = esSupervisor(user?.puesto);

  // Fecha-hora actual en formato datetime-local (YYYY-MM-DDTHH:mm)
  const [ahora] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [usuariosArea, setUsuariosArea] = useState([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);

  // Pre-poblar datos del usuario autenticado al montar.
  // Si el store no tiene las URLs (sesión antigua), las obtiene de la API.
  useEffect(() => {
    if (!user || datos.usuario_id) return;

    const inicializarConUrl = async () => {
      let usuarioUrl = user.url     || null;
      let areaUrl    = user.area_url || null;

      // Recuperar URLs si no están en el store (sesión iniciada antes del cambio)
      if (!usuarioUrl || !areaUrl) {
        try {
          const res  = await fetchAuth(`${API_URL}/users/${user.id}/?format=json`);
          const data = await res.json();
          usuarioUrl = data.url            || null;
          areaUrl    = data.area_id?.url   || null;
          // Persistir en el store para no repetir el fetch la próxima vez
          updateUser({ url: usuarioUrl, area_url: areaUrl });
        } catch {
          console.warn('No se pudo recuperar la URL de perfil del usuario.');
        }
      }

      onChange({
        usuario_id:     user.id,
        usuario_url:    usuarioUrl,
        area_id:        user.area_id,
        area_url:       areaUrl,
        area_nombre:    user.area,
        usuario_nombre: user.nombre,
        fecha_solicitud: ahora,
      });
    };

    inicializarConUrl();
  }, []);

  // Si es supervisor, carga los usuarios de su área de manera asíncrona
  useEffect(() => {
    if (!esSup || !user?.area) return;
    const cargarUsuariosArea = async () => {
      setCargandoUsuarios(true);
      try {
        const res = await fetchAuth(
          `${API_URL}/users/?format=json&area_nombre=${encodeURIComponent(user.area)}`
        );
        const data = await res.json();
        const lista = data.results ?? data;
        // Se guarda tanto id, nombre como la URL hyperlinked de cada usuario
        setUsuariosArea(lista.map((u) => ({
          id: u.id,
          url: u.url || null,
          nombre: `${u.first_name} ${u.last_name}`.trim() || u.username,
        })));
      } catch {
        setUsuariosArea([]);
      } finally {
        setCargandoUsuarios(false);
      }
    };
    cargarUsuariosArea();
  }, [esSup, user?.area]);

  const manejarCambio = (campo, valor) => onChange({ [campo]: valor });

  const manejarSolicitante = (usuarioId) => {
    const seleccionado = usuariosArea.find((u) => String(u.id) === String(usuarioId));
    if (seleccionado) {
      onChange({
        usuario_id:   seleccionado.id,
        usuario_url:  seleccionado.url,   // URL hyperlinked para el POST
        usuario_nombre: seleccionado.nombre,
      });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-black text-brand-dark tracking-tight">Datos del Requerimiento</h2>
        <p className="text-sm text-gray-400 mt-0.5">Complete los datos generales de la solicitud de caja chica.</p>
      </div>

      {/* Área (siempre solo lectura) y Solicitante */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">Área</label>
          <div className="bg-brand-light border border-gray-100 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-500 flex items-center gap-2">
            <Info size={15} className="text-brand-primary shrink-0" />
            {user?.area || '—'}
          </div>
        </div>

        <div>
          <label className="block text-xs font-black text-brand-dark uppercase tracking-widest mb-2">
            {esSup ? <span className="flex items-center gap-1.5"><Users size={13} className="text-brand-primary" />Solicitante</span> : 'Solicitante'}
          </label>
          {esSup ? (
            <div className="relative">
              <select
                value={datos.usuario_id || ''}
                onChange={(e) => manejarSolicitante(e.target.value)}
                disabled={cargandoUsuarios}
                className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors disabled:opacity-60"
              >
                {cargandoUsuarios
                  ? <option>Cargando...</option>
                  : usuariosArea.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)
                }
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
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
            <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary" />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00 — se calcula del detalle"
              value={datos.monto_solicitado || ''}
              onChange={(e) => manejarCambio('monto_solicitado', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
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
      {esSup && (
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
