import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, Bell, User, Search, PlusCircle, RefreshCw } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { limpiarCatalogos } from '../utils/catalogoCache';

/**
 * Header Premium con diseño refinado, búsqueda integrada y perfil estilizado.
 */
const Header = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [cacheLimpiado, setCacheLimpiado] = useState(false);
  const { user, logout } = useUserStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Limpia todos los catálogos guardados en memoria y muestra confirmación breve
  const handleLimpiarCache = () => {
    limpiarCatalogos();
    setCacheLimpiado(true);
    setTimeout(() => setCacheLimpiado(false), 2000);
  };

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

        <div className="hidden lg:flex items-center bg-brand-light border border-gray-100 rounded-2xl px-4 py-2 w-80 group focus-within:ring-2 focus-within:ring-brand-primary/10 focus-within:border-brand-primary transition-premium">
          <Search size={18} className="text-gray-400 group-focus-within:text-brand-primary transition-premium" />
          <input
            type="text"
            placeholder="Buscar solicitudes o comprobantes..."
            className="bg-transparent border-none outline-none px-3 text-sm text-gray-700 w-full placeholder:text-gray-400 font-medium"
          />
        </div>
      </div>

      {/* Acciones e Info de Usuario */}
      <div className="flex items-center gap-6">
        {/* Notificaciones Premium */}
        <button
          onClick={() => navigate('/nueva-solicitud')}
          className="relative p-2.5 text-gray-400 hover:text-brand-primary hover:bg-brand-light rounded-2xl transition-premium group"
        >
          <PlusCircle size={22} />
        </button>

        {/* Separador */}
        <div className="h-8 w-[1px] bg-gray-100 hidden md:block"></div>

        {/* Perfil de Usuario Premium */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-4 p-1 rounded-2xl hover:bg-brand-light transition-premium group focus:outline-none"
          >
            <div className="flex flex-col items-end leading-tight text-right hidden sm:flex">
              <span className="text-[18px] font-black text-brand-dark group-hover:text-brand-primary transition-premium tracking-tight">
                {user?.nombre || 'Nombre de Usuario'}
              </span>
              <span className="text-[14px] text-gray-400 font-medium mt-0.5">
                {user?.area || 'Área'} • {user?.puesto || 'Puesto'}
              </span>
            </div>

            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary p-[2px] shadow-lg group-hover:shadow-brand-primary/20 transition-premium rotate-3 group-hover:rotate-0">
              <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-brand-primary" />
                )}
              </div>
            </div>

            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform duration-500 ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Menú Desplegable Premium */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-4 w-60 bg-white rounded-2xl shadow-2xl border border-gray-50 py-3 z-50 animate-slide-up">
              <div className="px-5 py-3 border-b border-gray-50 mb-2 md:hidden">
                <span className="text-sm font-bold text-brand-dark">{user?.nombre}</span>
                <p className="text-xs text-brand-primary font-bold">{user?.puesto}</p>
              </div>

              <button className="w-full flex items-center gap-3 px-5 py-3 text-gray-600 hover:bg-brand-light hover:text-brand-primary transition-premium text-sm font-semibold">
                <User size={16} />
                Mi Perfil
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-5 py-3 text-red-500 hover:bg-red-50 transition-premium text-sm font-bold mt-2"
              >
                <LogOut size={16} />
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
