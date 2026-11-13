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
  const dryRun = Boolean(options.dryRun);
  const skipFirestore = Boolean(options.skipFirestore);
  const authAdapter = options.authAdapter || firebaseAdminAuthAdapter;

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
      isPublishedToFirestore: !skipFirestore,
    };
    db.users.push(provisionedUser);
  }

  let firestoreProjected = false;

  if (!dryRun) {
    // Write allowlist to users.json
    writeUsers(db);

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
        }
      } catch (fsErr: any) {
        console.warn('[provisionAdmin] Advertencia al proyectar en Firestore:', fsErr?.message || fsErr);
      }
    }
  }

  const message = dryRun
    ? `[DRY-RUN] Usuario Firebase validado. Simulado aprovisionamiento como ${role}: UID=${realUid}, Email=${realEmail}`
    : `Administrador aprovisionado exitosamente: UID=${realUid}, Email=${realEmail}, Rol=${role}${firestoreProjected ? ' (proyectado en /admin_users)' : ''}`;

  return {
    success: true,
    dryRun,
    message,
    user: provisionedUser,
    firestoreProjected,
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
    }
  }

  return options;
}

// Run CLI directly if executed from command line
if (
  process.argv[1] &&
  (process.argv[1].endsWith('provisionAdmin.ts') || process.argv[1].endsWith('provisionAdmin.js'))
) {
  const opts = parseCliArgs();
  provisionAdmin(opts)
    .then((result) => {
      console.log(result.message);
      console.log(JSON.stringify(result.user, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error de aprovisionamiento:', err?.message || err);
      process.exit(1);
    });
}
