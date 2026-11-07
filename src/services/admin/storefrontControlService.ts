import {
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from '../../utils/firebaseAuth';

export interface StorefrontSectionsConfig {
  showPresale: boolean;
  showLaunch: boolean;
  showMonthly: boolean;
  showCustom: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_STOREFRONT_SECTIONS: StorefrontSectionsConfig = {
  showPresale: true,
  showLaunch: true,
  showMonthly: true,
  showCustom: true
};

const STORAGE_KEY = 'minerx_admin_storefront_sections_v1';

export class StorefrontControlService {
  private static instance: StorefrontControlService;
  private currentConfig: StorefrontSectionsConfig = { ...DEFAULT_STOREFRONT_SECTIONS };

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): StorefrontControlService {
    if (!StorefrontControlService.instance) {
      StorefrontControlService.instance = new StorefrontControlService();
    }
    return StorefrontControlService.instance;
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.currentConfig = { ...DEFAULT_STOREFRONT_SECTIONS, ...JSON.parse(raw) };
      }
    } catch {
      this.currentConfig = { ...DEFAULT_STOREFRONT_SECTIONS };
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentConfig));
    } catch {
      // ignore
    }
  }

  public getConfig(): StorefrontSectionsConfig {
    return { ...this.currentConfig };
  }

  /**
   * Fetch current config from Cloud Firestore /admin_settings/storefront_sections
   */
  public async fetchFirestoreConfig(): Promise<StorefrontSectionsConfig> {
    if (db) {
      try {
        const snap = await getDoc(doc(db, 'admin_settings', 'storefront_sections'));
        if (snap.exists()) {
          const data = snap.data();
          this.currentConfig = {
            showPresale: data.showPresale !== false,
            showLaunch: data.showLaunch !== false,
            showMonthly: data.showMonthly !== false,
            showCustom: data.showCustom !== false,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          };
          this.saveToStorage();
          return this.getConfig();
        }
      } catch (err) {
        console.warn('[StorefrontControlService] Firestore read notice:', err);
      }
    }
    return this.getConfig();
  }

  /**
   * Update one section toggle and persist to Cloud Firestore & local storage
   */
  public async updateSectionToggle(
    section: keyof Omit<StorefrontSectionsConfig, 'updatedAt' | 'updatedBy'>,
    value: boolean,
    updatedBy = 'Admin'
  ): Promise<StorefrontSectionsConfig> {
    this.currentConfig[section] = value;
    this.currentConfig.updatedAt = new Date().toISOString();
    this.currentConfig.updatedBy = updatedBy;
    this.saveToStorage();

    if (db) {
      try {
        await setDoc(doc(db, 'admin_settings', 'storefront_sections'), {
          ...this.currentConfig,
          updatedAt: new Date().toISOString(),
          updatedBy
        }, { merge: true });
      } catch (err) {
        console.warn('[StorefrontControlService] Firestore setDoc error:', err);
      }
    }

    // Optional local REST backend sync
    try {
      await fetch('http://127.0.0.1:3001/api/admin/storefront-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.currentConfig),
        signal: AbortSignal.timeout(1000)
      });
    } catch {
      // offline fallback
    }

    return this.getConfig();
  }

  /**
   * Real-time subscription to /admin_settings/storefront_sections
   */
  public subscribeToFirestoreConfig(
    callback: (config: StorefrontSectionsConfig) => void
  ): () => void {
    if (!db) {
      callback(this.getConfig());
      return () => {};
    }
    try {
      return onSnapshot(
        doc(db, 'admin_settings', 'storefront_sections'),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            this.currentConfig = {
              showPresale: data.showPresale !== false,
              showLaunch: data.showLaunch !== false,
              showMonthly: data.showMonthly !== false,
              showCustom: data.showCustom !== false,
              updatedAt: data.updatedAt,
              updatedBy: data.updatedBy
            };
            this.saveToStorage();
            callback(this.getConfig());
          } else {
            callback(this.getConfig());
          }
        },
        () => {
          callback(this.getConfig());
        }
      );
    } catch {
      callback(this.getConfig());
      return () => {};
    }
  }
}
