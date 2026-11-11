import fs from 'fs';
import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';

export const ADMIN_APP_NAME = 'minerx-backend-admin';

export interface FirebaseAdminAuthAdapterOptions {
  auth?: Auth | any;
  projectId?: string;
}

/**
 * Server-side Firebase Admin Auth adapter.
 * Runs strictly in backend Node runtime (never bundled in Vite/Client).
 * Uses service account credentials explicitly via GOOGLE_APPLICATION_CREDENTIALS
 * or local emulator host (FIREBASE_AUTH_EMULATOR_HOST).
 * Fails closed if neither valid credentials nor emulator host is present.
 */
export class FirebaseAdminAuthAdapter {
  private auth: Auth | any = null;
  private app: App | null = null;
  private readonly projectId: string;

  constructor(options?: FirebaseAdminAuthAdapterOptions | any) {
    if (options && ('verifyIdToken' in options || 'auth' in options)) {
      this.auth = options.auth !== undefined ? options.auth : options;
      this.projectId = options.projectId || 'salad-miners';
      return;
    }

    const opts: FirebaseAdminAuthAdapterOptions = options || {};
    this.projectId = opts.projectId || 'salad-miners';

    this.initFirebaseAdmin(opts);
  }

  private initFirebaseAdmin(_opts: FirebaseAdminAuthAdapterOptions): void {
    try {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const hasValidCredentials = Boolean(credPath && fs.existsSync(credPath));
      const hasEmulator = Boolean(
        process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST
      );

      if (!hasValidCredentials && !hasEmulator) {
        // Fail closed: no auto-discovery or silent fallbacks
        this.auth = null;
        this.app = null;
        return;
      }

      const existingApp = getApps().find((a) => a.name === ADMIN_APP_NAME);

      if (existingApp) {
        this.app = existingApp;
      } else {
        if (hasValidCredentials) {
          this.app = initializeApp(
            {
              projectId: this.projectId,
              credential: applicationDefault(),
            },
            ADMIN_APP_NAME
          );
        } else if (hasEmulator) {
          this.app = initializeApp(
            {
              projectId: this.projectId,
            },
            ADMIN_APP_NAME
          );
        }
      }

      if (this.app) {
        this.auth = getAuth(this.app);
      }
    } catch (err: any) {
      console.warn('[FirebaseAdminAuthAdapter] Initialization notice:', err?.message || err);
      this.auth = null;
      this.app = null;
    }
  }

  public getAuthInstance(): Auth | any {
    return this.auth;
  }

  public setAuthInstance(authInstance: Auth | any): void {
    this.auth = authInstance;
  }

  public isInitialized(): boolean {
    return Boolean(this.auth);
  }

  public async verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
    if (!this.auth || !idToken) {
      return null;
    }
    try {
      const decoded = await this.auth.verifyIdToken(idToken);
      return decoded || null;
    } catch {
      return null;
    }
  }
}

export const firebaseAdminAuthAdapter = new FirebaseAdminAuthAdapter();
export type { DecodedIdToken };
