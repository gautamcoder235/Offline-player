import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  UpdateStatus,
  UpdateInfo,
  DownloadProgress,
  getInstalledVersion,
  checkApplicationUpdate,
  downloadUpdatePackage,
  installUpdatePackage,
  restartApplication,
} from '../services/updateService';

interface UpdateContextType {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  currentVersion: string;
  progress: DownloadProgress;
  error: string | null;
  checkForUpdates: (silent?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  dismissUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

const INITIAL_PROGRESS: DownloadProgress = {
  downloadedBytes: 0,
  totalBytes: 0,
  percent: 0,
};

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.0');
  const [progress, setProgress] = useState<DownloadProgress>(INITIAL_PROGRESS);
  const [error, setError] = useState<string | null>(null);

  // Active Tauri Update instance for downloading/installing
  const activeUpdateRef = useRef<Update | null>(null);
  const statusRef = useRef<UpdateStatus>('idle');
  statusRef.current = status;
  const lastManualCheckRef = useRef<number>(0);

  // Initialize version on mount
  useEffect(() => {
    getInstalledVersion().then((v) => {
      if (v) setCurrentVersion(v);
    });
  }, []);

  // Deferred background update check (3 seconds after startup)
  useEffect(() => {
    const timer = setTimeout(() => {
      void checkForUpdates(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const checkForUpdates = useCallback(async (silent = false) => {
    // If an update is actively downloading or installing, ignore new checks
    if (statusRef.current === 'downloading' || statusRef.current === 'installing') {
      return;
    }

    // Debounce manual user clicks by 3 seconds (silent background check does not throttle manual clicks)
    const now = Date.now();
    if (!silent) {
      if (now - lastManualCheckRef.current < 3000) {
        return;
      }
      lastManualCheckRef.current = now;
    }

    // Clean up previous uninstalled update reference if any
    if (activeUpdateRef.current && statusRef.current !== 'completed') {
      try {
        await activeUpdateRef.current.close();
      } catch {
        // ignore close error
      }
      activeUpdateRef.current = null;
    }

    setStatus('checking');
    setError(null);
    setProgress(INITIAL_PROGRESS);

    try {
      const { update, info } = await checkApplicationUpdate();

      if (update && info) {
        activeUpdateRef.current = update;
        setUpdateInfo(info);
        setStatus('update-available');
      } else {
        setUpdateInfo(null);
        setStatus('up-to-date');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Failed to check for updates. Please verify your internet connection.';

      if (!silent) {
        console.error('Update check failed:', err);
        setError(message);
        setStatus('error');
      } else {
        // Silent background check failed (e.g. offline, 404, or no release published yet).
        // Return gracefully to idle; do NOT claim 'up-to-date'.
        console.info('Background update check silently ignored error:', err);
        setStatus('idle');
      }
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = activeUpdateRef.current;
    if (!update) {
      setError('No pending update artifact available to download.');
      setStatus('error');
      return;
    }

    setStatus('downloading');
    setError(null);
    setProgress(INITIAL_PROGRESS);

    try {
      // 1. Download with progress callbacks
      await downloadUpdatePackage(update, (p) => {
        setProgress(p);
      });

      // 2. Package downloaded and signature verified; ready for user to restart
      setStatus('completed');
    } catch (err: unknown) {
      console.error('Update download failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Failed to download the update package. Please verify your connection and retry.';
      setError(message);
      setStatus('error');
    }
  }, []);

  const restartApp = useCallback(async () => {
    const update = activeUpdateRef.current;
    setStatus('installing');
    setError(null);

    try {
      if (update) {
        await installUpdatePackage(update);
      } else {
        await restartApplication();
      }
    } catch (err: unknown) {
      console.error('Failed to install update or restart:', err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Could not restart application automatically. Please restart manually.';
      setError(message);
      setStatus('error');
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    if (activeUpdateRef.current) {
      try {
        void activeUpdateRef.current.close();
      } catch {
        // ignore
      }
      activeUpdateRef.current = null;
    }
    setUpdateInfo(null);
    setStatus('idle');
    setError(null);
    setProgress(INITIAL_PROGRESS);
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        status,
        updateInfo,
        currentVersion,
        progress,
        error,
        checkForUpdates,
        downloadAndInstall,
        restartApp,
        dismissUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdate = (): UpdateContextType => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
};
