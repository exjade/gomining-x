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
  Save,
  Trash2
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
  const [userToDelete, setUserToDelete] = useState<AdminManagedUser | null>(null);

  // Form state for editing or creating
  const [formData, setFormData] = useState<{
    id: string;
    sourceCollection: UserSourceCollection;
    fullName: string;
    username: string;
    email: string;
    membershipPlan: string;
    customPlanText: string;
    role: string;
    activeContractsCount: number;
    totalContractedTh: number;
    walletBalanceUsdt: number;
    totalPrlAccumulated: number;
    status: UserStatus;
    isPlatformAdmin: boolean;
  }>({
    id: '',
    sourceCollection: 'admin_users',
    fullName: '',
    username: '',
    email: '',
    membershipPlan: 'VIP Master 365',
    customPlanText: '',
    role: 'SUPER_ADMIN',
    activeContractsCount: 1,
    totalContractedTh: 100,
    walletBalanceUsdt: 0,
    totalPrlAccumulated: 0,
    status: 'ACTIVE',
    isPlatformAdmin: true
  });

  // Action status state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
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

  // Real-time listener for Firestore updates
  useEffect(() => {
    syncAllUsers();
    const unsubscribe = userService.subscribeToUsers((result) => {
      if (result.all.length > 0) {
        setUsers(result.all);
      }
    });
    return () => {
      unsubscribe();
    };
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
      text: `Estado de ${targetUser?.email || userId} cambiado a ${nextStatus}. Sincronizado en Firestore /${targetUser?.sourceCollection || 'admin_users'}.`
    });
  };

  // Open Edit Modal
  const handleOpenEdit = (user: AdminManagedUser) => {
    setEditingUser(user);
    setIsCreatingUser(false);
    setFormData({
      id: user.id,
      sourceCollection: user.sourceCollection || (user.isPlatformAdmin ? 'admin_users' : 'users'),
      fullName: user.fullName || '',
      username: user.username || '',
      email: user.email || '',
      membershipPlan: user.membershipPlan || 'Standard Pro',
      customPlanText: '',
      role: user.role || (user.sourceCollection === 'admin_users' ? 'SUPER_ADMIN' : 'CLIENT_PRO'),
      activeContractsCount: user.activeContractsCount || 0,
      totalContractedTh: user.totalContractedTh || 0,
      walletBalanceUsdt: Number(user.walletBalanceUsdt || 0),
      totalPrlAccumulated: Number(user.totalPrlAccumulated || 0),
      status: user.status || 'ACTIVE',
      isPlatformAdmin: user.sourceCollection === 'admin_users' || Boolean(user.isPlatformAdmin)
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
      customPlanText: '',
      role: 'SUPER_ADMIN',
      activeContractsCount: 1,
      totalContractedTh: 128,
      walletBalanceUsdt: 100,
      totalPrlAccumulated: 0,
      status: 'ACTIVE',
      isPlatformAdmin: true
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

    const chosenPlan = formData.customPlanText.trim() || formData.membershipPlan;

    try {
      const userToSave: AdminManagedUser = {
        id: formData.id || `usr_${Date.now()}`,
        email: formData.email.trim(),
        username: formData.username.trim() || formData.email.split('@')[0],
        fullName: formData.fullName.trim() || formData.username || formData.email.split('@')[0],
        registeredAt: editingUser?.registeredAt || new Date().toISOString(),
        status: formData.status,
        activeContractsCount: Math.max(0, parseInt(String(formData.activeContractsCount)) || 0),
        totalContractedTh: Math.max(0, parseFloat(String(formData.totalContractedTh)) || 0),
        walletBalanceUsdt: Math.max(0, parseFloat(String(formData.walletBalanceUsdt)) || 0),
        totalPrlAccumulated: Math.max(0, parseFloat(String(formData.totalPrlAccumulated)) || 0),
        membershipPlan: chosenPlan,
        role: formData.role,
        lastLoginAt: editingUser?.lastLoginAt || new Date().toISOString(),
        sourceCollection: formData.sourceCollection,
        isPlatformAdmin: formData.sourceCollection === 'admin_users' || formData.isPlatformAdmin
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

  // Confirm delete user handler
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await userService.deleteUser(userToDelete.id);
      setUsers(users.filter(u => u.id !== userToDelete.id));
      setFeedbackMsg({
        type: 'success',
        text: `Usuario ${userToDelete.fullName} (${userToDelete.email}) eliminado de Firestore /${userToDelete.sourceCollection || 'admin_users'}.`
      });
      setUserToDelete(null);
    } catch (err) {
      console.error('Error deleting user:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al eliminar el usuario en Firestore.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Dynamic membership plan options including current value
  const planOptions = useMemo(() => {
    const list = [...MEMBERSHIP_PLAN_OPTIONS];
    if (formData.membershipPlan && !list.includes(formData.membershipPlan)) {
      list.push(formData.membershipPlan);
    }
    return list;
  }, [formData.membershipPlan]);

  // Dynamic role options including current value
  const roleOptions = useMemo(() => {
    const baseRoles = ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT', 'CLIENT_VIP', 'CLIENT_PRO', 'CLIENT_BASIC'];
    if (formData.role && !baseRoles.includes(formData.role)) {
      baseRoles.push(formData.role);
    }
    return baseRoles;
  }, [formData.role]);

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

  // Filtered users according to search, collection filter, and status filter
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
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
              Gestión de Usuarios y Administradores
            </h2>

            {/* Badges for both Firestore collections */}
            <div className="flex items-center gap-2">
              <span className="admin-badge flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono border admin-bg-warning admin-border-warning admin-text-warning">
                <ShieldCheck className="w-3.5 h-3.5 admin-text-warning" />
                <span>/{FIRESTORE_COLLECTIONS.ADMIN_USERS} ({counts.adminCount})</span>
              </span>

              <span className="admin-badge flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono border admin-bg-info admin-border-info admin-text-accent">
                <Users className="w-3.5 h-3.5 admin-text-accent" />
                <span>/{FIRESTORE_COLLECTIONS.USERS} ({counts.clientCount})</span>
              </span>
            </div>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Lectura, edición y búsqueda en tiempo real en Cloud Firestore. Administra operadores de plataforma (/admin_users) y clientes GoMining (/users).
          </p>
        </div>

        {/* TOP ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className={`flex items-center gap-1.5 px-3 py-2 admin-radius-control text-xs font-mono font-semibold border cursor-pointer active:scale-[0.98] ${
              isDarkTheme
                ? ' admin-bg-primary admin-text-primary admin-border'
                : ' admin-bg-primary admin-text-primary admin-border-success'
            }`}
            title="Crear un nuevo usuario en Firestore"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Nuevo Usuario</span>
          </button>

          <button
            onClick={handleSeedBothCollections}
            disabled={isSeeding}
            className={`flex items-center gap-1.5 px-3 py-2 admin-radius-control text-xs font-mono border cursor-pointer active:scale-[0.98] ${
              isDarkTheme
                ? ' admin-bg-warning admin-border-warning admin-text-warning'
                : ' admin-bg-warning admin-border-warning admin-text-warning'
            }`}
            title="Sembrar cuentas iniciales en /admin_users y /users de Firestore"
          >
            <UploadCloud className={`h-3.5 w-3.5 ${isSeeding ? ' animate-bounce admin-text-warning' : ''}`} />
            <span>{isSeeding ? 'Sembrando...' : 'Sembrar en Firestore'}</span>
          </button>

          <button
            onClick={syncAllUsers}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 admin-radius-control text-xs font-mono border cursor-pointer active:scale-[0.98] ${
              isDarkTheme
                ? ' admin-bg-surface admin-border admin-text-secondary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
            title="Recargar usuarios desde Firestore /admin_users y /users"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? ' animate-spin admin-text-success' : ''}`} />
            <span>{isSyncing ? 'Cargando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className={`admin-card p-4 admin-radius-card border flex flex-wrap items-center justify-between gap-3 ${
        isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
      }`}>
        {/* Collection segment tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCollectionFilter('all')}
            className={`px-3 py-1.5 admin-radius-control text-xs font-mono font-medium cursor-pointer ${
              collectionFilter === 'all'
                ? isDarkTheme
                  ? ' admin-bg-surface admin-text-primary font-semibold border admin-border'
                  : ' admin-bg-subtle admin-text-primary font-semibold'
                : isDarkTheme
                  ? ' admin-text-secondary'
                  : ' admin-text-secondary'
            }`}
          >
            Todos ({counts.total})
          </button>

          <button
            onClick={() => setCollectionFilter('admin_users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 admin-radius-control text-xs font-mono font-medium cursor-pointer ${
              collectionFilter === 'admin_users'
                ? ' admin-bg-warning admin-text-warning font-semibold border admin-border-warning'
                : isDarkTheme
                  ? ' admin-text-secondary'
                  : ' admin-text-secondary'
            }`}
          >
            <ShieldCheck className="h-3 w-3 admin-text-warning" />
            <span>Administradores (/{FIRESTORE_COLLECTIONS.ADMIN_USERS}) ({counts.adminCount})</span>
          </button>

          <button
            onClick={() => setCollectionFilter('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 admin-radius-control text-xs font-mono font-medium cursor-pointer ${
              collectionFilter === 'users'
                ? ' admin-bg-primary admin-text-accent font-semibold border admin-border-info'
                : isDarkTheme
                  ? ' admin-text-secondary'
                  : ' admin-text-secondary'
            }`}
          >
            <Users className="h-3 w-3 admin-text-accent" />
            <span>Usuarios GoMining (/{FIRESTORE_COLLECTIONS.USERS}) ({counts.clientCount})</span>
          </button>
        </div>

        {/* Status dropdown & Search input */}
        <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`px-3 py-2 admin-radius-card text-xs font-mono border cursor-pointer ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <option value="all">Todos los Estados</option>
            <option value="ACTIVE">Solo Activos (ACTIVE)</option>
            <option value="SUSPENDED">Solo Suspendidos (SUSPENDED)</option>
            <option value="INACTIVE">Solo Inactivos (INACTIVE)</option>
            <option value="BLOCKED">Solo Bloqueados (BLOCKED)</option>
          </select>

          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-8 py-2 admin-radius-card text-xs font-mono border ${
                isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary placeholder-slate-500' : ' admin-bg-surface admin-border admin-text-primary'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {feedbackMsg && (
        <div className={`admin-card flex items-center justify-between gap-2 p-3.5 admin-radius-card text-xs font-mono border ${
          feedbackMsg.type === 'success'
            ? ' admin-bg-success admin-border-success admin-text-success'
            : ' admin-bg-danger admin-border-danger admin-text-danger'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 admin-text-success shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 admin-text-danger shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded admin-text-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* USERS TABLE */}
      <div
        className={`admin-card p-6 admin-radius-card border ${
          isDarkTheme
            ? ' admin-bg-surface admin-border admin-text-primary'
            : ' admin-bg-surface admin-border admin-text-primary'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-xs ${
                isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary font-semibold'
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
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Database className="h-8 w-8 mx-auto admin-text-secondary opacity-50 mb-2" />
                    <p className={`text-sm font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                      No se encontraron usuarios en las colecciones con los filtros aplicados.
                    </p>
                    <button
                      onClick={handleSeedBothCollections}
                      className="mt-3 px-3 py-1.5 admin-radius-control text-xs font-mono admin-text-warning border admin-border-warning cursor-pointer"
                    >
                      Sembrar cuentas iniciales en Firestore
                    </button>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isAdminUser = u.sourceCollection === 'admin_users' || Boolean(u.isPlatformAdmin);
                  return (
                    <tr
                      key={u.id}
                      className={`${
                        isDarkTheme ? '' : ''
                      }`}
                    >
                      {/* ADMINISTRADOR / EMAIL */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
                            {u.fullName}
                          </div>
                          {isAdminUser ? (
                            <span className="admin-badge text-xs px-2 py-0.5 admin-radius-control font-mono font-semibold admin-bg-subtle admin-text-secondary border admin-border">
                              Admin
                            </span>
                          ) : (
                            <span className="admin-badge text-xs px-2 py-0.5 admin-radius-control font-mono font-semibold admin-bg-surface admin-text-secondary border admin-border">
                              Usuario
                            </span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                            isAdminUser ? ' admin-bg-warning admin-text-warning border admin-border-warning' : ' admin-bg-info admin-text-accent border admin-border-info'
                          }`}>
                            /{u.sourceCollection || (isAdminUser ? 'admin_users' : 'users')}
                          </span>
                        </div>
                        <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                          {u.email}
                        </div>
                      </td>

                      {/* ROL / RANGO */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold border ${
                            isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
                          }`}>
                            {u.membershipPlan}
                          </span>
                          {u.role && (
                            <span className="text-xs font-mono admin-text-secondary">
                              {u.role}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CONTRATOS */}
                      <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                        {u.activeContractsCount} contratos
                      </td>

                      {/* POTENCIA TH/S */}
                      <td className="py-3 px-3 admin-text-success font-semibold">
                        {u.totalContractedTh} TH/s
                      </td>

                      {/* BALANCE ASIGNADO */}
                      <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
                        ${Number(u.walletBalanceUsdt || 0).toFixed(2)} USDT
                      </td>

                      {/* ESTADO */}
                      <td className="py-3 px-3">
                        <span
                          className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                            u.status === 'ACTIVE'
                              ? ' admin-bg-success admin-text-success border admin-border-success'
                              : u.status === 'SUSPENDED'
                              ? ' admin-bg-danger admin-text-danger border admin-border-danger'
                              : ' admin-bg-subtle admin-text-secondary border admin-border'
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
                            className={`p-1.5 admin-radius-control border cursor-pointer active:scale-[0.97] ${
                              isDarkTheme
                                ? ' admin-border admin-text-warning'
                                : ' admin-border-warning admin-text-warning'
                            }`}
                            title="Editar Parámetros del Usuario (Administrador, Email, Rol/Rango, Contratos, Potencia, Balance, Estado)"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          {/* VIEW 360 CARD BUTTON */}
                          <button
                            onClick={() => setViewingUser(u)}
                            className={`p-1.5 admin-radius-control border cursor-pointer active:scale-[0.97] ${
                              isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary'
                            }`}
                            title="Ver Ficha 360 del Usuario"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* TOGGLE STATUS BUTTON */}
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status)}
                            className={`p-1.5 admin-radius-control border text-xs font-mono active:scale-[0.97] cursor-pointer ${
                              u.status === 'ACTIVE'
                                ? ' admin-border-danger admin-text-danger'
                                : ' admin-border-success admin-text-success'
                            }`}
                            title={u.status === 'ACTIVE' ? 'Suspender Usuario' : 'Reactivar Usuario'}
                          >
                            {u.status === 'ACTIVE' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          </button>

                          {/* DELETE USER BUTTON */}
                          <button
                            onClick={() => setUserToDelete(u)}
                            className={`p-1.5 admin-radius-control border text-xs font-mono active:scale-[0.97] cursor-pointer ${
                              isDarkTheme
                                ? ' admin-border admin-text-danger'
                                : ' admin-border admin-text-danger'
                            }`}
                            title="Eliminar Usuario de Firestore"
                          >
                            <Trash2 className="h-4 w-4" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle overflow-y-auto">
          <div
            className={`admin-card w-full max-w-lg p-6 admin-radius-card border my-8 max-h-[90vh] overflow-y-auto ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 admin-text-success" />
                <h3 className={`text-lg font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
                  {isCreatingUser ? 'Crear Nuevo Usuario' : 'Editar Usuario / Administrador'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setIsCreatingUser(false);
                }}
                className={`p-1.5 admin-radius-control border cursor-pointer ${
                  isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-secondary'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 font-mono text-xs">
              {/* 1. ADMINISTRADOR / COLECCIÓN FIRESTORE */}
              <div>
                <label className={`block mb-1.5 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                  ADMINISTRADOR / Colección en Firestore:
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 admin-radius-card border cursor-pointer ${
                      formData.sourceCollection === 'admin_users'
                        ? ' admin-border-warning admin-bg-warning admin-text-warning font-semibold'
                        : isDarkTheme
                        ? ' admin-border admin-bg-surface admin-text-secondary'
                        : ' admin-border admin-bg-surface admin-text-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sourceCollection"
                      value="admin_users"
                      checked={formData.sourceCollection === 'admin_users'}
                      onChange={() => setFormData({
                        ...formData,
                        sourceCollection: 'admin_users',
                        isPlatformAdmin: true,
                        role: formData.role === 'CLIENT_PRO' ? 'SUPER_ADMIN' : formData.role
                      })}
                      className="sr-only"
                    />
                    <ShieldCheck className="h-4 w-4 admin-text-warning shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-semibold">/admin_users</div>
                      <div className="text-xs opacity-75">Administradores & Operadores</div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 admin-radius-card border cursor-pointer ${
                      formData.sourceCollection === 'users'
                        ? ' admin-border-info admin-bg-info admin-text-accent font-semibold'
                        : isDarkTheme
                        ? ' admin-border admin-bg-surface admin-text-secondary'
                        : ' admin-border admin-bg-surface admin-text-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sourceCollection"
                      value="users"
                      checked={formData.sourceCollection === 'users'}
                      onChange={() => setFormData({
                        ...formData,
                        sourceCollection: 'users',
                        isPlatformAdmin: false,
                        role: formData.role === 'SUPER_ADMIN' ? 'CLIENT_PRO' : formData.role
                      })}
                      className="sr-only"
                    />
                    <Users className="h-4 w-4 admin-text-accent shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-semibold">/users</div>
                      <div className="text-xs opacity-75">Clientes GoMining</div>
                    </div>
                  </label>
                </div>

                {/* Administrator Privileges Toggle */}
                <label className="flex items-center gap-2 px-3 py-2 admin-radius-card border admin-border admin-bg-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPlatformAdmin}
                    onChange={(e) => setFormData({ ...formData, isPlatformAdmin: e.target.checked })}
                    className="rounded admin-border admin-text-success cursor-pointer"
                  />
                  <span className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                    Privilegios de Administrador (Permite acceso al panel de control MinerX)
                  </span>
                </label>
              </div>

              {/* 2. NOMBRE COMPLETO & USERNAME */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    Nombre Completo:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Ej. Roman Master Admin"
                    className={`w-full px-3 py-2 admin-radius-card border ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    Usuario / Alias:
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Ej. roman_admin"
                    className={`w-full px-3 py-2 admin-radius-card border ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>
              </div>

              {/* 3. EMAIL */}
              <div>
                <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                  EMAIL OFICIAL:
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@minerx.cloud"
                  className={`w-full px-3 py-2 admin-radius-card border ${
                    isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                />
              </div>

              {/* 4. ROL / RANGO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    RANGO / Plan de Membresía:
                  </label>
                  <select
                    value={formData.membershipPlan}
                    onChange={(e) => setFormData({ ...formData, membershipPlan: e.target.value })}
                    className={`w-full px-3 py-2 admin-radius-card border cursor-pointer ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  >
                    {planOptions.map((plan) => (
                      <option key={plan} value={plan}>{plan}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    ROL de Plataforma:
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className={`w-full px-3 py-2 admin-radius-card border cursor-pointer ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. CONTRATOS, POTENCIA TH/S Y BALANCE */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    CONTRATOS ACTIVOS:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.activeContractsCount}
                    onChange={(e) => setFormData({ ...formData, activeContractsCount: parseInt(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 admin-radius-card border ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-xs admin-text-success font-semibold`}>
                    POTENCIA TH/S:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.totalContractedTh}
                    onChange={(e) => setFormData({ ...formData, totalContractedTh: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 admin-radius-card border font-semibold admin-text-success ${
                      isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    BALANCE ASIGNADO (USDT):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.walletBalanceUsdt}
                    onChange={(e) => setFormData({ ...formData, walletBalanceUsdt: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 admin-radius-card border font-semibold ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>
              </div>

              {/* 6. ESTADO */}
              <div>
                <label className={`block mb-1 text-xs font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                  ESTADO DE LA CUENTA:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'BLOCKED'] as UserStatus[]).map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setFormData({ ...formData, status: st })}
                      className={`py-2 px-2 admin-radius-control text-xs font-semibold border cursor-pointer ${
                        formData.status === st
                          ? st === 'ACTIVE'
                            ? ' admin-bg-primary admin-border-success admin-text-success'
                            : st === 'SUSPENDED'
                            ? ' admin-bg-danger admin-border-danger admin-text-danger'
                            : ' admin-bg-warning admin-border-warning admin-text-warning'
                          : isDarkTheme
                          ? ' admin-border admin-bg-surface admin-text-secondary'
                          : ' admin-border admin-bg-surface admin-text-secondary'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className={`mt-6 pt-4 border-t flex items-center justify-end gap-2 ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsCreatingUser(false);
                  }}
                  className={`px-4 py-2 admin-radius-control text-xs font-mono cursor-pointer ${
                    isDarkTheme ? ' admin-bg-surface admin-text-secondary' : ' admin-bg-surface admin-text-primary'
                  }`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 px-4 py-2 admin-radius-control text-xs font-mono font-semibold cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-primary admin-text-primary'
                      : ' admin-bg-primary admin-text-primary'
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
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-md p-6 admin-radius-card border ${
            isDarkTheme ? ' admin-bg-surface admin-border-danger admin-text-primary' : ' admin-bg-surface admin-border-danger admin-text-primary'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="admin-card p-2.5 admin-radius-card admin-bg-danger border admin-border-danger admin-text-danger">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold font-sans">Confirmar Eliminación</h3>
                <p className="text-xs admin-text-secondary font-mono">Esta acción eliminará el usuario de Cloud Firestore.</p>
              </div>
            </div>

            <p className="text-xs font-mono mb-4 admin-text-secondary">
              ¿Estás seguro de que deseas eliminar permanentemente a <span className="font-semibold admin-text-primary">{userToDelete.fullName}</span> ({userToDelete.email}) de la colección <span className="admin-text-warning font-semibold">/{userToDelete.sourceCollection || 'admin_users'}</span>?
            </p>

            <div className={`flex justify-end gap-2 pt-3 border-t ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 admin-radius-control text-xs font-mono admin-bg-surface admin-text-secondary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 admin-radius-control text-xs font-mono font-semibold admin-bg-danger admin-text-primary cursor-pointer"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar de Firestore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER 360 DETAIL MODAL */}
      {/* ========================================================================= */}
      {viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div
            className={`admin-card w-full max-w-md p-6 admin-radius-card border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 admin-text-warning" />
                <h3 className={`text-lg font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
                  Ficha 360 de Usuario
                </h3>
              </div>
              <button
                onClick={() => setViewingUser(null)}
                className={`p-1.5 admin-radius-control border cursor-pointer ${
                  isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-secondary'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>ID Usuario:</span>
                <span className={`font-mono text-xs truncate max-w-[200px] ${isDarkTheme ? ' admin-text-warning' : ' admin-text-warning'}`}>
                  {viewingUser.id}
                </span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Colección Firestore:</span>
                <span className="font-semibold admin-text-accent">
                  /{viewingUser.sourceCollection || (viewingUser.isPlatformAdmin ? 'admin_users' : 'users')}
                </span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Nombre Completo:</span>
                <span className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{viewingUser.fullName}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Email Oficial:</span>
                <span className="admin-text-accent font-semibold">{viewingUser.email}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Rango / Membresía:</span>
                <span className="font-semibold admin-text-success">{viewingUser.membershipPlan}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Contratos Activos:</span>
                <span className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{viewingUser.activeContractsCount}</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Potencia Minera:</span>
                <span className="font-semibold admin-text-success">{viewingUser.totalContractedTh} TH/s</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Saldo Asignado:</span>
                <span className="font-semibold admin-text-success">${Number(viewingUser.walletBalanceUsdt || 0).toFixed(2)} USDT</span>
              </div>
              <div className={`flex justify-between py-1 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>PRL Acumulado:</span>
                <span className="font-semibold admin-text-warning">{Number(viewingUser.totalPrlAccumulated || 0).toFixed(2)} PRL</span>
              </div>
              <div className="flex justify-between py-1">
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Última Conexión:</span>
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary'}>
                  {new Date(viewingUser.lastLoginAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={`mt-6 pt-3 border-t flex justify-between items-center ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <button
                onClick={() => {
                  const toEdit = viewingUser;
                  setViewingUser(null);
                  handleOpenEdit(toEdit);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 admin-radius-control text-xs font-mono font-semibold admin-text-warning admin-bg-warning border admin-border-warning cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Editar Parámetros</span>
              </button>

              <button
                onClick={() => setViewingUser(null)}
                className={`px-4 py-2 admin-radius-control text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
                  isDarkTheme ? ' admin-bg-surface admin-text-primary' : ' admin-bg-surface admin-text-primary border admin-border'
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
