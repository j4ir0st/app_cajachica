import React from 'react';
import {
  Wallet,
  ArrowUpRight,
  Clock,
  AlertCircle,
  TrendingUp,
  ChevronRight,
  PlusCircle,
  FileText
} from 'lucide-react';
import { useUserStore } from '../store/userStore';

/**
 * Dashboard Premium con diseño de alta fidelidad, tarjetas informativas
 * y acceso rápido a funciones principales.
 */
const Dashboard = () => {
  const { user } = useUserStore();

  const stats = [
    {
      label: 'Fondo Asignado',
      value: 'S/ 2,500.00',
      icon: Wallet,
      color: 'bg-blue-500',
      trend: '+20%',
      gradient: 'from-blue-600 to-indigo-600'
    },
    {
      label: 'Consumido Mes',
      value: 'S/ 842.50',
      icon: TrendingUp,
      color: 'bg-emerald-500',
      trend: '-5%',
      gradient: 'from-emerald-600 to-teal-600'
    },
    {
      label: 'Pendientes Pago',
      value: '04',
      icon: Clock,
      color: 'bg-amber-500',
      trend: 'Urgente',
      gradient: 'from-amber-600 to-orange-600'
    },
  ];

  const recentRequests = [
    { id: 'SC-2025-001', date: '08 Abr 2025', desc: 'Suministros Oficina - TI', amount: 'S/ 120.00', status: 'Aprobado' },
    { id: 'SC-2025-002', date: '07 Abr 2025', desc: 'Movilidad Local - Logística', amount: 'S/ 45.00', status: 'Pendiente' },
    { id: 'SC-2025-003', date: '05 Abr 2025', desc: 'Gastos Representación', amount: 'S/ 320.00', status: 'Rechazado' },
  ];

  return (
    <div className="p-0 md:p-0 space-y-4 animate-fade-in font-outfit">

      {/* Grid de Estadísticas con Tarjetas de Alta Fidelidad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="group relative bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-brand-primary/5 transition-premium overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.gradient} opacity-[0.03] rounded-bl-[100px] transition-premium group-hover:scale-110`} />

            <div className="flex items-center justify-between mb-6">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${stat.gradient} text-white shadow-lg shadow-brand-primary/20 transition-premium group-hover:rotate-3`}>
                <stat.icon size={26} />
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${idx === 2 ? 'bg-red-50 text-red-500' : 'bg-brand-light text-brand-primary'}`}>
                {stat.trend}
              </span>
            </div>

            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
            <h3 className="text-3xl font-black text-brand-dark tracking-tighter">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Grid de Secciones Secundarias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Tabla de Actividad Reciente */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-xl font-black text-brand-dark flex items-center gap-3">
              <ArrowUpRight size={24} className="text-brand-primary" />
              Actividad Reciente
            </h4>
            <button className="text-brand-primary font-black text-xs uppercase tracking-widest hover:underline hover:underline-offset-4 transition-premium">
              Ver Historial
            </button>
          </div>

          <div className="space-y-4">
            {recentRequests.map((req, idx) => (
              <div key={idx} className="flex items-center justify-between p-5 rounded-3xl hover:bg-brand-light transition-premium border border-transparent hover:border-brand-primary/10 group cursor-default">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-brand-light flex items-center justify-center text-brand-primary font-black text-xs shadow-inner group-hover:rotate-6 transition-premium">
                    {req.id.split('-')[2]}
                  </div>
                  <div>
                    <p className="font-black text-brand-dark tracking-tighter">{req.desc}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{req.date} • {req.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-brand-dark tracking-tighter">{req.amount}</p>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${req.status === 'Aprobado' ? 'text-emerald-500 border-emerald-100 bg-emerald-50' :
                    req.status === 'Rechazado' ? 'text-red-500 border-red-100 bg-red-50' :
                      'text-amber-500 border-amber-100 bg-amber-50'
                    }`}>
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sección de Normativa de Surgicorp */}
        <div className="bg-gradient-to-br from-brand-primary to-brand-secondary p-10 rounded-[2.5rem] shadow-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/5 blur-3xl -mb-32 -mr-32 rounded-full" />

          <div className="relative text-white space-y-6">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
              <AlertCircle size={30} />
            </div>
            <h4 className="text-2xl font-black tracking-tight leading-tight">Normativa Vigente de<br />Caja Chica</h4>
            <p className="text-white/70 text-sm font-medium leading-relaxed">
              Recuerda que el monto máximo por comprobante es de **S/ 1,500.00**.
              Todas las facturas deben ser electrónicas y estar a nombre de SURGICORP S.A.C.
            </p>
          </div>

          <button className="relative w-full mt-8 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-premium group/btn">
            <span>POLÍTICA DE GASTOS</span>
            <ChevronRight size={20} className="group-hover/btn:translate-x-1 transition-premium" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
