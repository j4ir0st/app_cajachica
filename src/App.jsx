import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewRequest from './pages/NewRequest';
import MisSolicitudes from './pages/MisSolicitudes';
import { useUserStore } from './store/userStore';

/**
 * Componente de protección de rutas para verificar autenticación.
 */
const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useUserStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

/**
 * Componente principal de la aplicación con configuración de rutas.
 * Define la estructura de navegación y las vistas disponibles.
 */
function App() {
  return (
    <BrowserRouter basename="/app_cajachica">
      <Routes>
        {/* Ruta de Login (Pública) */}
        <Route path="/login" element={<Login />} />

        {/* Rutas Protegidas (Requieren Login) */}
        <Route path="/" element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }>
          {/* Dashboard como vista principal */}
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          
          <Route path="nueva-solicitud" element={<NewRequest />} />
          <Route path="mis-solicitudes" element={<MisSolicitudes />} />
          <Route path="aprobaciones" element={<div className="p-8"><h2 className="text-2xl font-bold">Aprobaciones (En desarrollo)</h2></div>} />
          <Route path="cierre-caja" element={<div className="p-8"><h2 className="text-2xl font-bold">Cierre de Caja (En desarrollo)</h2></div>} />
          <Route path="balance" element={<div className="p-8"><h2 className="text-2xl font-bold">Balance Semanal (En desarrollo)</h2></div>} />
        </Route>

        {/* Redirección por defecto a dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
