import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, Bell, User, Search, PlusCircle, Plus, RefreshCw, Settings } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useCatalogoStore } from '../store/catalogoStore';
import { limpiarCatalogos } from '../utils/catalogoCache';

/**
 * Header Premium con diseño refinado, búsqueda integrada y perfil estilizado.
 */
const Header = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [cacheLimpiado, setCacheLimpiado] = useState(false);
  const [recargandoLiquidaciones, setRecargandoLiquidaciones] = useState(false);
  const [busquedaHeader, setBusquedaHeader] = useState('');
  const perfilContenedorRef = useRef(null);

  const { user, logout } = useUserStore();
  const { cargarCatalogos } = useCatalogoStore();
  const navigate = useNavigate();

  // Cerrar el menú desplegable al hacer clic fuera
  useEffect(() => {
    if (!isDropdownOpen) return;
    const clickAfuera = (e) => {
      if (perfilContenedorRef.current && !perfilContenedorRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', clickAfuera);
    document.addEventListener('touchstart', clickAfuera, { passive: true });
    return () => {
      document.removeEventListener('mousedown', clickAfuera);
      document.removeEventListener('touchstart', clickAfuera);
    };
  }, [isDropdownOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Ejecuta la búsqueda global redirigiendo al listado de solicitudes
  const ejecutarBusqueda = (e) => {
    if (e) e.preventDefault();
    const query = busquedaHeader.trim();
    if (query) {
      navigate(`/mis-solicitudes?buscar=${encodeURIComponent(query)}`);
    } else {
      navigate('/mis-solicitudes');
    }
  };

  // Limpia todos los catálogos guardados en memoria y fuerza la recarga desde la API (al pulsar título)
  const handleLimpiarCache = () => {
    limpiarCatalogos();
    cargarCatalogos(true); // Forzar recarga inmediata
    setCacheLimpiado(true);
    setTimeout(() => setCacheLimpiado(false), 2000);
  };

  // Actualiza exclusivamente el listado de liquidaciones (al pulsar botón móvil)
  const handleRecargarLiquidaciones = () => {
    window.dispatchEvent(new CustomEvent('app:recargar-datos'));
    setRecargandoLiquidaciones(true);
    setTimeout(() => setRecargandoLiquidaciones(false), 1200);
  };

  // Datos del perfil unificado Surgicorp
  const nombreCompleto =
    user?.full_name ||
    user?.nombre ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.username ||
    'Usuario';

  const areaPuesto =
    [user?.area_id, user?.puesto].filter(Boolean).join(' - ') || 'Sin Asignación';

  const emailUsuario =
    user?.email || user?.correo || (user?.username ? `${user.username}@surgicorperu.com` : '—');

  const empresaUsuario = user?.empresa || user?.empr_id || 'SURGICORP S.R.L.';
  const esAdmin = Boolean(user?.is_staff || user?.is_superuser);

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 h-20 md:h-24 flex items-center justify-between px-6 md:px-10 sticky top-0 z-40 transition-premium shadow-sm">
      {/* Título y Búsqueda (Desktop) */}
      <div className="flex items-center gap-10">
        <div className="flex flex-col gap-0 leading-none">
          <button
            onClick={handleLimpiarCache}
            title="Click para actualizar catálogos"
            className="flex items-center gap-1.5 group text-left"
          >
            <h1 className="text-2xl font-black text-brand-dark tracking-tighter group-hover:text-brand-primary transition-colors">
              CAJA<span className="text-brand-primary">CHICA</span>
            </h1>
            <RefreshCw
              size={13}
              className={`text-gray-300 group-hover:text-brand-primary transition-all ${
                cacheLimpiado ? 'animate-spin text-brand-primary' : ''
              }`}
            />
          </button>
          {cacheLimpiado && (
            <span className="text-[9px] text-brand-primary font-bold uppercase tracking-widest animate-fade-in">
              Catálogos actualizados
            </span>
          )}
          {!cacheLimpiado && (
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em] mt-0.5">
              Gestión Centralizada de Gastos
            </p>
          )}
        </div>

        <form onSubmit={ejecutarBusqueda} className="hidden lg:flex items-center bg-brand-light border border-gray-100 rounded-2xl px-4 py-2 w-80 group focus-within:ring-2 focus-within:ring-brand-primary/10 focus-within:border-brand-primary transition-premium">
          <button type="submit" title="Buscar" className="text-gray-400 group-focus-within:text-brand-primary hover:text-brand-primary transition-premium">
            <Search size={18} />
          </button>
          <input
            type="text"
            value={busquedaHeader}
            onChange={(e) => setBusquedaHeader(e.target.value)}
            placeholder="Buscar solicitudes o comprobantes..."
            className="bg-transparent border-none outline-none px-3 text-sm text-gray-700 w-full placeholder:text-gray-400 font-medium"
          />
        </form>
      </div>

      {/* Acciones e Info de Usuario */}
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Botón Nueva Rendición Destacado */}
        <button
          onClick={() => navigate('/nueva-solicitud')}
          title="Crear Nueva Rendición"
          className="flex items-center justify-center gap-1.5 sm:gap-2 bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-black text-xs px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl shadow-md shadow-brand-primary/25 hover:shadow-lg hover:shadow-brand-primary/35 hover:scale-105 active:scale-95 transition-all group shrink-0"
        >
          <Plus size={22} strokeWidth={3} className="w-5 h-5 sm:w-4 sm:h-4 transition-transform group-hover:rotate-90 duration-300 shrink-0" />
          <span className="hidden sm:inline tracking-wider">NUEVA RENDICIÓN</span>
        </button>

        {/* Botón de Actualizar Liquidaciones (Exclusivo para vista móvil) */}
        <button
          onClick={handleRecargarLiquidaciones}
          title="Actualizar listado de liquidaciones"
          className="flex sm:hidden relative p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-light rounded-2xl transition-premium group"
        >
          <RefreshCw
            size={20}
            className={`transition-all ${recargandoLiquidaciones ? 'animate-spin text-brand-primary' : ''}`}
          />
        </button>

        {/* Separador */}
        <div className="h-8 w-[1px] bg-gray-100 hidden md:block"></div>

        {/* Perfil de Usuario - Modelo Unificado Surgicorp */}
        <div className="relative" ref={perfilContenedorRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-brand-light/70 transition-all group focus:outline-none"
            aria-label="Menú de usuario"
            aria-expanded={isDropdownOpen}
          >
            {/* Avatar circular con borde fino */}
            <div className="w-9 h-9 rounded-full border-2 border-white ring-2 ring-brand-primary/25 overflow-hidden bg-brand-light flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
              {user?.avatar ? (
                <img src={user.avatar} alt={nombreCompleto} className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-brand-primary" />
              )}
            </div>

            {/* Nombre y Badge de Área - Puesto */}
            <div className="flex flex-col items-start leading-tight text-left hidden sm:flex">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-brand-dark group-hover:text-brand-primary transition-colors tracking-tight truncate max-w-[160px] md:max-w-[200px]">
                  {nombreCompleto}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-gray-400 group-hover:text-brand-primary transition-transform duration-300 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
              <span className="mt-0.5 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-brand-light text-brand-primary border border-brand-primary/20 truncate max-w-[160px] md:max-w-[200px]">
                {areaPuesto}
              </span>
            </div>

            {/* Chevron solo visible en móvil cuando el texto está oculto */}
            <ChevronDown
              size={13}
              className={`text-gray-400 sm:hidden transition-transform duration-300 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Tarjeta Desplegable del Perfil: Ancho ajustado al control en desktop */}
          {isDropdownOpen && (
            <div className="absolute right-0 sm:left-0 sm:right-0 mt-1.5 w-60 sm:w-full bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-50 animate-slide-up select-none">
              {/* Información Detallada del Usuario Compacta */}
              <div className="flex flex-col text-left">
                <h3 className="text-sm font-bold text-slate-800 leading-tight tracking-tight truncate" title={nombreCompleto}>
                  {nombreCompleto}
                </h3>
                <p className="text-[12.5px] text-slate-500 font-medium mt-0.5 leading-tight truncate" title={areaPuesto}>
                  {areaPuesto}
                </p>
                <a
                  href={`mailto:${emailUsuario}`}
                  className="text-[12.5px] text-brand-primary hover:underline font-semibold mt-1 truncate block"
                  title={emailUsuario}
                >
                  {emailUsuario}
                </a>
                <p className="text-[12px] font-black text-brand-primary uppercase tracking-wide mt-1 truncate" title={empresaUsuario}>
                  {empresaUsuario}
                </p>
              </div>

              {/* Separador Compacto */}
              <div className="border-t border-gray-100 my-2"></div>

              {/* Acciones Compactas */}
              <div className="flex flex-col gap-0.5">
                {/* Botón de Administrador (visible solo si is_staff o is_superuser) */}
                {esAdmin && (
                  <a
                    href="https://appsurgicorperu.com/admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:text-brand-primary hover:bg-brand-light rounded-lg transition-all group"
                  >
                    <Settings size={16} className="text-slate-400 group-hover:text-brand-primary transition-colors shrink-0" />
                    <span>Administrador</span>
                  </a>
                )}

                {/* Botón Cerrar Sesión */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-all group text-left"
                >
                  <LogOut size={16} className="text-red-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
