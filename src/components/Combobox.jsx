import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Check } from 'lucide-react';

/**
 * Componente Combobox estilo PowerApps con búsqueda reactiva en memoria.
 * - Renderizado en un Portal flotante (createPortal) fijado al viewport:
 *   NO expande la tarjeta contenedora ni provoca scroll lateral ni agranda la pantalla en móviles.
 * - Auto-posicionamiento inteligente: se abre hacia abajo o hacia arriba según el espacio disponible.
 * - Scroll interno propio: el menú flotante tiene altura máxima fija y scroll interno independiente.
 * - Soporta teclado (Escape, Enter, Flechas) y touch móvil con preventScroll.
 *
 * @param {Array} options - Arreglo de opciones [{ value, label, sublabel, ... }]
 * @param {any} value - Valor actualmente seleccionado (coincide con option.value)
 * @param {Function} onChange - Callback (nuevoValor, opcionSeleccionada)
 * @param {string} placeholder - Texto cuando no hay selección
 * @param {boolean} disabled - Si está deshabilitado
 * @param {number} minParaBusqueda - Umbral de opciones para activar buscador (default 6)
 * @param {React.ReactNode} icon - Ícono decorativo opcional a la izquierda
 * @param {boolean} allowClear - Permitir botón de limpiar (X)
 */
