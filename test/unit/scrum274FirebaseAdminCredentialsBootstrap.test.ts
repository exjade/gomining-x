import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADMIN_APP_NAME,
  FirebaseAdminAuthAdapter,
  type FirebaseAdminAuthAdapterDependencies,
  type FirebaseAdminAuthDiagnostic,
} from '../../server/services/firebaseAdminAuthAdapter.js';

const projectId = 'fixture-project';
const serviceAccount = {
  project_id: projectId,
  client_email: 'fixture@fixture-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n',
};
const validServiceAccountBase64 = Buffer.from(JSON.stringify(serviceAccount)).toString('base64');

function createFixture(options: {
  environment?: Record<string, string>;
  existingApps?: Array<{ name: string }>;
  applicationDefault?: unknown;
  applicationDefaultError?: Error;
} = {}) {
  const environment = new Map(Object.entries(options.environment || {}));
  const apps = options.existingApps || [];
  const diagnostics: FirebaseAdminAuthDiagnostic[] = [];
  const initializedOptions: unknown[] = [];
  const certifiedAccounts: unknown[] = [];
  let applicationDefaultCalls = 0;
  let certCalls = 0;
  let initializeCalls = 0;

  const auth = { verifyIdToken: async () => null };
  const dependencies: Partial<FirebaseAdminAuthAdapterDependencies> = {
    getEnv: (name) => environment.get(name),
    getApps: (() => apps as any) as FirebaseAdminAuthAdapterDependencies['getApps'],
    initializeApp: ((options: unknown, name: string) => {
      initializeCalls += 1;
      initializedOptions.push(options);
      const app = { name };
      apps.push(app);
      return app as any;
    }) as FirebaseAdminAuthAdapterDependencies['initializeApp'],
    applicationDefault: (() => {
      applicationDefaultCalls += 1;
      if (options.applicationDefaultError) throw options.applicationDefaultError;
      return options.applicationDefault || { kind: 'adc-credential' };
    }) as FirebaseAdminAuthAdapterDependencies['applicationDefault'],
    cert: ((account: unknown) => {
      certCalls += 1;
      certifiedAccounts.push(account);
      return { kind: 'cert-credential' } as any;
    }) as FirebaseAdminAuthAdapterDependencies['cert'],
    getAuth: (() => auth as any) as FirebaseAdminAuthAdapterDependencies['getAuth'],
    warn: (diagnostic) => diagnostics.push(diagnostic),
  };

  return {
    adapter: new FirebaseAdminAuthAdapter({ projectId, dependencies }),
    diagnostics,
    initializedOptions,
    certifiedAccounts,
    get applicationDefaultCalls() {
      return applicationDefaultCalls;
    },
    get certCalls() {
      return certCalls;
    },
    get initializeCalls() {
      return initializeCalls;
    },
  };
}

