import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_APP_NAME,
  FirebaseAdminAuthAdapter,
  type FirebaseAdminAuthAdapterDependencies,
  type FirebaseAdminAuthDiagnostic,
} from '../../server/services/firebaseAdminAuthAdapter.js';

describe('SCRUM-244: Firebase Admin Auth lazy recovery', () => {
  it('recovers through the real adapter path after import-time prerequisites become valid', async () => {
    const credentialPath = '/fixture/fake-admin-credentials';
    const validToken = 'fixture-valid-token';
    const expiredToken = 'fixture-expired-token';
    const environment = new Map<string, string>();
    const apps: Array<{ name: string }> = [];
    const diagnostics: FirebaseAdminAuthDiagnostic[] = [];
    const lookedUpUids: string[] = [];
    const lookedUpEmails: string[] = [];
    let initializeCalls = 0;

    const decoded = { uid: 'firebase-user-scrum244', email: 'user@example.test' };
    const auth = {
      verifyIdToken: async (token: string) => {
        if (token === validToken) return decoded;
        throw Object.assign(new Error('fixture token failure'), { code: 'auth/id-token-expired' });
      },
      getUser: async (uid: string) => {
        lookedUpUids.push(uid);
        return { uid, email: 'user@example.test' };
      },
      getUserByEmail: async (email: string) => {
        lookedUpEmails.push(email);
        return { uid: decoded.uid, email };
      },
    };

    const dependencies: Partial<FirebaseAdminAuthAdapterDependencies> = {
      getEnv: (name) => environment.get(name),
      getApps: (() => apps as any) as FirebaseAdminAuthAdapterDependencies['getApps'],
      initializeApp: ((_: unknown, name: string) => {
        initializeCalls += 1;
        const app = { name };
        apps.push(app);
        return app as any;
      }) as FirebaseAdminAuthAdapterDependencies['initializeApp'],
      applicationDefault: (() => {
        if (!environment.has('GOOGLE_APPLICATION_CREDENTIALS')) {
          throw new Error('fixture ADC unavailable');
        }
        return {} as any;
      }) as FirebaseAdminAuthAdapterDependencies['applicationDefault'],
      getAuth: (() => auth as any) as FirebaseAdminAuthAdapterDependencies['getAuth'],
      warn: (diagnostic) => diagnostics.push(diagnostic),
    };

    const adapter = new FirebaseAdminAuthAdapter({ projectId: 'fixture-project', dependencies });

    assert.equal(adapter.isInitialized(), false);
    assert.equal(await adapter.getUser('before-recovery'), null);
    assert.equal(diagnostics.filter(({ category }) => category === 'initialization_unavailable').length, 1);

    environment.set('GOOGLE_APPLICATION_CREDENTIALS', credentialPath);

    assert.deepEqual(await adapter.verifyIdToken(validToken), decoded);
    assert.equal(adapter.isInitialized(), true);
    assert.equal(initializeCalls, 1);
    assert.deepEqual(await adapter.getUser(decoded.uid), {
      uid: decoded.uid,
      email: decoded.email,
    });
    assert.deepEqual(await adapter.getUserByEmail(decoded.email), {
      uid: decoded.uid,
      email: decoded.email,
    });
    assert.deepEqual(lookedUpUids, [decoded.uid]);
    assert.deepEqual(lookedUpEmails, [decoded.email]);

    assert.equal(await adapter.verifyIdToken(expiredToken), null);
    assert.equal(initializeCalls, 1);
    assert.ok(diagnostics.some(({ category }) => category === 'initialization_recovered'));
    assert.ok(
      diagnostics.some(
        ({ category, code }) => category === 'token_verification_failure' && code === 'auth/id-token-expired'
      )
    );
    const diagnosticText = JSON.stringify(diagnostics);
    assert.equal(diagnosticText.includes(credentialPath), false);
    assert.equal(diagnosticText.includes(validToken), false);
    assert.equal(diagnosticText.includes(expiredToken), false);

    const adapterUsingExistingApp = new FirebaseAdminAuthAdapter({ dependencies });
    assert.equal(adapterUsingExistingApp.isInitialized(), true);
    assert.equal(initializeCalls, 1, 'named Firebase App must be reused');
    assert.equal(apps[0].name, ADMIN_APP_NAME);

    const explicitlyDisabled = new FirebaseAdminAuthAdapter({ auth: null, dependencies });
    assert.equal(await explicitlyDisabled.verifyIdToken(validToken), null);
    assert.equal(initializeCalls, 1, 'explicit null override must not discover credentials');
  });
});