const Combobox = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Seleccione una opción...',
  disabled = false,
  minParaBusqueda = 6,
  icon = null,
  allowClear = true,
  className = '',
  emptyMessage = 'No se encontraron resultados'
}) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [indiceResaltado, setIndiceResaltado] = useState(0);
  const [posicion, setPosicion] = useState({
    top: undefined,
    bottom: undefined,
    left: 0,
    width: 250,
    maxHeight: 280,
    abrirArriba: false,
  });

  const gatilloRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputBusquedaRef = useRef(null);
  const listaRef = useRef(null);

  // Determinar si esta lista requiere búsqueda (> 6 opciones por regla de negocio)
  const requiereBusqueda = options.length > minParaBusqueda;

  // Encontrar la opción actualmente seleccionada
  const opcionSeleccionada = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return options.find((opt) => String(opt.value) === String(value)) || null;
  }, [options, value]);

  // Filtrado en memoria de alta velocidad
  const opcionesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return options;

    const terminos = busqueda
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return options.filter((opt) => {
      const textoLabel = (opt.label || '').toLowerCase();
      const textoSub = (opt.sublabel || '').toLowerCase();
      const textoExtra = (opt.busquedaExtra || '').toLowerCase();
      const textoCompleto = `${textoLabel} ${textoSub} ${textoExtra}`;

      return terminos.every((t) => textoCompleto.includes(t));
    });
  }, [options, busqueda]);

  // Limitar renderización a 80 elementos en DOM para ultra-fluidez con listas grandes
  const limiteRender = 80;
  const opcionesVisibles = useMemo(() => {
    return opcionesFiltradas.slice(0, limiteRender);
  }, [opcionesFiltradas]);

  // Cálculo de posición flotante sobre el viewport
  const actualizarPosicion = useCallback(() => {
    if (!gatilloRef.current) return;
    const rect = gatilloRef.current.getBoundingClientRect();

    // Si el elemento gatillo fue ocultado o scrolleado fuera de pantalla, cerrar
    if (rect.bottom < -20 || rect.top > window.innerHeight + 20) {
      setAbierto(false);
      return;
    }

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    const espacioAbajo = viewportH - rect.bottom - 12;
    const espacioArriba = rect.top - 12;

    // Abrir hacia arriba si abajo hay menos de 190px y arriba hay más espacio
    const abrirArriba = espacioAbajo < 190 && espacioArriba > espacioAbajo;

    // Ancho ajustado a pantalla (en celulares evita desbordar los bordes)
    const anchoDeseado = Math.max(rect.width, 240);
    const anchoFinal = Math.min(anchoDeseado, viewportW - 16);

    // Ajustar posición horizontal (left) para que nunca salga del viewport
    let leftFinal = rect.left;
    if (leftFinal + anchoFinal > viewportW - 8) {
      leftFinal = viewportW - anchoFinal - 8;
    }
    if (leftFinal < 8) {
      leftFinal = 8;
    }

    // Altura máxima del menú flotante con tope de 280px para mantener scroll interno fluido
    const espacioDisponible = abrirArriba ? espacioArriba : espacioAbajo;
    const maxHFinal = Math.min(280, Math.max(160, espacioDisponible - 8));

    setPosicion({
      top: abrirArriba ? undefined : rect.bottom + 6,
      bottom: abrirArriba ? viewportH - rect.top + 6 : undefined,
      left: Math.round(leftFinal),
      width: Math.round(anchoFinal),
      maxHeight: Math.round(maxHFinal),
      abrirArriba,
    });
  }, []);

  // Abrir y enfocar automáticamente el buscador sin saltos de scroll
  const handleAbrir = () => {
    if (disabled) return;
    actualizarPosicion();
    setAbierto((prev) => {
      const nuevo = !prev;
      if (nuevo) {
        setBusqueda('');
        setIndiceResaltado(0);
        setTimeout(() => {
          actualizarPosicion();
          if (requiereBusqueda && inputBusquedaRef.current) {
            inputBusquedaRef.current.focus({ preventScroll: true });
          }
        }, 30);
      }
      return nuevo;
    });
  };

  const handleCerrar = useCallback(() => {
    setAbierto(false);
    setBusqueda('');
  }, []);

  const handleSeleccionar = (opcion) => {
    if (onChange) {
      onChange(opcion ? opcion.value : null, opcion);
    }
    handleCerrar();
  };

  const handleLimpiar = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange(null, null);
    }
    setBusqueda('');
  };

  // Escuchar redimensionamiento y scroll global para mantener anclado el menú flotante
  useEffect(() => {
    if (!abierto) return;

    actualizarPosicion();

    const onScrollOrResize = () => {
      actualizarPosicion();
    };

    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [abierto, actualizarPosicion]);

  // Cierre por click o toque exterior
  useEffect(() => {
    if (!abierto) return;

    const clickExterior = (e) => {
      const enGatillo = gatilloRef.current && gatilloRef.current.contains(e.target);
      const enDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);

      if (!enGatillo && !enDropdown) {
        handleCerrar();
      }
    };

    document.addEventListener('mousedown', clickExterior);
    document.addEventListener('touchstart', clickExterior, { passive: true });

    return () => {
      document.removeEventListener('mousedown', clickExterior);
      document.removeEventListener('touchstart', clickExterior);
    };
  }, [abierto, handleCerrar]);

  // Manejador de teclado
  const handleKeyDown = (e) => {
    if (!abierto) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        handleAbrir();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceResaltado((prev) => Math.min(prev + 1, opcionesVisibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceResaltado((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opcionesVisibles[indiceResaltado]) {
        handleSeleccionar(opcionesVisibles[indiceResaltado]);
      }
    }
  };

  // Asegura que el elemento resaltado esté visible en el scroll interno
  useEffect(() => {
    if (abierto && listaRef.current) {
      const elemento = listaRef.current.children[indiceResaltado];
      if (elemento) {
        elemento.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [indiceResaltado, abierto]);

  return (
    <div
      className={`relative w-full font-outfit ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Gatillo / Botón principal del Combobox */}
      <div
        ref={gatilloRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleAbrir}
        className={`w-full flex items-center justify-between gap-2 bg-white border-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all select-none cursor-pointer ${
          disabled
            ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-60'
            : abierto
            ? 'border-brand-primary ring-2 ring-brand-primary/10 shadow-sm'
            : 'border-gray-100 hover:border-gray-200 text-brand-dark'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          {opcionSeleccionada ? (
            <div className="flex flex-col text-left truncate min-w-0">
              <span className="truncate font-bold text-brand-dark">
                {opcionSeleccionada.label}
              </span>
              {opcionSeleccionada.sublabel && (
                <span className="text-[10px] text-gray-400 font-semibold truncate">
                  {opcionSeleccionada.sublabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {allowClear && opcionSeleccionada && !disabled && (
            <button
              type="button"
              onClick={handleLimpiar}
              title="Limpiar selección"
              className="p-1 hover:bg-gray-100 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-gray-400 transition-transform duration-200 ${
              abierto ? 'rotate-180 text-brand-primary' : ''
            }`}
          />
        </div>
      </div>

      {/* Menú Desplegable Flotante tipo PowerApps vía Portal (fuera del flujo del DOM) */}
      {abierto &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: posicion.top !== undefined ? `${posicion.top}px` : undefined,
              bottom: posicion.bottom !== undefined ? `${posicion.bottom}px` : undefined,
              left: `${posicion.left}px`,
              width: `${posicion.width}px`,
              maxHeight: `${posicion.maxHeight}px`,
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-outfit animate-fade-in"
          >
            {/* Barra de búsqueda interactiva (fija en la parte superior del cuadro flotante) */}
            {requiereBusqueda && (
              <div className="p-2.5 border-b border-gray-100 bg-gray-50/90 shrink-0">
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-3 text-gray-400 pointer-events-none" />
                  <input
                    ref={inputBusquedaRef}
                    type="text"
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value);
                      setIndiceResaltado(0);
                    }}
                    placeholder={`Buscar entre ${options.length} opciones...`}
                    className="w-full bg-white border border-gray-200 focus:border-brand-primary rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-brand-dark placeholder-gray-400 outline-none transition-colors"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      onClick={() => {
                        setBusqueda('');
                        inputBusquedaRef.current?.focus({ preventScroll: true });
                      }}
                      className="absolute right-2.5 text-gray-400 hover:text-brand-dark p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Indicador de conteo tipo PowerApps */}
                <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-1.5">
                  <span>Resultados: {opcionesFiltradas.length}</span>
                  {opcionesFiltradas.length > limiteRender && (
                    <span className="text-brand-primary font-black">
                      (Primeros {limiteRender})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Lista con Scroll Interno Propio del Controlador */}
            <div
              ref={listaRef}
              className="overflow-y-auto divide-y divide-gray-50 flex-1 py-1 custom-scrollbar"
              style={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {opcionesVisibles.length === 0 ? (
                <div className="py-7 px-4 text-center">
                  <Search size={20} className="mx-auto text-gray-300 mb-1.5" />
                  <p className="text-xs font-bold text-gray-400">{emptyMessage}</p>
                  {busqueda && (
                    <p className="text-[10px] text-gray-300 mt-1">
                      No hay coincidencias para &quot;{busqueda}&quot;
                    </p>
                  )}
                </div>
              ) : (
                opcionesVisibles.map((opt, idx) => {
                  const esActual = String(opt.value) === String(value);
                  const esResaltado = idx === indiceResaltado;

                  return (
                    <div
                      key={`${opt.value}-${idx}`}
                      onClick={() => handleSeleccionar(opt)}
                      onMouseEnter={() => setIndiceResaltado(idx)}
                      className={`px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                        esActual
                          ? 'bg-brand-light text-brand-primary font-black'
                          : esResaltado
                          ? 'bg-gray-50 text-brand-dark font-bold'
                          : 'text-gray-700 font-medium hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex flex-col text-left truncate flex-1 min-w-0">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span
                            className={`text-[10px] truncate ${
                              esActual ? 'text-brand-primary/70' : 'text-gray-400'
                            }`}
                          >
                            {opt.sublabel}
                          </span>
                        )}
                      </div>

                      {esActual && (
                        <Check size={14} className="text-brand-primary shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Combobox;
