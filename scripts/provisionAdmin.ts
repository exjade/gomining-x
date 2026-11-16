import { getFirestore } from 'firebase-admin/firestore';
import {
  firebaseAdminAuthAdapter,
  FirebaseAdminAuthAdapter,
  type UserRecord,
} from '../server/services/firebaseAdminAuthAdapter.js';
import {
  readUsers,
  writeUsers,
  type UserAccount,
} from '../server/server.js';

export interface ProvisionAdminOptions {
  email?: string;
  uid?: string;
  role?: string;
  authority?: 'firestore' | 'file';
  dryRun?: boolean;
  skipFirestore?: boolean;
  authAdapter?: FirebaseAdminAuthAdapter;
  firestoreInstance?: any;
}

export interface ProvisionAdminResult {
  success: boolean;
  dryRun: boolean;
  message: string;
  user: UserAccount;
  firestoreProjected: boolean;
  firestoreError?: string;
}

/**
 * Authoritative Server-Side Admin Provisioning (SCRUM-243 / POUW-1.7)
 * Verifies that the specified identity exists in Firebase Authentication,
 * extracts real UID and email, and upserts server/data/users.json allowlist.
 * Optionally projects the approved admin to Firestore /admin_users/{realUid}.
 */
export async function provisionAdmin(options: ProvisionAdminOptions): Promise<ProvisionAdminResult> {
  const email = options.email?.trim().toLowerCase();
  const uid = options.uid?.trim();
  const role = options.role?.trim().toLowerCase() || 'admin';
  const authority = options.authority || 'file';
  const dryRun = Boolean(options.dryRun);
  const skipFirestore = Boolean(options.skipFirestore);
  const authAdapter = options.authAdapter || firebaseAdminAuthAdapter;

  if (authority !== 'firestore' && authority !== 'file') {
    throw new Error('La autoridad de aprovisionamiento debe ser firestore o file.');
  }
  if (authority === 'firestore' && skipFirestore) {
    throw new Error('La autoridad firestore no puede combinarse con --skip-firestore.');
  }
  if (authority === 'firestore' && role !== 'admin') {
    throw new Error('La autoridad firestore requiere role=admin.');
  }

  if (!email && !uid) {
    throw new Error('Debes proporcionar un --email o --uid para aprovisionar como administrador.');
  }

  if (!authAdapter.isInitialized()) {
    throw new Error('Firebase Admin Auth no está inicializado. Se requiere credencial o emulador activo.');
  }

  // 1. Lookup real user in Firebase Authentication
  let firebaseUser: UserRecord | null = null;
  if (uid) {
    firebaseUser = await authAdapter.getUser(uid);
  } else if (email) {
    firebaseUser = await authAdapter.getUserByEmail(email);
  }

  if (!firebaseUser) {
    const target = uid || email;
    throw new Error(`Identidad no encontrada en Firebase Authentication: "${target}". El aprovisionamiento administrativo requiere una cuenta Firebase existente.`);
  }

  const realUid = firebaseUser.uid;
  const realEmail = firebaseUser.email || email || '';
  const displayName = firebaseUser.displayName || realEmail.split('@')[0] || 'admin';

  if (authority === 'firestore') {
    let firestoreProjected = false;
    if (!dryRun) {
      let firestore = options.firestoreInstance;
      if (!firestore) {
        const app = authAdapter.getApp();
        if (app) firestore = getFirestore(app);
      }
      if (!firestore) {
        throw new Error('La autoridad Firestore no está disponible.');
      }
      try {
        await firestore.collection('admin_users').doc(realUid).set(
          {
            uid: realUid,
            email: realEmail,
            role,
            displayName,
            updatedAt: new Date().toISOString(),
            provisionedBy: 'cli',
          },
          { merge: true }
        );
        firestoreProjected = true;
      } catch {
        throw new Error('No se pudo actualizar la autoridad Firestore.');
      }
    }

    return {
      success: dryRun || firestoreProjected,
      dryRun,
      message: dryRun
        ? '[DRY-RUN] Identidad Firebase validada; autoridad Firestore no modificada.'
        : 'Administrador aprovisionado en la autoridad Firestore /admin_users.',
      user: {
        id: realUid,
        firebaseAuthUid: realUid,
        username: displayName,
        email: realEmail,
        fullName: displayName,
        role,
        passwordHash: '',
        createdAt: new Date().toISOString(),
        isStoredInFirebaseAuth: true,
        isPublishedToFirestore: firestoreProjected,
      },
      firestoreProjected,
    };
  }

  // 2. Read users.json and upsert
  const db = readUsers();
  const existingIndex = db.users.findIndex(
    (u) =>
      (u.firebaseAuthUid && u.firebaseAuthUid === realUid) ||
      (u.id && u.id === realUid) ||
      (u.email && realEmail && u.email.toLowerCase() === realEmail.toLowerCase())
  );

  let provisionedUser: UserAccount;

  if (existingIndex >= 0) {
    const existing = db.users[existingIndex];
    existing.id = existing.id || realUid;
    existing.firebaseAuthUid = realUid;
    existing.email = realEmail;
    existing.username = existing.username || displayName;
    existing.fullName = existing.fullName || displayName;
    existing.role = role;
    existing.isStoredInFirebaseAuth = true;
    existing.isPublishedToFirestore = false;
    existing.passwordHash = ''; // Never store plaintext password
    provisionedUser = existing;
  } else {
    provisionedUser = {
      id: realUid,
      firebaseAuthUid: realUid,
      username: displayName,
      email: realEmail,
      fullName: displayName,
      role: role,
      passwordHash: '',
      createdAt: new Date().toISOString(),
      isStoredInFirebaseAuth: true,
      isPublishedToFirestore: false,
    };
    db.users.push(provisionedUser);
  }

  let firestoreProjected = false;
  let firestoreError: string | null = null;
  let firestoreUnavailable = false;

  if (!dryRun) {
    // 3. Optional projection to Firestore /admin_users/{realUid}
    if (!skipFirestore) {
      try {
        let firestore = options.firestoreInstance;
        if (!firestore) {
          const app = authAdapter.getApp();
          if (app) {
            firestore = getFirestore(app);
          }
        }
        if (firestore) {
          const docRef = firestore.collection('admin_users').doc(realUid);
          await docRef.set(
            {
              uid: realUid,
              email: realEmail,
              role: role,
              displayName,
              updatedAt: new Date().toISOString(),
              provisionedBy: 'cli',
            },
            { merge: true }
          );
          firestoreProjected = true;
          provisionedUser.isPublishedToFirestore = true;
        } else {
          firestoreUnavailable = true;
          console.warn(`[provisionAdmin] Advertencia: Firestore no disponible o no inicializado. Proyección en /admin_users/${realUid} omitida.`);
        }
      } catch (fsErr: any) {
        firestoreError = fsErr?.message || String(fsErr);
        console.error(`[provisionAdmin] Error al proyectar en Firestore /admin_users/${realUid}:`, firestoreError);
      }
    }

    // Write allowlist to users.json ONLY AFTER Firestore projection has succeeded or failed
    writeUsers(db);
  }

  const success = dryRun || skipFirestore || firestoreProjected;

  let message: string;
  if (dryRun) {
    message = `[DRY-RUN] Usuario Firebase validado. Simulado aprovisionamiento como ${role}: UID=${realUid}, Email=${realEmail}`;
  } else if (skipFirestore) {
    message = `Administrador aprovisionado exitosamente: UID=${realUid}, Email=${realEmail}, Rol=${role} (proyección a Firestore omitida)`;
  } else if (firestoreProjected) {
    message = `Administrador aprovisionado exitosamente: UID=${realUid}, Email=${realEmail}, Rol=${role} (proyectado en /admin_users)`;
  } else if (firestoreError) {
    message = `Administrador guardado en allowlist local pero falló la proyección a Firestore: UID=${realUid}, Email=${realEmail}, Rol=${role} (error: ${firestoreError})`;
  } else {
    message = `Administrador guardado en allowlist local pero no se proyectó a Firestore: UID=${realUid}, Email=${realEmail}, Rol=${role} (Firestore no disponible)`;
  }

  return {
    success,
    dryRun,
    message,
    user: provisionedUser,
    firestoreProjected,
    ...(firestoreError ? { firestoreError } : {}),
  };
}

