import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewRequest from './pages/NewRequest';
import MisSolicitudes from './pages/MisSolicitudes';
import CierreCaja from './pages/CierreCaja';
import Aprobaciones from './pages/Aprobaciones';
import BalanceSemanal from './pages/BalanceSemanal';
import { useUserStore } from './store/userStore';
import {
  puedeAccederAprobaciones,
  puedeAccederCierreCaja,
  puedeAccederBalanceSemanal
} from './utils/permisos';

/**
 * Componente de protección de rutas para verificar autenticación y permisos por rol.
 */
const ProtectedRoute = ({ children, permiso }) => {
  const { isAuthenticated, user } = useUserStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (permiso && !permiso(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
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
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          {/* Dashboard como vista principal */}
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          
          <Route path="nueva-solicitud" element={<NewRequest />} />
          <Route path="mis-solicitudes" element={<MisSolicitudes />} />

          {/* Rutas con Control de Acceso Estricto */}
          <Route
            path="aprobaciones"
            element={
              <ProtectedRoute permiso={puedeAccederAprobaciones}>
                <Aprobaciones />
              </ProtectedRoute>
            }
          />
          <Route
            path="cierre-caja"
            element={
              <ProtectedRoute permiso={puedeAccederCierreCaja}>
                <CierreCaja />
              </ProtectedRoute>
            }
          />
          <Route
            path="balance"
            element={
              <ProtectedRoute permiso={puedeAccederBalanceSemanal}>
                <BalanceSemanal />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Redirección por defecto a dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