describe('SCRUM-274 Firebase Admin credential bootstrap', () => {
  it('uses projectId-only initialization for emulators without production credentials', () => {
    const fixture = createFixture({
      environment: {
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        FIREBASE_SERVICE_ACCOUNT_BASE64: 'malformed-secret',
        GOOGLE_APPLICATION_CREDENTIALS: '/local/credentials.json',
      },
      applicationDefault: { kind: 'adc-credential' },
    });

    assert.equal(fixture.adapter.isInitialized(), true);
    assert.deepEqual(fixture.initializedOptions, [{ projectId }]);
    assert.equal(fixture.applicationDefaultCalls, 0);
    assert.equal(fixture.certCalls, 0);
  });

  it('uses Application Default Credentials without GOOGLE_APPLICATION_CREDENTIALS', () => {
    const credential = { kind: 'managed-adc' };
    const fixture = createFixture({
      environment: { GOOGLE_CLOUD_PROJECT: projectId },
      applicationDefault: credential,
    });

    assert.equal(fixture.adapter.isInitialized(), true);
    assert.deepEqual(fixture.initializedOptions, [{ projectId, credential }]);
    assert.equal(fixture.applicationDefaultCalls, 1);
    assert.equal(fixture.certCalls, 0);
  });

  it('uses a valid base64 service account through an in-memory cert credential', () => {
    const fixture = createFixture({
      environment: { FIREBASE_SERVICE_ACCOUNT_BASE64: validServiceAccountBase64 },
      applicationDefault: { kind: 'must-not-be-used' },
    });

    assert.equal(fixture.adapter.isInitialized(), true);
    assert.deepEqual(fixture.certifiedAccounts, [
      {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      },
    ]);
    assert.deepEqual(fixture.initializedOptions, [
      { projectId, credential: { kind: 'cert-credential' } },
    ]);
    assert.equal(fixture.applicationDefaultCalls, 0);
    assert.equal(fixture.certCalls, 1);
  });

  it('fails closed on malformed base64 without falling back to ADC or leaking the secret', () => {
    const secret = 'not-a-valid-base64-secret';
    const fixture = createFixture({
      environment: { FIREBASE_SERVICE_ACCOUNT_BASE64: secret },
      applicationDefault: { kind: 'must-not-be-used' },
    });

    assert.equal(fixture.adapter.isInitialized(), false);
    assert.equal(fixture.initializeCalls, 0);
    assert.equal(fixture.applicationDefaultCalls, 0);
    assert.equal(fixture.certCalls, 0);
    assert.equal(JSON.stringify(fixture.diagnostics).includes(secret), false);
    assert.equal(JSON.stringify(fixture.diagnostics).includes('private_key'), false);
  });

  it('fails closed on valid base64 containing invalid service-account JSON', () => {
    const secret = Buffer.from(JSON.stringify({ project_id: projectId })).toString('base64');
    const fixture = createFixture({
      environment: { FIREBASE_SERVICE_ACCOUNT_BASE64: secret },
      applicationDefault: { kind: 'must-not-be-used' },
    });

    assert.equal(fixture.adapter.isInitialized(), false);
    assert.equal(fixture.initializeCalls, 0);
    assert.equal(fixture.applicationDefaultCalls, 0);
    assert.equal(fixture.certCalls, 0);
    assert.equal(JSON.stringify(fixture.diagnostics).includes(secret), false);
  });

  it('keeps explicit GOOGLE_APPLICATION_CREDENTIALS compatible through ADC', () => {
    const credential = { kind: 'explicit-local-adc' };
    const fixture = createFixture({
      environment: { GOOGLE_APPLICATION_CREDENTIALS: '/local/credentials.json' },
      applicationDefault: credential,
    });

    assert.equal(fixture.adapter.isInitialized(), true);
    assert.deepEqual(fixture.initializedOptions, [{ projectId, credential }]);
    assert.equal(fixture.applicationDefaultCalls, 1);
    assert.equal(JSON.stringify(fixture.diagnostics).includes('/local/credentials.json'), false);
  });

  it('reuses the named Firebase app without initializing a duplicate', () => {
    const existingApp = { name: ADMIN_APP_NAME };
    const fixture = createFixture({ existingApps: [existingApp] });

    assert.equal(fixture.adapter.isInitialized(), true);
    assert.equal(fixture.adapter.getApp(), existingApp);
    assert.equal(fixture.initializeCalls, 0);
    assert.equal(fixture.applicationDefaultCalls, 0);
    assert.equal(fixture.certCalls, 0);
  });

  it('fails closed when ADC itself is unavailable', () => {
    const fixture = createFixture({
      environment: { GOOGLE_CLOUD_PROJECT: projectId },
      applicationDefaultError: new Error('ADC unavailable'),
    });

    assert.equal(fixture.adapter.isInitialized(), false);
    assert.equal(fixture.initializeCalls, 0);
    assert.equal(fixture.diagnostics.length, 1);
    assert.equal(JSON.stringify(fixture.diagnostics).includes('ADC unavailable'), false);
  });
});
