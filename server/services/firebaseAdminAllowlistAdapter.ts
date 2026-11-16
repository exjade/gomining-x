import { getFirestore } from 'firebase-admin/firestore';
import {
  firebaseAdminAuthAdapter,
  type FirebaseAdminAuthAdapter,
} from './firebaseAdminAuthAdapter.js';

export interface FirestoreDocumentSnapshotLike {
  id?: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface FirestoreQuerySnapshotLike {
  docs: FirestoreDocumentSnapshotLike[];
}

export interface FirestoreCollectionLike {
  doc(id: string): {
    get(): Promise<FirestoreDocumentSnapshotLike>;
    set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  };
  get(): Promise<FirestoreQuerySnapshotLike>;
}

export interface FirestoreLike {
  collection(name: string): FirestoreCollectionLike;
}

export interface VerifiedFirebaseTokenLike {
  uid: string;
  email?: string | null;
  email_verified?: boolean;
}

export interface AdminAllowlistUser {
  id: string;
  firebaseAuthUid: string;
  username: string;
  email: string;
  fullName: string;
  role: 'admin';
  createdAt: string;
  isStoredInFirebaseAuth: true;
  isPublishedToFirestore: true;
  passwordHash: '';
}

export type AdminAllowlistDecision =
  | { status: 'approved'; user: AdminAllowlistUser }
  | { status: 'denied' }
  | { status: 'unavailable'; code: string };

interface FirebaseAdminAllowlistAdapterOptions {
  authAdapter?: Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'getApp'>;
  firestore?: FirestoreLike | null;
  warn?: (message: string) => void;
}

/** Reads the durable admin authority without creating a second Firebase Admin app. */
export class FirebaseAdminAllowlistAdapter {
  private readonly authAdapter: Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'getApp'>;
  private readonly warn: (message: string) => void;
  private firestore: FirestoreLike | null | undefined;
  private firestoreApp: unknown = null;
  private lastDiagnostic: string | null = null;

  constructor(options: FirebaseAdminAllowlistAdapterOptions = {}) {
    this.authAdapter = options.authAdapter || firebaseAdminAuthAdapter;
    this.firestore = options.firestore;
    this.warn = options.warn || console.warn;
  }

  setFirestoreInstance(firestore: FirestoreLike | null): void {
    this.firestore = firestore;
    this.firestoreApp = null;
  }

  getLastDiagnostic(): string | null {
    return this.lastDiagnostic;
  }

  async resolve(token: VerifiedFirebaseTokenLike): Promise<AdminAllowlistDecision> {
    if (!token.uid) return { status: 'denied' };

    const firestore = this.getFirestore();
    if (!firestore) {
      return { status: 'unavailable', code: 'ADMIN_ALLOWLIST_UNAVAILABLE' };
    }

    try {
      const collection = firestore.collection('admin_users');
      const exactSnapshot = await collection.doc(token.uid).get();
      if (exactSnapshot.exists) {
        return this.resolveDocument(token, exactSnapshot.data() || {}, false);
      }

      if (token.email_verified !== true) return { status: 'denied' };

      const tokenEmail = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
      if (!tokenEmail) return { status: 'denied' };

      const legacySnapshot = await collection.get();
      const matchingLegacyDocuments = legacySnapshot.docs.filter((document) => {
        const data = document.data() || {};
        const storedEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        return storedEmail === tokenEmail;
      });
      if (matchingLegacyDocuments.length !== 1) return { status: 'denied' };
      return this.resolveDocument(token, matchingLegacyDocuments[0].data() || {}, true);
    } catch {
      this.report('firestore-read-failed');
      return { status: 'unavailable', code: 'ADMIN_ALLOWLIST_UNAVAILABLE' };
    }
  }

  private getFirestore(): FirestoreLike | null {
    if (this.firestore) return this.firestore;
    if (!this.authAdapter.isInitialized()) {
      this.report('firebase-admin-auth-unavailable');
      return null;
    }

    const app = this.authAdapter.getApp();
    if (!app) {
      this.report('firebase-admin-app-unavailable');
      return null;
    }
    if (this.firestoreApp === app && this.firestore) return this.firestore;

    try {
      this.firestore = getFirestore(app) as unknown as FirestoreLike;
      this.firestoreApp = app;
      return this.firestore;
    } catch {
      this.report('firebase-admin-firestore-unavailable');
      return null;
    }
  }

  private report(code: string): void {
    this.lastDiagnostic = code;
    this.warn(`[AdminAllowlist] ${code}; authorization remains closed.`);
  }

  private resolveDocument(
    token: VerifiedFirebaseTokenLike,
    data: Record<string, unknown>,
    legacyEmailMatch: boolean
  ): AdminAllowlistDecision {
    const role = typeof data.role === 'string' ? data.role.trim().toLowerCase() : '';
    const storedBindings = [data.uid, data.firebaseAuthUid]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
    if (
      role !== 'admin' ||
      (legacyEmailMatch ? storedBindings.length > 0 : storedBindings.some((binding) => binding !== token.uid))
    ) {
      return { status: 'denied' };
    }

    const tokenEmail = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
    const storedEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const email = tokenEmail || storedEmail;
    const displayName =
      (typeof data.displayName === 'string' && data.displayName.trim()) ||
      (typeof data.fullName === 'string' && data.fullName.trim()) ||
      email.split('@')[0] ||
      token.uid;

    return {
      status: 'approved',
      user: {
        id: token.uid,
        firebaseAuthUid: token.uid,
        username: displayName,
        email,
        fullName: displayName,
        role: 'admin',
        createdAt:
          typeof data.createdAt === 'string' && data.createdAt.trim()
            ? data.createdAt
            : new Date().toISOString(),
        isStoredInFirebaseAuth: true,
        isPublishedToFirestore: true,
        passwordHash: '',
      },
    };
  }
}

export const firebaseAdminAllowlistAdapter = new FirebaseAdminAllowlistAdapter();
