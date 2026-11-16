import { cert, initializeApp, getApps, applicationDefault, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken, type UserRecord } from 'firebase-admin/auth';

export const ADMIN_APP_NAME = 'minerx-backend-admin';

export type FirebaseAdminAuthDiagnosticCategory =
  | 'initialization_unavailable'
  | 'initialization_failure'
  | 'initialization_recovered'
  | 'token_verification_failure'
  | 'user_lookup_failure';

export interface FirebaseAdminAuthDiagnostic {
  category: FirebaseAdminAuthDiagnosticCategory;
  code?: string;
}

export interface FirebaseAdminAuthAdapterDependencies {
  getEnv: (name: string) => string | undefined;
  getApps: typeof getApps;
  initializeApp: typeof initializeApp;
  applicationDefault: typeof applicationDefault;
  cert: typeof cert;
  getAuth: typeof getAuth;
  warn: (diagnostic: FirebaseAdminAuthDiagnostic) => void;
}

export interface FirebaseAdminAuthAdapterOptions {
  auth?: Auth | any;
  projectId?: string;
  dependencies?: Partial<FirebaseAdminAuthAdapterDependencies>;
}

const defaultDependencies: FirebaseAdminAuthAdapterDependencies = {
  getEnv: (name) => process.env[name],
  getApps,
  initializeApp,
  applicationDefault,
  cert,
  getAuth,
  warn: (diagnostic) => console.warn('[FirebaseAdminAuthAdapter]', diagnostic),
};

function decodeServiceAccount(secret: string, projectId: string): ServiceAccount {
  const encoded = secret.trim();
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    throw new Error('invalid service account secret');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('invalid service account secret');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('invalid service account secret');
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.project_id !== 'string' ||
    record.project_id !== projectId ||
    typeof record.client_email !== 'string' ||
    !record.client_email.trim() ||
    typeof record.private_key !== 'string' ||
    !record.private_key.includes('BEGIN PRIVATE KEY')
  ) {
    throw new Error('invalid service account secret');
  }

  return {
    projectId: record.project_id,
    clientEmail: record.client_email,
    privateKey: record.private_key,
  };
}

function safeFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Za-z0-9._/-]{1,64}$/.test(code) ? code : undefined;
}

/**
 * Server-side Firebase Admin Auth adapter.
 * Runs strictly in backend Node runtime (never bundled in Vite/Client).
 * Uses emulator credentials, a server-only service-account secret, or Google
 * Application Default Credentials. It never exposes credentials to the client.
 */
export class FirebaseAdminAuthAdapter {
  private auth: Auth | any = null;
  private app: App | null = null;
  private readonly projectId: string;
  private readonly dependencies: FirebaseAdminAuthAdapterDependencies;
  private authInstanceOverridden = false;
  private initializationFailed = false;
  private lastDiagnosticKey: string | null = null;

  constructor(options?: FirebaseAdminAuthAdapterOptions | any) {
    const opts: FirebaseAdminAuthAdapterOptions = options || {};
    this.projectId = opts.projectId || 'salad-miners';
    this.dependencies = { ...defaultDependencies, ...opts.dependencies };

    if (options && ('verifyIdToken' in options || 'auth' in options)) {
      this.auth = options.auth !== undefined ? options.auth : options;
      this.authInstanceOverridden = true;
      return;
    }

  }

  private reportDiagnostic(category: FirebaseAdminAuthDiagnosticCategory, error?: unknown): void {
    const code = safeFirebaseErrorCode(error);
    const key = `${category}:${code || ''}`;
    if (this.lastDiagnosticKey === key) {
      return;
    }
    this.lastDiagnosticKey = key;
    this.dependencies.warn(code ? { category, code } : { category });
  }

  private markInitialized(): void {
    if (this.initializationFailed) {
      this.reportDiagnostic('initialization_recovered');
    }
    this.initializationFailed = false;
  }

  private ensureInitialized(): boolean {
    if (this.auth || this.authInstanceOverridden) {
      return Boolean(this.auth);
    }

    try {
      const existingApp = this.dependencies.getApps().find((candidate) => candidate.name === ADMIN_APP_NAME);
      if (existingApp) {
        this.app = existingApp;
        this.auth = this.dependencies.getAuth(existingApp);
        if (!this.auth) {
          this.app = null;
          this.initializationFailed = true;
          this.reportDiagnostic('initialization_failure');
          return false;
        }
        this.markInitialized();
        return true;
      }

      const hasEmulator = Boolean(
        this.dependencies.getEnv('FIREBASE_AUTH_EMULATOR_HOST') ||
        this.dependencies.getEnv('FIRESTORE_EMULATOR_HOST')
      );
      const serviceAccountBase64 = this.dependencies.getEnv('FIREBASE_SERVICE_ACCOUNT_BASE64');
      const appOptions = hasEmulator
        ? { projectId: this.projectId }
        : {
            projectId: this.projectId,
            credential:
              serviceAccountBase64 !== undefined
                ? this.dependencies.cert(decodeServiceAccount(serviceAccountBase64, this.projectId))
                : this.dependencies.applicationDefault(),
          };

      this.app = this.dependencies.initializeApp(appOptions, ADMIN_APP_NAME);
      this.auth = this.dependencies.getAuth(this.app);

      if (!this.auth) {
        this.app = null;
        this.initializationFailed = true;
        this.reportDiagnostic('initialization_failure');
        return false;
      }

      this.markInitialized();
      return true;
    } catch (error) {
      this.auth = null;
      this.app = null;
      this.initializationFailed = true;
      const hasConfiguredCredentialSource =
        this.dependencies.getEnv('FIREBASE_SERVICE_ACCOUNT_BASE64') !== undefined ||
        Boolean(this.dependencies.getEnv('GOOGLE_APPLICATION_CREDENTIALS')) ||
        Boolean(
          this.dependencies.getEnv('FIREBASE_AUTH_EMULATOR_HOST') ||
            this.dependencies.getEnv('FIRESTORE_EMULATOR_HOST')
        );
      this.reportDiagnostic(hasConfiguredCredentialSource ? 'initialization_failure' : 'initialization_unavailable', error);
      return false;
    }
  }

  public getAuthInstance(): Auth | any {
    return this.auth;
  }

  public setAuthInstance(authInstance: Auth | any): void {
    this.authInstanceOverridden = true;
    this.auth = authInstance;
  }

  public isInitialized(): boolean {
    return this.ensureInitialized();
  }

  public getApp(): App | null {
    return this.app;
  }

  public async getUser(uid: string): Promise<UserRecord | null> {
    if (!uid || !this.ensureInitialized()) {
      return null;
    }
    try {
      const user = await this.auth.getUser(uid);
      return user || null;
    } catch (error) {
      this.reportDiagnostic('user_lookup_failure', error);
      return null;
    }
  }

  public async getUserByEmail(email: string): Promise<UserRecord | null> {
    if (!email || !this.ensureInitialized()) {
      return null;
    }
    try {
      const user = await this.auth.getUserByEmail(email);
      return user || null;
    } catch (error) {
      this.reportDiagnostic('user_lookup_failure', error);
      return null;
    }
  }

  public async verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
    if (!idToken || !this.ensureInitialized()) {
      return null;
    }
    try {
      const decoded = await this.auth.verifyIdToken(idToken);
      return decoded || null;
    } catch (error) {
      this.reportDiagnostic('token_verification_failure', error);
      return null;
    }
  }
}

export const firebaseAdminAuthAdapter = new FirebaseAdminAuthAdapter();
export type { DecodedIdToken, UserRecord };