// CLI argument parser
export function parseCliArgs(argv: string[] = process.argv.slice(2)): ProvisionAdminOptions {
  const options: ProvisionAdminOptions = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--email=')) {
      options.email = arg.slice('--email='.length);
    } else if (arg === '--email' && argv[i + 1]) {
      options.email = argv[++i];
    } else if (arg.startsWith('--uid=')) {
      options.uid = arg.slice('--uid='.length);
    } else if (arg === '--uid' && argv[i + 1]) {
      options.uid = argv[++i];
    } else if (arg.startsWith('--role=')) {
      options.role = arg.slice('--role='.length);
    } else if (arg === '--role' && argv[i + 1]) {
      options.role = argv[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-firestore') {
      options.skipFirestore = true;
    } else if (arg.startsWith('--authority=')) {
      const authority = arg.slice('--authority='.length).toLowerCase();
      options.authority = authority as ProvisionAdminOptions['authority'];
    } else if (arg === '--authority' && argv[i + 1]) {
      const authority = argv[++i].toLowerCase();
      options.authority = authority as ProvisionAdminOptions['authority'];
    }
  }

  return options;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<{ exitCode: number; result?: ProvisionAdminResult }> {
  const opts = parseCliArgs(argv);
  try {
    const result = await provisionAdmin(opts);
    if (result.success) {
      console.log(result.message);
      if (opts.authority !== 'firestore') console.log(JSON.stringify(result.user, null, 2));
      return { exitCode: 0, result };
    } else {
      console.error(result.message);
      if (opts.authority !== 'firestore') console.error(JSON.stringify(result.user, null, 2));
      return { exitCode: 1, result };
    }
  } catch (err: any) {
    if (opts.authority === 'firestore') {
      console.error('Error de aprovisionamiento: no se pudo validar o actualizar la autoridad Firestore.');
    } else {
      console.error('Error de aprovisionamiento:', err?.message || err);
    }
    return { exitCode: 1 };
  }
}

// Run CLI directly if executed from command line
if (
  process.argv[1] &&
  (process.argv[1].endsWith('provisionAdmin.ts') || process.argv[1].endsWith('provisionAdmin.js'))
) {
  runCli().then(({ exitCode }) => {
    process.exit(exitCode);
  });
}
