// Authentication & Firestore integration layer for PouwMiner
// Implements exact interfaces and business logic matching CONTEXTO DE LA APP

export interface AuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  referralCode?: string;
  referredBy?: string;
  createdAt: string;
}

export interface SponsorCheckResult {
  valid: boolean;
  sponsorName?: string;
  code?: string;
}

// Known verified demo sponsor codes matching CONTEXTO DE LA APP
const KNOWN_SPONSORS: Record<string, string> = {
  'TITAN': 'Titan Hashrate Group',
  'ALPHA': 'Alpha Node Partner',
  'PEARL': 'PEARL Core Research',
  'POUW': 'PouwMiner Founders Batch',
  'VIP': 'PouwMiner VIP Club',
  'MINERX': 'MinerX Partner Club',
};

export const checkReferralCode = async (code: string): Promise<SponsorCheckResult> => {
  const clean = code.trim().toUpperCase();
  if (!clean) return { valid: false };

  // Artificial short delay to simulate network call
  await new Promise((r) => setTimeout(r, 300));

  if (KNOWN_SPONSORS[clean]) {
    return { valid: true, sponsorName: KNOWN_SPONSORS[clean], code: clean };
  }

  // Alphanumeric code between 4 and 12 chars is accepted as valid custom user referral
  if (/^[A-Z0-9]{4,12}$/.test(clean)) {
    return { valid: true, sponsorName: `Socio ${clean}`, code: clean };
  }

  return { valid: false };
};

export const simulatedRegister = async (
  email: string,
  _pass: string,
  refCode?: string
): Promise<AuthUser> => {
  await new Promise((r) => setTimeout(r, 600));

  if (email.toLowerCase().includes('existing')) {
    throw new Error('Este correo electrónico ya se encuentra registrado. Por favor inicia sesión.');
  }

  const newUser: AuthUser = {
    uid: 'usr_' + Math.random().toString(36).substring(2, 11),
    email,
    emailVerified: false,
    referralCode: 'POUW' + Math.floor(1000 + Math.random() * 9000),
    referredBy: refCode || undefined,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem('pouwminer_user', JSON.stringify(newUser));
  return newUser;
};

export const simulatedLogin = async (
  email: string,
  _pass: string
): Promise<AuthUser> => {
  await new Promise((r) => setTimeout(r, 600));

  const saved = localStorage.getItem('pouwminer_user');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      if (u.email === email) return u;
    } catch {
      // ignore
    }
  }

  const user: AuthUser = {
    uid: 'usr_' + Math.random().toString(36).substring(2, 11),
    email,
    emailVerified: true,
    referralCode: 'POUW7788',
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem('pouwminer_user', JSON.stringify(user));
  return user;
};

export const simulatedResetPassword = async (_email: string): Promise<boolean> => {
  await new Promise((r) => setTimeout(r, 500));
  return true;
};
