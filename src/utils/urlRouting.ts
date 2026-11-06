/**
 * URL and Navigation Tab resolution for MinerX and GoMining Admin Center
 */
export function resolveTabFromUrl(search: string, pathname: string): { tab: string; suite: 'fleet' | 'admin' } | null {
  try {
    const params = new URLSearchParams(search);
    const tabParam = params.get('tab');
    if (tabParam) {
      const lower = tabParam.toLowerCase();
      if (lower === 'users' || lower === 'usuarios' || lower === 'admin_users') {
        return { tab: 'admin_users', suite: 'admin' };
      }
      if (lower === 'packages' || lower === 'paquetes' || lower === 'admin_packages') {
        return { tab: 'admin_packages', suite: 'admin' };
      }
      if (lower === 'orders' || lower === 'pagos' || lower === 'admin_orders') {
        return { tab: 'admin_orders', suite: 'admin' };
      }
      if (lower === 'allocations' || lower === 'potencia' || lower === 'contratos' || lower === 'contracts' || lower === 'admin_allocations') {
        return { tab: 'admin_allocations', suite: 'admin' };
      }
      if (tabParam.startsWith('admin_')) {
        return { tab: tabParam, suite: 'admin' };
      }
      return { tab: tabParam, suite: 'fleet' };
    }
    const path = pathname.toLowerCase();
    if (path.includes('/users') || path.includes('/usuarios')) {
      return { tab: 'admin_users', suite: 'admin' };
    }
    if (path.includes('/packages') || path.includes('/paquetes')) {
      return { tab: 'admin_packages', suite: 'admin' };
    }
    if (path.includes('/orders') || path.includes('/pagos')) {
      return { tab: 'admin_orders', suite: 'admin' };
    }
    if (path.includes('/allocations') || path.includes('/potencia') || path.includes('/contratos') || path.includes('/contracts')) {
      return { tab: 'admin_allocations', suite: 'admin' };
    }
  } catch {}
  return null;
}
