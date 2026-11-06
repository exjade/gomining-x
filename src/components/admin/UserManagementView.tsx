import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Lock, 
  Unlock, 
  Eye, 
  X,
  RefreshCw
} from 'lucide-react';
import { UserManagementService, type AdminManagedUser } from '../../services/admin/userManagementService';
import { fetchFirestoreUsers } from '../../utils/firebaseAuth';

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
  const [firestoreCount, setFirestoreCount] = useState<number>(0);

  const syncFirestoreData = async () => {
    setIsSyncing(true);
    try {
      const fsUsers = await fetchFirestoreUsers();
      if (fsUsers.length > 0) {
        setFirestoreCount(fsUsers.length);
        const mappedFromFirestore: AdminManagedUser[] = fsUsers.map((fu) => ({
          id: fu.uid || `usr_${fu.id}`,
          email: fu.email || 'sin-correo@gomining.app',
          username: fu.username || fu.email?.split('@')[0] || 'usuario',
          fullName: fu.username ? `${fu.username} (GoMining)` : fu.email || 'GoMining User',
          registeredAt: fu.createdAt?.toDate ? fu.createdAt.toDate().toISOString() : new Date().toISOString(),
          status: 'ACTIVE',
          activeContractsCount: fu.purchasesCount || (fu.minersCount || 0),
          totalContractedTh: fu.totalPowerTh || 0,
          walletBalanceUsdt: fu.balance || 0,
          totalPrlAccumulated: fu.commissionBalance || fu.totalCommissionsEarned || 0,
          membershipPlan: fu.referral?.referralCode ? `Ref: ${fu.referral.referralCode}` : 'GoMining User',
          lastLoginAt: fu.lastPurchaseAt?.toDate ? fu.lastPurchaseAt.toDate().toISOString() : new Date().toISOString()
        }));

        // Merge with local users avoiding duplicates
        const currentLocal = userService.getUsers();
        const mergedMap = new Map<string, AdminManagedUser>();
        mappedFromFirestore.forEach(u => mergedMap.set(u.id, u));
        currentLocal.forEach(u => {
          if (!mergedMap.has(u.id)) mergedMap.set(u.id, u);
        });
        setUsers(Array.from(mergedMap.values()));
      }
    } catch (err) {
      console.warn('[UserManagementView] Firestore sync warning:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncFirestoreData();
  }, []);

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
          <div className="flex items-center gap-3">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Gestión Integral de Usuarios (Ficha 360°)
            </h2>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-[#05DF72] animate-pulse" />
              <span>salad-miners</span>
              {firestoreCount > 0 && <span className="text-[10px] opacity-75">({firestoreCount} en nube)</span>}
            </div>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Supervisión sincronizada con Cloud Firestore (/users), saldos, contratos mineros y control de acceso.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={syncFirestoreData}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono border transition-all cursor-pointer ${
              isDarkTheme
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Sincronizar directamente con Firestore salad-miners"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>

          <div className="relative min-w-[240px]">
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
                <th className="py-3 px-3">MEMBRESÍA / REF</th>
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
                    <div className="flex items-center gap-2">
                      <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{u.fullName}</div>
                      {u.id.length > 20 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          Cloud
                        </span>
                      )}
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
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>UID / ID:</span>
                <span className={`font-mono text-[11px] truncate max-w-[200px] ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-600'}`}>{selectedUser.id}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Nombre Completo:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.fullName}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Email Registrado:</span>
                <span className="text-cyan-500 font-bold">{selectedUser.email}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Membresía / Referido:</span>
                <span className="font-bold text-[#05DF72]">{selectedUser.membershipPlan}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Potencia Minera:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{selectedUser.totalContractedTh} TH/s</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Comisiones Acumuladas:</span>
                <span className="font-bold text-cyan-500">${selectedUser.totalPrlAccumulated.toFixed(2)} USD</span>
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
