import { check, Update, DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'installing'
  | 'completed'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

/**
 * Returns current installed application version.
 * Falls back gracefully if running in a non-Tauri or unsupported environment.
 */
export async function getInstalledVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch (err) {
    console.warn('Unable to get app version from Tauri API:', err);
    return '0.1.0';
  }
}

/**
 * Checks for updates using Tauri v2 updater plugin.
 * Throws on failure so caller can distinguish between "up to date" and network/endpoint errors.
 */
export async function checkApplicationUpdate(): Promise<{
  update: Update | null;
  info: UpdateInfo | null;
}> {
  const update = await check();
  if (!update) {
    return { update: null, info: null };
  }

  const info: UpdateInfo = {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body,
    date: update.date,
  };

  return { update, info };
}

/**
 * Downloads the update package with progress tracking callbacks.
 */
export async function downloadUpdatePackage(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  let totalBytes = 0;
  let downloadedBytes = 0;

  await update.download((event: DownloadEvent) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength ?? 0;
        onProgress?.({
          downloadedBytes: 0,
          totalBytes,
          percent: 0,
        });
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        const percent =
          totalBytes > 0
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : 0;
        onProgress?.({
          downloadedBytes,
          totalBytes,
          percent,
        });
        break;
      case 'Finished':
        onProgress?.({
          downloadedBytes: totalBytes > 0 ? totalBytes : downloadedBytes,
          totalBytes: totalBytes > 0 ? totalBytes : downloadedBytes,
          percent: 100,
        });
        break;
    }
  });
}

/**
 * Installs the downloaded update package and restarts the app.
 * - On Windows: update.install({ restartAfterInstall: true }) runs the installer and exits the app.
 * - On macOS/Linux: install() unpacks the binary, followed by relaunch() to apply.
 */
export async function installUpdatePackage(update: Update): Promise<void> {
  await update.install({ restartAfterInstall: true });
  // Fallback for platforms where install() does not exit the current process automatically
  await restartApplication();
}

/**
 * Downloads and installs the update in a single streamlined pipeline.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  await downloadUpdatePackage(update, onProgress);
  await installUpdatePackage(update);
}

/**
 * Relaunches the application using @tauri-apps/plugin-process.
 */
export async function restartApplication(): Promise<void> {
  try {
    await relaunch();
  } catch (error) {
    console.error('Failed to relaunch application:', error);
    throw error;
  }
}
