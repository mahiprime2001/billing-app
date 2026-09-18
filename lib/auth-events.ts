// Small, dedicated login-success signal -- keeps app/page.tsx (the login
// screen) decoupled from sync internals (lib/initial-sync.ts). AppProviders
// listens for this to kick off the initial data pull; it's a plain window
// event rather than a shared store since this only ever needs one listener.
export const LOGIN_SUCCESS_EVENT = "siri:login-success";

export function announceLoginSuccess(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOGIN_SUCCESS_EVENT));
}
