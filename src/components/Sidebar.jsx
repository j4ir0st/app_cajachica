import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  FileCheck,
  History,
  PieChart,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  CreditCard
} from 'lucide-react';
import { useUserStore } from '../store/userStore';

/**
 * Sidebar Responsivo Premium con diseño colapsable y estados de alta fidelidad.
 * Utiliza gradientes institucionales y micro-animaciones superiores.
 */
const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useUserStore();
  const apiUrl = import.meta.env.DEV ? '/' : import.meta.env.VITE_API_URL;
  const logoUrl = `${apiUrl}${import.meta.env.VITE_SURGI_LOGO}`;

  const menuItems = [
    {
      title: 'Panel General',
      icon: LayoutDashboard,
      path: '/dashboard',
      roles: ['gerente', 'jefe', 'coordinador', 'usuario']
    },
    {
      title: 'Nueva Solicitud',
      icon: PlusCircle,
      path: '/nueva-solicitud',
      roles: ['usuario', 'gerente']
    },
    {
      title: 'Mis Solicitudes',
      icon: FileText,
      path: '/mis-solicitudes',
      roles: ['usuario', 'gerente', 'jefe', 'coordinador']
    },
    {
      title: 'Aprobaciones',
      icon: FileCheck,
      path: '/aprobaciones',
      roles: ['gerente', 'jefe', 'coordinador']
    },
    {
      title: 'Cierre de Caja',
      icon: History,
      path: '/cierre-caja',
      roles: ['gerente']
    },
    {
      title: 'Balance Semanal',
      icon: PieChart,
      path: '/balance',
      roles: ['gerente']
    },
  ];

  // Filtrar por rol (Simulación básica)
  const filteredItems = menuItems;
  // En producción: menuItems.filter(item => item.roles.includes(user?.rol));

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-brand-dark text-white relative">
      {/* Brand Header */}
      <div className={`flex items-center justify-between p-6 mb-2 ${collapsed ? 'flex-col gap-4' : 'flex-row'}`}>
        {!collapsed ? (
          <div className="flex items-center justify-between w-full">
            <img
              src={logoUrl}
              alt="Surgicorp Logo"
              className="h-16 object-contain filter brightness-0 invert"
            />
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-premium"
            >
              <Menu size={20} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-xl bg-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white transition-premium"
            >
              <Menu size={22} />
            </button>
          </div>
        )}
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto pt-4 scrollbar-hide">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-premium group relative
              ${isActive
                ? 'bg-gradient-to-r from-brand-primary to-brand-primary/60 text-white shadow-lg shadow-brand-primary/20'
                : 'text-white/50 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon size={collapsed ? 24 : 20} className={`shrink-0 transition-premium group-hover:scale-110`} />
            {!collapsed && (
              <span className="font-bold text-sm tracking-wide transition-premium">
                {item.title}
              </span>
            )}

            {/* Activo Indicator pill */}
            <div className={`absolute left-0 w-1.5 h-6 bg-white rounded-r-full transition-all duration-500 scale-y-0 opacity-0 group-[.active]:scale-y-100 group-[.active]:opacity-100`}></div>
          </NavLink>
        ))}
      </nav>

      {/* Footer / Toggle Desktop */}
      <div className="p-0 mt-auto">
        {/* Espaciador final */}
      </div>

      {/* Info Badge (Desktop colapsado) */}
      {!collapsed && (
        <div className="p-6 m-4 rounded-3xl bg-brand-primary/10 border border-white/5 animate-fade-in">
          <p className="text-[10px] font-black text-brand-accent uppercase tracking-[0.2em] mb-1">Sistema v2.1</p>
          <p className="text-xs text-white/50 font-medium">Control de Caja Chica</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Botón Flotante Móvil */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-brand-primary text-white rounded-2xl shadow-2xl md:hidden transition-premium active:scale-90"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar Desktop */}
      <aside
        className={`hidden md:flex flex-col h-screen sticky top-0 transition-all duration-500 ease-in-out border-r border-white/5 z-40
          ${collapsed ? 'w-24' : 'w-72'}
        `}
      >
        <SidebarContent />
      </aside>

      {/* Overlay & Sidebar Móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-brand-dark/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-dark shadow-2xl animate-in slide-in-from-left duration-300">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
