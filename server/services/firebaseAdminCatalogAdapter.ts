import fs from 'fs';
import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { CatalogStoreAdapter } from '../../src/services/catalogService.js';
import type { CommercialPackage } from '../../src/types/admin.js';
import { deserializeCommercialPackageDoc, COMMERCIAL_PACKAGES_COLLECTION } from '../../src/services/admin/commercialPackageService.js';

export const ADMIN_APP_NAME = 'minerx-backend-admin';

export interface FirebaseAdminCatalogStoreAdapterOptions {
  firestore?: Firestore | any;
  projectId?: string;
}

/**
 * Server-side authorized Firestore adapter for CatalogService backed by Firebase Admin SDK.
 * Runs strictly in backend Node runtime (never bundled in Vite/Client).
 * Uses service account credentials explicitly via GOOGLE_APPLICATION_CREDENTIALS.
 * Fails closed if neither GOOGLE_APPLICATION_CREDENTIALS (pointing to an existing file)
 * nor FIRESTORE_EMULATOR_HOST is configured.
 */
export class FirebaseAdminCatalogStoreAdapter implements CatalogStoreAdapter {
  private firestore: Firestore | any = null;
  private app: App | null = null;
  private readonly projectId: string;

  constructor(options?: FirebaseAdminCatalogStoreAdapterOptions | any) {
    if (options && ('firestore' in options || 'collection' in options)) {
      this.firestore = options.firestore !== undefined ? options.firestore : options;
      this.projectId = options.projectId || 'salad-miners';
      if (this.firestore && typeof this.firestore.settings === 'function') {
        try {
          this.firestore.settings({ ignoreUndefinedProperties: true });
        } catch {
          // ignore if settings() has already been called
        }
      }
      return;
    }

    const opts: FirebaseAdminCatalogStoreAdapterOptions = options || {};
    this.projectId = opts.projectId || 'salad-miners';

    this.initFirebaseAdmin(opts);
  }

  private initFirebaseAdmin(opts: FirebaseAdminCatalogStoreAdapterOptions): void {
    try {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const hasValidCredentials = Boolean(credPath && fs.existsSync(credPath));
      const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

      if (!hasValidCredentials && !hasEmulator) {
        // Fail closed / no initialization without searching or auto-discovering files
        this.firestore = null;
        this.app = null;
        return;
      }

      const existingApp = getApps().find(a => a.name === ADMIN_APP_NAME);

      if (existingApp) {
        this.app = existingApp;
      } else {
        if (hasValidCredentials) {
          this.app = initializeApp({
            projectId: this.projectId,
            credential: applicationDefault(),
          }, ADMIN_APP_NAME);
        } else if (hasEmulator) {
          this.app = initializeApp({
            projectId: this.projectId,
          }, ADMIN_APP_NAME);
        }
      }

      if (this.app) {
        this.firestore = getFirestore(this.app);
        if (typeof this.firestore.settings === 'function') {
          try {
            this.firestore.settings({ ignoreUndefinedProperties: true });
          } catch {
            // ignore if settings() has already been called
          }
        }
      }
    } catch (err: any) {
      console.warn('[FirebaseAdminCatalogStoreAdapter] Initialization notice:', err?.message || err);
      this.firestore = null;
      this.app = null;
    }
  }

  public getFirestoreInstance(): Firestore | any {
    return this.firestore;
  }

  public isInitialized(): boolean {
    return Boolean(this.firestore);
  }

  async getPackages(): Promise<CommercialPackage[]> {
    if (!this.firestore) {
      return [];
    }
    const snap = await this.firestore.collection(COMMERCIAL_PACKAGES_COLLECTION).get();
    if (!snap || snap.empty) {
      return [];
    }
    return snap.docs.map((doc: any) => deserializeCommercialPackageDoc(doc.id, doc.data()));
  }

  async getPackageById(id: string): Promise<CommercialPackage | null> {
    if (!this.firestore || !id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const docRef = this.firestore.collection(COMMERCIAL_PACKAGES_COLLECTION).doc(id.trim());
    const snap = await docRef.get();
    const exists = typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists);
    if (!exists) {
      return null;
    }
    return deserializeCommercialPackageDoc(snap.id, snap.data());
  }

  async savePackage(pkg: CommercialPackage): Promise<void> {
    if (!this.firestore) {
      throw new Error('Firebase Admin Firestore is not initialized. Please configure GOOGLE_APPLICATION_CREDENTIALS.');
    }
    const docId = pkg.packageId || pkg.id;
    if (!docId || typeof docId !== 'string' || !docId.trim()) {
      throw new Error('Package id is required for savePackage');
    }

    // Strip undefined values so Firestore serialization never throws regardless of settings
    const cleanData: Record<string, any> = {};
    for (const [key, val] of Object.entries(pkg)) {
      if (val !== undefined) {
        cleanData[key] = val;
      }
    }

    const docRef = this.firestore.collection(COMMERCIAL_PACKAGES_COLLECTION).doc(docId.trim());
    await docRef.set(cleanData, { merge: true });
  }
}
