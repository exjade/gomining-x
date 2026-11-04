import React, { useState } from 'react';
import { 
  Search, 
  Lock, 
  Unlock, 
  Eye, 
  X
} from 'lucide-react';
import { UserManagementService, type AdminManagedUser } from '../../services/admin/userManagementService';

interface UserManagementViewProps {
  isDarkTheme?: boolean;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  isDarkTheme = true
}) => {
  const userService = UserManagementService.getInstance();
  const [users, setUsers] = useState<AdminManagedUser[]>(userService.getUsers());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<AdminManagedUser | null>(null);

  const handleToggleStatus = (userId: string, currentStatus: AdminManagedUser['status']) => {
    const nextStatus: AdminManagedUser['status'] = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    userService.updateUserStatus(userId, nextStatus, 'Acción administrativa de moderación');
    setUsers(userService.getUsers());
  };

  const filteredUsers = users.filter((u) => {
    return u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
           u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           u.id.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Gestión Integral de Usuarios (Ficha 360°)
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Supervisión de cuentas registradas, saldos de billeteras, contratos asignados y control de acceso.
          </p>
        </div>

        <div className="relative min-w-[260px]">
          <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
            }`}
          />
        </div>
      </div>

      {/* USERS TABLE */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          isDarkTheme
            ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-[11px] ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
              }`}>
                <th className="py-3 px-3">USUARIO / EMAIL</th>
                <th className="py-3 px-3">MEMBRESÍA</th>
                <th className="py-3 px-3">CONTRATOS</th>
                <th className="py-3 px-3">POTENCIA TH/S</th>
                <th className="py-3 px-3">BALANCE DISPONIBLE</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredUsers.map((u) => (
                <tr key={u.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                  <td className="py-3 px-3">
                    <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{u.fullName}</div>
                    <div className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{u.email}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}>
                      {u.membershipPlan}
                    </span>
                  </td>
                  <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>{u.activeContractsCount} contratos</td>
                  <td className="py-3 px-3 text-[#05DF72] font-bold">{u.totalContractedTh} TH/s</td>
                  <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>${u.walletBalanceUsdt.toFixed(2)} USDT</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className={`p-1.5 rounded-xl border cursor-pointer transition-all active:scale-[0.97] ${
                          isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Ver Ficha 360"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleToggleStatus(u.id, u.status)}
                        className={`p-1.5 rounded-xl border text-xs font-mono transition-all active:scale-[0.97] cursor-pointer ${
                          u.status === 'ACTIVE'
                            ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                            : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                        title={u.status === 'ACTIVE' ? 'Suspender Usuario' : 'Reactivar Usuario'}
                      >
                        {u.status === 'ACTIVE' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* USER 360 MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
              isDarkTheme ? 'bg-[#0E1320] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Ficha de Usuario 360°</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Nombre Completo:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.fullName}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Email Registrado:</span>
                <span className="text-cyan-500 font-bold">{selectedUser.email}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Membresía Vigente:</span>
                <span className="font-bold text-[#05DF72]">{selectedUser.membershipPlan}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Potencia Minera:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.totalContractedTh} TH/s</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Producción Acumulada:</span>
                <span className="font-bold text-cyan-500">{selectedUser.totalPrlAccumulated.toFixed(2)} PRL</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Saldo en Billetera:</span>
                <span className="font-bold text-[#05DF72]">${selectedUser.walletBalanceUsdt.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between py-1">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Último Acceso:</span>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>{new Date(selectedUser.lastLoginAt).toLocaleString()}</span>
              </div>
            </div>

            <div className={`mt-6 pt-3 border-t flex justify-end ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
              <button
                onClick={() => setSelectedUser(null)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                  isDarkTheme ? 'bg-white/[0.05] hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                }`}
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
