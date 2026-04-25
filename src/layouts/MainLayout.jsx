import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useUserStore } from '../store/userStore';

/**
 * Layout principal que envuelve toda la aplicación después del Login
 * Incluye el Header superior y el Sidebar lateral responsivo.
 */
const MainLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user } = useUserStore();
  const navigate = useNavigate();

  // Función para colapsar/expandir el sidebar
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex h-screen bg-[--color-brand-light] overflow-hidden font-sans m-0 p-0">
      {/* Sidebar lateral responsivo */}
      <Sidebar isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      {/* Área de contenido principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header superior */}
        <Header
          user={user}
          toggleSidebar={toggleSidebar}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Contenido dinámico (vistas) */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none p-0 md:p-0 lg:p-0">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
