import React from 'react';
import { Check } from 'lucide-react';

// Estado visual de cada paso del stepper
const ESTADOS = { pendiente: 'pendiente', activo: 'activo', completado: 'completado' };

/**
 * Componente Stepper para navegación visual entre pasos del formulario.
 * @param {number} pasoActual - Índice del paso actual (1-based).
 * @param {Array} pasos - Lista de objetos con { etiqueta }.
 */
const Stepper = ({ pasoActual, pasos }) => {
  const obtenerEstado = (indicePaso) => {
    if (indicePaso + 1 < pasoActual) return ESTADOS.completado;
    if (indicePaso + 1 === pasoActual) return ESTADOS.activo;
    return ESTADOS.pendiente;
  };

  return (
    <div className="flex items-center w-full">
      {pasos.map((paso, i) => {
        const estado = obtenerEstado(i);
        const esUltimo = i === pasos.length - 1;

        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center">
              {/* Círculo del paso */}
              <div className={`
                w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-black text-xs sm:text-sm transition-all duration-500
                ${estado === ESTADOS.completado ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30' : ''}
                ${estado === ESTADOS.activo ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30 scale-105' : ''}
                ${estado === ESTADOS.pendiente ? 'bg-gray-100 text-gray-400 border-2 border-gray-200' : ''}
              `}>
                {estado === ESTADOS.completado ? <Check size={16} strokeWidth={3} /> : i + 1}
              </div>
              {/* Etiqueta del paso */}
              <span className={`
                text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] mt-1.5 transition-colors duration-300
                ${estado === ESTADOS.activo ? 'text-brand-primary' : ''}
                ${estado === ESTADOS.completado ? 'text-brand-primary' : ''}
                ${estado === ESTADOS.pendiente ? 'text-gray-400' : ''}
              `}>
                {paso.etiqueta}
              </span>
            </div>

            {/* Línea conectora */}
            {!esUltimo && (
              <div className="flex-1 mx-2 sm:mx-3 mb-4">
                <div className={`
                  h-0.5 transition-all duration-700
                  ${estado === ESTADOS.completado ? 'bg-brand-primary' : 'bg-gray-200'}
                `} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Stepper;
