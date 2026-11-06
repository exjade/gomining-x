import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Lock, 
  Unlock, 
  Eye, 
  X,
  RefreshCw,
  UploadCloud,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserManagementService, type AdminManagedUser } from '../../services/admin/userManagementService';
import { 
  fetchFirestoreAdminUsers, 
  saveFirestoreAdminUser, 
  seedInitialAdminUsers,
  ADMIN_COLLECTIONS 
} from '../../utils/firebaseAuth';

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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [firestoreCount, setFirestoreCount] = useState<number>(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load from isolated /admin_users
  const syncAdminUsers = async () => {
    setIsSyncing(true);
    setSuccessMsg(null);
    try {
      const fsAdminUsers = await fetchFirestoreAdminUsers();
      if (fsAdminUsers.length > 0) {
        setFirestoreCount(fsAdminUsers.length);
        const mapped: AdminManagedUser[] = fsAdminUsers.map((fu) => ({
          id: fu.id || fu.uid,
          email: fu.email || 'admin@minerx.cloud',
          username: fu.username || fu.email?.split('@')[0] || 'admin',
          fullName: fu.fullName || fu.username || 'Administrador',
          registeredAt: fu.registeredAt || fu.createdAt || new Date().toISOString(),
          status: fu.status || 'ACTIVE',
          activeContractsCount: fu.activeContractsCount || 0,
          totalContractedTh: fu.totalContractedTh || 0,
          walletBalanceUsdt: fu.walletBalanceUsdt || 0,
          totalPrlAccumulated: fu.totalPrlAccumulated || 0,
          membershipPlan: fu.membershipPlan || 'VIP Master 365',
          lastLoginAt: fu.lastLoginAt || new Date().toISOString()
        }));

        setUsers(mapped);
        setSuccessMsg(`Sincronizados ${mapped.length} administradores desde /${ADMIN_COLLECTIONS.USERS}`);
      } else {
        setUsers(userService.getUsers());
      }
    } catch (err) {
      console.warn('[UserManagementView] Error fetching isolated admin users:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Seed default admin accounts to isolated /admin_users in Firestore
  const handleSeedAdmins = async () => {
    setIsSeeding(true);
    setSuccessMsg(null);
    try {
      const defaultAdmins = userService.getUsers();
      const count = await seedInitialAdminUsers(defaultAdmins);
      setSuccessMsg(`¡${count} administradores guardados en la colección aislada /${ADMIN_COLLECTIONS.USERS}!`);
      await syncAdminUsers();
    } catch (err) {
      console.error('Error seeding admin users:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    syncAdminUsers();
  }, []);

  const handleToggleStatus = async (userId: string, currentStatus: AdminManagedUser['status']) => {
    const nextStatus: AdminManagedUser['status'] = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    userService.updateUserStatus(userId, nextStatus, 'Acción administrativa en /admin_users');
    
    // Update local state
    const updated = users.map((u) => u.id === userId ? { ...u, status: nextStatus } : u);
    setUsers(updated);

    // Save directly to isolated Firestore /admin_users
    const userToSave = updated.find(u => u.id === userId);
    if (userToSave) {
      await saveFirestoreAdminUser(userToSave);
    }
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
          <div className="flex items-center gap-3">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Gestión de Administradores y Operadores
            </h2>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border bg-amber-500/10 border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Colección Aislada: /{ADMIN_COLLECTIONS.USERS}</span>
              {firestoreCount > 0 && <span className="text-[10px] opacity-80">({firestoreCount} en nube)</span>}
            </div>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Entorno 100% independiente en Firestore. No modifica ni se mezcla con las cuentas de clientes (/users de GoMining).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSeedAdmins}
            disabled={isSeeding}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono border transition-all cursor-pointer ${
              isDarkTheme
                ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-300'
                : 'bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-800'
            }`}
            title="Guardar equipo administrativo inicial en /admin_users de Firestore"
          >
            <UploadCloud className={`h-3.5 w-3.5 ${isSeeding ? 'animate-bounce text-amber-400' : ''}`} />
            <span>{isSeeding ? 'Subiendo...' : 'Sembrar en /admin_users'}</span>
          </button>

          <button
            onClick={syncAdminUsers}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono border transition-all cursor-pointer ${
              isDarkTheme
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Recargar administradores desde Firestore /admin_users"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : ''}`} />
            <span>{isSyncing ? 'Cargando...' : 'Sincronizar'}</span>
          </button>

          <div className="relative min-w-[220px]">
            <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Buscar operador o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
              }`}
            />
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded-2xl text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ADMINS TABLE */}
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
                <th className="py-3 px-3">ADMINISTRADOR / EMAIL</th>
                <th className="py-3 px-3">ROL / RANGO</th>
                <th className="py-3 px-3">CONTRATOS</th>
                <th className="py-3 px-3">POTENCIA TH/S</th>
                <th className="py-3 px-3">BALANCE ASIGNADO</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredUsers.map((u) => (
                <tr key={u.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{u.fullName}</div>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Admin
                      </span>
                    </div>
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
                        title="Ver Ficha de Administrador"
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
                        title={u.status === 'ACTIVE' ? 'Suspender Operador' : 'Reactivar Operador'}
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

      {/* ADMIN 360 MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
              isDarkTheme ? 'bg-[#0E1320] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Ficha de Administrador</h3>
              </div>
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
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>ID Operador:</span>
                <span className={`font-mono text-[11px] truncate max-w-[200px] ${isDarkTheme ? 'text-amber-400' : 'text-amber-600'}`}>{selectedUser.id}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Nombre Completo:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.fullName}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Email Oficial:</span>
                <span className="text-cyan-500 font-bold">{selectedUser.email}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Rango Asignado:</span>
                <span className="font-bold text-[#05DF72]">{selectedUser.membershipPlan}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Potencia Supervisada:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.totalContractedTh} TH/s</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Saldo Asignado:</span>
                <span className="font-bold text-[#05DF72]">${selectedUser.walletBalanceUsdt.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between py-1">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Última Conexión:</span>
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
