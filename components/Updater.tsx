'use client'; // Ensure client-side for Tauri APIs

import { useEffect, useRef } from 'react';
import { check, type Update, DownloadEvent } from '@tauri-apps/plugin-updater'; // Import DownloadEvent for optional callback
import { listen, UnlistenFn } from '@tauri-apps/api/event'; // For updater events
import { ask, message } from '@tauri-apps/plugin-dialog'; // For prompts; ensure plugin installed

// Simple type for updater event payloads (based on docs)
interface UpdaterStatus {
  event: string; // e.g., 'Updaterexists', 'DownloadProgress', 'Updated', 'Error', 'DownloadCancel'
  progress?: {
    percent: number;
    transferredBytes: number;
    totalBytes: number;
  };
  error?: string;
}

export default function Updater() {
  const currentUpdate = useRef<Update | null>(null); // Ref to store update object
  const updateAvailable = useRef(false); // Ref for availability flag
  const downloadInProgress = useRef(false);
  let unlisten: UnlistenFn | null = null;

  useEffect(() => {
    // Listen for updater events via core event system
    listen<UpdaterStatus>('updater-status', (event) => {
      const payload = event.payload;
      switch (payload.event) {
        case 'DownloadProgress':
          // Optional: Update a progress bar in your UI (e.g., via state)
          console.log(`Download progress: ${payload.progress?.percent}%`);
          break;
        case 'Updated':
          // Restart app after install
          window.location.reload();
          break;
        case 'Error':
          console.error('Updater error:', payload.error);
          message('Update failed. Please try again later.', {
            kind: 'error', // Use 'kind' not 'type'
          });
          downloadInProgress.current = false;
          break;
        case 'Updaterexists':
          updateAvailable.current = true;
          handleUpdateAvailable();
          break;
        case 'DownloadCancel':
          downloadInProgress.current = false;
          break;
      }
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    }).catch((err) => {
      console.error('Failed to listen for updater events:', err);
    });

    // Check for updates on component mount (app load)
    checkForUpdates();

    // Cleanup event listener on unmount
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty deps: run once on mount

  async function checkForUpdates() {
    try {
      const update = await check();
      if (!update || !update.available) {
        console.log('No updates available.');
        return;
      }
      currentUpdate.current = update; // Store in ref
      updateAvailable.current = true;
      // Note: 'Updaterexists' event may fire separately, but we can prompt here too
      handleUpdateAvailable();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  async function handleUpdateAvailable() {
    if (!updateAvailable.current || !currentUpdate.current) return;

    // Prompt user (customize with your app's modal for better UX)
    try {
      const shouldUpdate = await ask(
        'A new version is available. Install now? (App will restart after update.)',
        { // Options as second arg only
          title: 'Update available!',
          kind: 'info'
        }
      );

      if (shouldUpdate && !downloadInProgress.current) {
        try {
          downloadInProgress.current = true;
          // Optional progress callback: downloadAndInstall((progress: DownloadEvent) => console.log(progress.percent))
          await currentUpdate.current.downloadAndInstall(); // No args; overwrite handled automatically
        } catch (error) {
          console.error('Update installation failed:', error);
          message('Update download failed. Please retry.', {
            kind: 'error', // Use 'kind' not 'type'
          });
          downloadInProgress.current = false;
        }
      }
    } catch (error) {
      console.error('Prompt failed:', error);
    }
  }

  return null; // Invisible component; add UI (e.g., progress bar) if needed
}
