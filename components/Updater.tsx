'use client';

import { useEffect, useRef } from 'react';
import { check, type Update, DownloadEvent } from '@tauri-apps/plugin-updater';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ask, message } from '@tauri-apps/plugin-dialog';

interface UpdaterStatus {
  event: string;
  progress?: {
    percent: number;
    transferredBytes: number;
    totalBytes: number;
  };
  error?: string;
}

export default function Updater() {
  const currentUpdate = useRef<Update | null>(null);
  const updateAvailable = useRef(false);
  const downloadInProgress = useRef(false);
  let unlisten: UnlistenFn | null = null;

  useEffect(() => {
    // Listen for updater events via core event system
    listen('updater-status', (event) => {
      const payload = event.payload as UpdaterStatus;
      switch (payload.event) {
        case 'DownloadProgress':
          // Optional: Update a progress bar in your UI here
          console.log(`Download progress: ${payload.progress?.percent}%`);
          break;
        case 'Updated':
          // Restart app after install
          window.location.reload();
          break;
        case 'Error':
          console.error('Updater error:', payload.error);
          message('Update failed. Please try again later.', {
            kind: 'error'
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
  }, []);

  async function checkForUpdates() {
    try {
      const update = await check();
      if (!update || !update.available) {
        console.log('No updates available.');
        return;
      }
      currentUpdate.current = update;
      updateAvailable.current = true;
      // Note: 'Updaterexists' event may fire separately, but we can prompt here too
      handleUpdateAvailable();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  async function handleUpdateAvailable() {
    if (!updateAvailable.current || !currentUpdate.current) return;
    try {
      const shouldUpdate = await ask(
        'A new version is available. Install now? (App will restart after update.)',
        {
          title: 'Update available!',
          kind: 'info'
        }
      );
      if (shouldUpdate && !downloadInProgress.current) {
        try {
          downloadInProgress.current = true;
          // Optional: Add a callback to show download progress
          await currentUpdate.current.downloadAndInstall();
        } catch (error) {
          console.error('Update installation failed:', error);
          message('Update download failed. Please retry.', {
            kind: 'error'
          });
          downloadInProgress.current = false;
        }
      }
    } catch (error) {
      console.error('Prompt failed:', error);
    }
  }

  // No visible UI; attach to app root if headless, or add your own progress UI here
  return null;
}
