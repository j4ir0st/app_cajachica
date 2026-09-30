import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { useUserStore } from '../store/userStore';

/**
 * Página de Login Ultra-Premium con diseño de alta fidelidad.
 * Utiliza Glassmorphism avanzado, gradientes orgánicos y micro-interacciones.
 */
const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [formData, setFormData] = useState({ usuario: '', password: '' });
  const { login } = useUserStore();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      // 1. Obtener Token JWT y Datos de Usuario en una sola consulta
      const tokenRes = await axios.post(`${apiUrl}api/token/`, {
        username: formData.usuario,
        password: formData.password
      });

      const { access, refresh, user: rawUser } = tokenRes.data;

      if (!rawUser) {
        throw new Error('No se pudo obtener la información del perfil del usuario.');
      }

      // 2. Estructuramos los datos para el store
      // Mapeamos los datos para que coincidan con lo que espera el resto de la app
      const userData = {
        id: rawUser.id,
        username: rawUser.username,
        nombre: rawUser.full_name || `${rawUser.first_name} ${rawUser.last_name}`,
        email: rawUser.email,
        puesto: rawUser.puesto || 'Sin Puesto',
        area: rawUser.area || 'Sin Área',
        area_id: rawUser.area_id || 'Sin Área',
        empresa: rawUser.empr_id || 'Sin Empresa',
        avatar: rawUser.avatar || null,
        is_staff: rawUser.is_staff
      };

      login(userData, access, refresh);
      navigate('/dashboard');

    } catch (error) {
      console.error('Error de login:', error);
      if (error.response?.status === 401) {
        setLoginError('Usuario o contraseña incorrectos.');
      } else {
        setLoginError('Error de conexión con el servidor. Intente más tarde.');
      }
    } finally {
      setIsLoading(false);
    }

  };

  const currentYear = new Date().getFullYear();

  // En desarrollo (DEV), usamos '/' para que el proxy de Vite capture la petición y evite CORS.
  // En producción, usamos la URL definida en el .env (aunque si es el mismo servidor, '/' también funcionaría).
  const apiUrl = import.meta.env.DEV ? '/' : import.meta.env.VITE_API_URL;
  const logoUrl = `${apiUrl}${import.meta.env.VITE_SURGI_LOGO}`;

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-brand-dark font-outfit">
      {/* Fondo con Gradientes Orgánicos Dinámicos */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-primary/10 rounded-full blur-[120px] animate-pulse-slow" />

      {/* Imagen de fondo con overlay elegante */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center grayscale-[30%] opacity-40 scale-105"
        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=2011")' }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-tr from-brand-dark via-brand-dark/90 to-brand-primary/30" />

      {/* Tarjeta de Login (Master Glassmorphism) */}
      <div className="relative z-20 w-full max-w-lg px-4 flex flex-col items-center">

        <div className="w-full bg-white/75 backdrop-blur-2xl p-8 md:p-12 rounded-[2.5rem] animate-slide-up relative overflow-hidden group border border-white/40 shadow-2xl">
          {/* Adorno brillante en la tarjeta */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/10 blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative">
            {/* Cabecera de la tarjeta con Logo y Marca integrados */}
            <div className="mb-8 flex flex-col items-center animate-fade-in text-center">
              <div className="w-96 h-24 flex items-center justify-center mb-2">
                <img
                  src={logoUrl}
                  alt="Surgicorp Logo"
                  className="w-full h-full object-contain filter drop-shadow-md brightness-0 saturate-100 invert-[48%] sepia-[21%] saturate-[1879%] hue-rotate-[151deg] brightness-[88%] contrast-[90%]"
                  onError={(e) => {
                    // Fallback visual por si hay problemas de red con la API externa
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = '<span class="text-brand-primary font-black text-3xl italic tracking-tighter">SURGICORP</span>';
                  }}
                />
              </div>
              <div className="border-l-4 border-brand-primary pl-4">
                <h2 className="text-3xl font-bold text-gray-800 tracking-tight leading-none">
                  Caja Chica <span className="text-brand-primary font-light italic ml-1">Plus</span>
                </h2>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-7">
              {/* Alerta de Error */}
              {loginError && (
                <div className="bg-red-50 text-red-600 border border-red-100 px-4 py-3 rounded-2xl text-xs font-bold animate-shake text-center">
                  {loginError}
                </div>
              )}

              {/* Campo Usuario */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <User size={14} className="text-brand-primary" />
                  Usuario
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: jdcastillo"
                  className="w-full bg-white/50 border border-gray-100/50 rounded-2xl px-5 py-4 text-gray-800 focus:bg-white focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-premium outline-none shadow-sm"
                  value={formData.usuario}
                  onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
                />
              </div>

              {/* Campo Contraseña */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Lock size={14} className="text-brand-primary" />
                  Contraseña
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white/50 border border-gray-100/50 rounded-2xl px-5 py-4 text-gray-800 focus:bg-white focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-premium outline-none shadow-sm"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-5 flex items-center text-gray-400 hover:text-brand-primary transition-premium"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-brand-primary/40 text-white btn-premium mt-4 flex items-center justify-center gap-3 py-4"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>AUTENTICANDO...</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold tracking-widest uppercase text-sm">Ingresar al Sistema</span>
                    <ShieldCheck size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 mb-0 pt-4 pb-0 border-t border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 font-black tracking-[0.2em] uppercase">
                © {currentYear} SurgiCorp Surgery For Life
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
