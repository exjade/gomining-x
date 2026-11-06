import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Lock, 
  Unlock, 
  Eye, 
  X,
  RefreshCw,
  UploadCloud,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Plus,
  Users,
  Database,
  Save
} from 'lucide-react';
import { 
  UserManagementService, 
  type AdminManagedUser, 
  type UserStatus, 
  type UserSourceCollection 
} from '../../services/admin/userManagementService';
import { 
  FIRESTORE_COLLECTIONS 
} from '../../utils/firebaseAuth';

interface UserManagementViewProps {
  isDarkTheme?: boolean;
}

const MEMBERSHIP_PLAN_OPTIONS = [
  'VIP Master 365',
  'Standard Pro',
  'Entry Basic',
  'VIP Whales Elite',
  'Super Admin Master',
  'Operador de Granja',
  'Cliente GoMining Pro',
  'Cliente Inversionista'
];

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  isDarkTheme = true
}) => {
  const userService = UserManagementService.getInstance();
  const [users, setUsers] = useState<AdminManagedUser[]>(() => userService.getUsers());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [collectionFilter, setCollectionFilter] = useState<'all' | UserSourceCollection>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  
  // Modals state
  const [viewingUser, setViewingUser] = useState<AdminManagedUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminManagedUser | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);

  // Form state for editing or creating
  const [formData, setFormData] = useState<{
    id: string;
    sourceCollection: UserSourceCollection;
    fullName: string;
    username: string;
    email: string;
    membershipPlan: string;
    role: string;
    activeContractsCount: number;
    totalContractedTh: number;
    walletBalanceUsdt: number;
    totalPrlAccumulated: number;
    status: UserStatus;
  }>({
    id: '',
    sourceCollection: 'admin_users',
    fullName: '',
    username: '',
    email: '',
    membershipPlan: 'VIP Master 365',
    role: 'SUPER_ADMIN',
    activeContractsCount: 1,
    totalContractedTh: 100,
    walletBalanceUsdt: 0,
    totalPrlAccumulated: 0,
    status: 'ACTIVE'
  });

  // Action status state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Synchronize from both Firestore collections (/admin_users and /users)
  const syncAllUsers = async () => {
    setIsSyncing(true);
    setFeedbackMsg(null);
    try {
      const result = await userService.fetchFromFirestore();
      setUsers(result.all);
      const adminCount = result.adminUsers.length;
      const clientCount = result.clientUsers.length;
      setFeedbackMsg({
        type: 'success',
        text: `Sincronización completa: ${adminCount} administradores (/${FIRESTORE_COLLECTIONS.ADMIN_USERS}) y ${clientCount} usuarios (/${FIRESTORE_COLLECTIONS.USERS}) cargados.`
      });
    } catch (err) {
      console.warn('[UserManagementView] Error fetching users from Firestore collections:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'Aviso: Error de conexión con Firestore. Mostrando registros almacenados localmente.'
      });
      setUsers(userService.getUsers());
    } finally {
      setIsSyncing(false);
    }
  };

  // Seed demo accounts to both Firestore collections
  const handleSeedBothCollections = async () => {
    setIsSeeding(true);
    setFeedbackMsg(null);
    try {
      const { adminCount, clientCount } = await userService.seedAll();
      setFeedbackMsg({
        type: 'success',
        text: `¡Sembrado exitoso! ${adminCount} administradores guardados en /${FIRESTORE_COLLECTIONS.ADMIN_USERS} y ${clientCount} usuarios en /${FIRESTORE_COLLECTIONS.USERS}.`
      });
      await syncAllUsers();
    } catch (err) {
      console.error('Error seeding collections:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al sembrar en Firestore. Revisa tu conexión o reglas de seguridad.'
      });
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    syncAllUsers();
  }, []);

  // Quick toggle status: ACTIVE <-> SUSPENDED
  const handleToggleStatus = async (userId: string, currentStatus: UserStatus) => {
    const nextStatus: UserStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    userService.updateUserStatus(userId, nextStatus, 'Acción rápida en tabla');
    
    // Update local state
    const updated = users.map((u) => u.id === userId ? { ...u, status: nextStatus } : u);
    setUsers(updated);

    const targetUser = updated.find(u => u.id === userId);
    setFeedbackMsg({
      type: 'success',
      text: `Estado de ${targetUser?.email || userId} cambiado a ${nextStatus}. Guardado en Firestore /${targetUser?.sourceCollection || 'admin_users'}.`
    });
  };

  // Open Edit Modal
  const handleOpenEdit = (user: AdminManagedUser) => {
    setEditingUser(user);
    setFormData({
      id: user.id,
      sourceCollection: user.sourceCollection || (user.isPlatformAdmin ? 'admin_users' : 'users'),
      fullName: user.fullName || '',
      username: user.username || '',
      email: user.email || '',
      membershipPlan: user.membershipPlan || 'Standard Pro',
      role: user.role || (user.sourceCollection === 'admin_users' ? 'SUPER_ADMIN' : 'CLIENT'),
      activeContractsCount: user.activeContractsCount || 0,
      totalContractedTh: user.totalContractedTh || 0,
      walletBalanceUsdt: Number(user.walletBalanceUsdt || 0),
      totalPrlAccumulated: Number(user.totalPrlAccumulated || 0),
      status: user.status || 'ACTIVE'
    });
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    const newId = `usr_${Date.now()}`;
    setEditingUser(null);
    setIsCreatingUser(true);
    setFormData({
      id: newId,
      sourceCollection: 'admin_users',
      fullName: '',
      username: '',
      email: '',
      membershipPlan: 'VIP Master 365',
      role: 'SUPER_ADMIN',
      activeContractsCount: 1,
      totalContractedTh: 128,
      walletBalanceUsdt: 100,
      totalPrlAccumulated: 0,
      status: 'ACTIVE'
    });
  };

  // Save changes from Edit or Create Modal
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) {
      setFeedbackMsg({ type: 'error', text: 'El email del usuario es obligatorio.' });
      return;
    }

    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      const userToSave: AdminManagedUser = {
        id: formData.id || `usr_${Date.now()}`,
        email: formData.email.trim(),
        username: formData.username.trim() || formData.email.split('@')[0],
        fullName: formData.fullName.trim() || formData.username || formData.email.split('@')[0],
        registeredAt: editingUser?.registeredAt || new Date().toISOString(),
        status: formData.status,
        activeContractsCount: Number(formData.activeContractsCount) || 0,
        totalContractedTh: Number(formData.totalContractedTh) || 0,
        walletBalanceUsdt: Number(formData.walletBalanceUsdt) || 0,
        totalPrlAccumulated: Number(formData.totalPrlAccumulated) || 0,
        membershipPlan: formData.membershipPlan,
        role: formData.role,
        lastLoginAt: editingUser?.lastLoginAt || new Date().toISOString(),
        sourceCollection: formData.sourceCollection,
        isPlatformAdmin: formData.sourceCollection === 'admin_users'
      };

      const saved = await userService.saveUser(userToSave, formData.sourceCollection);

      // Refresh local state list
      const currentList = userService.getUsers();
      setUsers(currentList);

      setEditingUser(null);
      setIsCreatingUser(false);
      setFeedbackMsg({
        type: 'success',
        text: `Usuario ${saved.fullName} (${saved.email}) guardado exitosamente en Firestore /${formData.sourceCollection}.`
      });
    } catch (err) {
      console.error('Error saving user:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al guardar el usuario en Firestore. Verifica la configuración de red y reglas.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Counts summary
  const counts = useMemo(() => {
    const adminCount = users.filter(u => u.sourceCollection === 'admin_users' || u.isPlatformAdmin).length;
    const clientCount = users.filter(u => u.sourceCollection === 'users' && !u.isPlatformAdmin).length;
    return {
      adminCount,
      clientCount,
      total: users.length
    };
  }, [users]);

  // Filtered users according to search and collection filter
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return users.filter((u) => {
      // Collection filter
      if (collectionFilter === 'admin_users') {
        const isAdmin = u.sourceCollection === 'admin_users' || u.isPlatformAdmin;
        if (!isAdmin) return false;
      } else if (collectionFilter === 'users') {
        const isClient = u.sourceCollection === 'users' && !u.isPlatformAdmin;
        if (!isClient) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && u.status !== statusFilter) {
        return false;
      }

      // Search term
      if (!term) return true;
      return (
        u.email.toLowerCase().includes(term) ||
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        u.id.toLowerCase().includes(term) ||
        u.membershipPlan.toLowerCase().includes(term) ||
        (u.role && u.role.toLowerCase().includes(term))
      );
    });
  }, [users, searchTerm, collectionFilter, statusFilter]);

  return (
    <div className="minerx-admin-view space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Gestión de Usuarios y Administradores
            </h2>

            {/* Badges for both Firestore collections */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border bg-amber-500/10 border-amber-500/30 text-amber-400">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>/{FIRESTORE_COLLECTIONS.ADMIN_USERS} ({counts.adminCount})</span>
              </span>

              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>/{FIRESTORE_COLLECTIONS.USERS} ({counts.clientCount})</span>
              </span>
            </div>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Lectura, edición y búsqueda unificada en Cloud Firestore. Administra operadores de plataforma y cuentas de clientes GoMining.
          </p>
        </div>

        {/* TOP ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono font-bold border transition-all cursor-pointer shadow-sm active:scale-[0.98] ${
              isDarkTheme
                ? 'bg-[#05DF72] text-black border-[#05DF72] hover:bg-[#05DF72]/90'
                : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            }`}
            title="Crear un nuevo usuario en Firestore"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Nuevo Usuario</span>
          </button>

          <button
            onClick={handleSeedBothCollections}
            disabled={isSeeding}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono border transition-all cursor-pointer active:scale-[0.98] ${
              isDarkTheme
                ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-300'
                : 'bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-800'
            }`}
            title="Sembrar cuentas iniciales en /admin_users y /users de Firestore"
          >
            <UploadCloud className={`h-3.5 w-3.5 ${isSeeding ? 'animate-bounce text-amber-400' : ''}`} />
            <span>{isSeeding ? 'Sembrando...' : 'Sembrar en Firestore'}</span>
          </button>

          <button
            onClick={syncAllUsers}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono border transition-all cursor-pointer active:scale-[0.98] ${
              isDarkTheme
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Recargar usuarios desde Firestore /admin_users y /users"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : ''}`} />
            <span>{isSyncing ? 'Cargando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className={`p-4 rounded-3xl border flex flex-wrap items-center justify-between gap-3 ${
        isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        {/* Collection segment tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCollectionFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
              collectionFilter === 'all'
                ? isDarkTheme
                  ? 'bg-white/15 text-white font-bold border border-white/20'
                  : 'bg-slate-900 text-white font-bold shadow-sm'
                : isDarkTheme
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Todos ({counts.total})
          </button>

          <button
            onClick={() => setCollectionFilter('admin_users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
              collectionFilter === 'admin_users'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : isDarkTheme
                  ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/5'
                  : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
            }`}
          >
            <ShieldCheck className="h-3 w-3 text-amber-400" />
            <span>Administradores (/{FIRESTORE_COLLECTIONS.ADMIN_USERS}) ({counts.adminCount})</span>
          </button>

          <button
            onClick={() => setCollectionFilter('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
              collectionFilter === 'users'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                : isDarkTheme
                  ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/5'
                  : 'text-slate-600 hover:text-cyan-700 hover:bg-cyan-50'
            }`}
          >
            <Users className="h-3 w-3 text-cyan-400" />
            <span>Usuarios GoMining (/{FIRESTORE_COLLECTIONS.USERS}) ({counts.clientCount})</span>
          </button>
        </div>

        {/* Status dropdown & Search input */}
        <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`px-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] cursor-pointer ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="all">Todos los Estados</option>
            <option value="ACTIVE">Solo Activos (ACTIVE)</option>
            <option value="SUSPENDED">Solo Suspendidos (SUSPENDED)</option>
            <option value="INACTIVE">Solo Inactivos (INACTIVE)</option>
            <option value="BLOCKED">Solo Bloqueados (BLOCKED)</option>
          </select>

          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
              }`}
            />
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {feedbackMsg && (
        <div className={`flex items-center justify-between gap-2 p-3.5 rounded-2xl text-xs font-mono animate-in fade-in border ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Database className="h-8 w-8 mx-auto text-slate-500 opacity-50 mb-2" />
                    <p className={`text-sm font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                      No se encontraron usuarios en las colecciones con los filtros aplicados.
                    </p>
                    <button
                      onClick={handleSeedBothCollections}
                      className="mt-3 px-3 py-1.5 rounded-xl text-xs font-mono text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
                    >
                      Sembrar cuentas iniciales en Firestore
                    </button>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isAdminUser = u.sourceCollection === 'admin_users' || u.isPlatformAdmin;
                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* ADMINISTRADOR / EMAIL */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                            {u.fullName}
                          </div>
                          {isAdminUser ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              /admin_users
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                              /users
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                          {u.email}
                        </div>
                      </td>

                      {/* ROL / RANGO */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            {u.membershipPlan}
                          </span>
                          {u.role && (
                            <span className="text-[9px] font-mono text-slate-500">
                              {u.role}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CONTRATOS */}
                      <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                        {u.activeContractsCount} contratos
                      </td>

                      {/* POTENCIA TH/S */}
                      <td className="py-3 px-3 text-[#05DF72] font-bold">
                        {u.totalContractedTh} TH/s
                      </td>

                      {/* BALANCE ASIGNADO */}
                      <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        ${Number(u.walletBalanceUsdt || 0).toFixed(2)} USDT
                      </td>

                      {/* ESTADO */}
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : u.status === 'SUSPENDED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      {/* ACCIONES */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* EDIT USER BUTTON */}
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className={`p-1.5 rounded-xl border cursor-pointer transition-all active:scale-[0.97] ${
                              isDarkTheme
                                ? 'border-white/10 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                : 'border-amber-300 text-amber-700 hover:text-amber-900 hover:bg-amber-50'
                            }`}
                            title="Editar Parámetros del Usuario"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          {/* VIEW 360 CARD BUTTON */}
                          <button
                            onClick={() => setViewingUser(u)}
                            className={`p-1.5 rounded-xl border cursor-pointer transition-all active:scale-[0.97] ${
                              isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title="Ver Ficha 360 del Usuario"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* TOGGLE STATUS BUTTON */}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EDIT / CREATE USER MODAL */}
      {/* ========================================================================= */}
      {(editingUser || isCreatingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl my-8 ${
              isDarkTheme ? 'bg-[#0E1320] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-[#05DF72]" />
                <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {isCreatingUser ? 'Crear Nuevo Usuario' : 'Editar Usuario / Administrador'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setIsCreatingUser(false);
                }}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 font-mono text-xs">
              {/* TARGET COLLECTION SELECTOR */}
              <div>
                <label className={`block mb-1.5 font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Colección de Destino en Firestore:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-2xl border cursor-pointer transition-all ${
                      formData.sourceCollection === 'admin_users'
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-bold'
                        : isDarkTheme
                        ? 'border-white/10 bg-white/5 text-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sourceCollection"
                      value="admin_users"
                      checked={formData.sourceCollection === 'admin_users'}
                      onChange={() => setFormData({ ...formData, sourceCollection: 'admin_users' })}
                      className="sr-only"
                    />
                    <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-[11px] font-bold">/admin_users</div>
                      <div className="text-[9px] opacity-75">Operadores & Admins</div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-2xl border cursor-pointer transition-all ${
                      formData.sourceCollection === 'users'
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 font-bold'
                        : isDarkTheme
                        ? 'border-white/10 bg-white/5 text-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sourceCollection"
                      value="users"
                      checked={formData.sourceCollection === 'users'}
                      onChange={() => setFormData({ ...formData, sourceCollection: 'users' })}
                      className="sr-only"
                    />
                    <Users className="h-4 w-4 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-[11px] font-bold">/users</div>
                      <div className="text-[9px] opacity-75">Clientes GoMining</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* NOMBRE COMPLETO & USERNAME */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Nombre Completo:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Ej. Roman Master Admin"
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Usuario / Alias:
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Ej. roman_admin"
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* EMAIL */}
              <div>
                <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  Email Oficial:
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@minerx.cloud"
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* ROL / RANGO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Rango / Plan:
                  </label>
                  <select
                    value={formData.membershipPlan}
                    onChange={(e) => setFormData({ ...formData, membershipPlan: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] cursor-pointer ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    {MEMBERSHIP_PLAN_OPTIONS.map((plan) => (
                      <option key={plan} value={plan}>{plan}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Rol de Plataforma:
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] cursor-pointer ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Acceso Total)</option>
                    <option value="OPERATOR">OPERATOR (Control Granja)</option>
                    <option value="CLIENT_VIP">CLIENT_VIP (Inversionista Whale)</option>
                    <option value="CLIENT_PRO">CLIENT_PRO (Miner Pro)</option>
                    <option value="CLIENT_BASIC">CLIENT_BASIC (Miner Básico)</option>
                  </select>
                </div>
              </div>

              {/* CONTRATOS, POTENCIA TH/S Y BALANCE */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Contratos:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.activeContractsCount}
                    onChange={(e) => setFormData({ ...formData, activeContractsCount: parseInt(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-[11px] text-[#05DF72]`}>
                    Potencia TH/s:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.totalContractedTh}
                    onChange={(e) => setFormData({ ...formData, totalContractedTh: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 rounded-xl border font-bold text-[#05DF72] focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Balance USDT:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.walletBalanceUsdt}
                    onChange={(e) => setFormData({ ...formData, walletBalanceUsdt: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 rounded-xl border font-bold focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#080B12] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* ESTADO */}
              <div>
                <label className={`block mb-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  Estado de la Cuenta:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'BLOCKED'] as UserStatus[]).map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setFormData({ ...formData, status: st })}
                      className={`py-2 px-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                        formData.status === st
                          ? st === 'ACTIVE'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : st === 'SUSPENDED'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                            : 'bg-amber-500/20 border-amber-500 text-amber-400'
                          : isDarkTheme
                          ? 'border-white/10 bg-white/5 text-slate-400'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className={`mt-6 pt-4 border-t flex items-center justify-end gap-2 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsCreatingUser(false);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                    isDarkTheme ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    isDarkTheme
                      ? 'bg-[#05DF72] text-black hover:bg-[#05DF72]/90'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Guardar en Firestore</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER 360 DETAIL MODAL */}
      {/* ========================================================================= */}
      {viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
              isDarkTheme ? 'bg-[#0E1320] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  Ficha 360 de Usuario
                </h3>
              </div>
              <button
                onClick={() => setViewingUser(null)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>ID Usuario:</span>
                <span className={`font-mono text-[11px] truncate max-w-[200px] ${isDarkTheme ? 'text-amber-400' : 'text-amber-600'}`}>
                  {viewingUser.id}
                </span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Colección Firestore:</span>
                <span className="font-bold text-cyan-400">
                  /{viewingUser.sourceCollection || (viewingUser.isPlatformAdmin ? 'admin_users' : 'users')}
                </span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Nombre Completo:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{viewingUser.fullName}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Email Oficial:</span>
                <span className="text-cyan-500 font-bold">{viewingUser.email}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Rango / Membresía:</span>
                <span className="font-bold text-[#05DF72]">{viewingUser.membershipPlan}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Contratos Activos:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{viewingUser.activeContractsCount}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Potencia Minera:</span>
                <span className="font-bold text-[#05DF72]">{viewingUser.totalContractedTh} TH/s</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Saldo Asignado:</span>
                <span className="font-bold text-[#05DF72]">${Number(viewingUser.walletBalanceUsdt || 0).toFixed(2)} USDT</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>PRL Acumulado:</span>
                <span className="font-bold text-amber-400">{Number(viewingUser.totalPrlAccumulated || 0).toFixed(2)} PRL</span>
              </div>
              <div className="flex justify-between py-1">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Última Conexión:</span>
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>
                  {new Date(viewingUser.lastLoginAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={`mt-6 pt-3 border-t flex justify-between items-center ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
              <button
                onClick={() => {
                  const toEdit = viewingUser;
                  setViewingUser(null);
                  handleOpenEdit(toEdit);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Editar Parámetros</span>
              </button>

              <button
                onClick={() => setViewingUser(null)}
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
