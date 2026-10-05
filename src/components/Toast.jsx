import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X, AlertTriangle, Info } from 'lucide-react';

// ============================================================================
// COMPONENTE TOAST / NOTIFICACIÓN FLOTANTE REUTILIZABLE
// ============================================================================

const TIPOS_NOTIFICACION = {
  error: {
    icono: AlertCircle,
    claseContenedor: 'bg-red-500 text-white shadow-red-500/30 border-red-400',
    claseBoton: 'hover:bg-red-600',
    tituloPorDefecto: 'Ocurrió un error',
  },
  exito: {
    icono: CheckCircle2,
    claseContenedor: 'bg-emerald-600 text-white shadow-emerald-600/30 border-emerald-500',
    claseBoton: 'hover:bg-emerald-700',
    tituloPorDefecto: 'Operación exitosa',
  },
  advertencia: {
    icono: AlertTriangle,
    claseContenedor: 'bg-amber-500 text-white shadow-amber-500/30 border-amber-400',
    claseBoton: 'hover:bg-amber-600',
    tituloPorDefecto: 'Atención',
  },
  info: {
    icono: Info,
    claseContenedor: 'bg-blue-600 text-white shadow-blue-600/30 border-blue-500',
    claseBoton: 'hover:bg-blue-700',
    tituloPorDefecto: 'Información',
  },
};

/**
 * Notificación flotante fija en la parte superior central de la pantalla.
 * Permite ver errores y éxitos desde cualquier posición de scroll en móvil y desktop.
 */
const Toast = ({
  tipo = 'error',
  titulo,
  mensaje,
  alCerrar,
  duracion = 6000,
}) => {
  useEffect(() => {
    if (!duracion || !alCerrar) return;
    const temporizador = setTimeout(() => {
      alCerrar();
    }, duracion);
    return () => clearTimeout(temporizador);
  }, [duracion, alCerrar]);

  if (!mensaje) return null;

  const config = TIPOS_NOTIFICACION[tipo] || TIPOS_NOTIFICACION.error;
  const Icono = config.icono;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92vw] max-w-md animate-bounce-in font-outfit">
      <div
        className={`flex items-start gap-3 p-4 rounded-2xl shadow-2xl border ${config.claseContenedor} transition-all`}
      >
        <div className="p-1 rounded-xl bg-white/20 shrink-0 mt-0.5">
          <Icono size={20} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-black uppercase tracking-wider text-white">
            {titulo || config.tituloPorDefecto}
          </h4>
          <p className="text-xs font-medium text-white/95 mt-0.5 leading-relaxed break-words whitespace-pre-line">
            {mensaje}
          </p>
        </div>

        {alCerrar && (
          <button
            type="button"
            onClick={alCerrar}
            className={`p-1.5 rounded-xl text-white/80 hover:text-white ${config.claseBoton} transition-colors shrink-0`}
            title="Cerrar notificación"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
