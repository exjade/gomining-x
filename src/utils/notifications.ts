/**
 * MinerX Native Notification Engine
 * Provides OS-level native desktop and mobile push notifications for GPU events.
 */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch (err) {
    console.error('[MinerX Notifications] Error requesting permission:', err);
    return false;
  }
}

export function sendNativeNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notif = new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      silent: false,
      ...options
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    return notif;
  } catch (err) {
    console.error('[MinerX Notifications] Failed to dispatch native notification:', err);
    return null;
  }
}
