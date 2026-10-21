import { apiFetch } from './apiConfig';

/**
 * MinerX Native Notification & Telegram Dispatch Engine
 * Provides OS-level native desktop and mobile push notifications for GPU events,
 * plus resilient Telegram messaging that works in Local, Electron, Android, and Firebase Hosting.
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

/**
 * Resilient Telegram Dispatcher:
 * Tries the backend proxy first (which handles rate limiting and logging).
 * If on Firebase Hosting (where the static CDN returns 404 for /api),
 * it seamlessly dispatches directly to api.telegram.org using browser fetch (CORS supported).
 */
export async function sendTelegramMessageResilient(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ success: boolean; message: string }> {
  if (!botToken || !chatId) {
    return { success: false, message: 'Faltan credenciales del Bot de Telegram (Token o Chat ID).' };
  }

  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();

  // 1. Try Backend Proxy
  try {
    const proxyRes = await apiFetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken, chatId: cleanChatId, customMessage: text })
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      return { success: true, message: data.message || 'Mensaje enviado vía Proxy' };
    }
  } catch {
    // If backend proxy fails or is 404 on Firebase Hosting, fallback to direct browser fetch
  }

  // 2. Direct Telegram API call (Telegram natively supports Access-Control-Allow-Origin: *)
  try {
    const directUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
    const response = await fetch(directUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (data.ok) {
      return { success: true, message: '¡Mensaje entregado exitosamente en tu Telegram!' };
    }
    return { success: false, message: `Error de Telegram: ${data.description || 'Desconocido'}` };
  } catch (err: any) {
    return { success: false, message: `Fallo de conexión con Telegram: ${err.message || 'Error de red'}` };
  }
}
