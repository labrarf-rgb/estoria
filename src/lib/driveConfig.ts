/**
 * Google Drive settings (docs/PLAN-drive-sync.md, Step 0). All three Google
 * values are public by design: they identify the app, they grant nothing, and
 * the API key only works from Estoria's own origins for the Picker API. The
 * client secret is never here; it lives only in the sign-in broker's host.
 *
 * Emptying `clientId` removes the Drive option from the app entirely (the
 * plan's rollback without a broker change).
 */
export const DRIVE_CONFIG = {
  clientId: "177782323056-c0t0uclj35u6l73tf3n0q6pvb06dbfch.apps.googleusercontent.com",
  /** Picker only (restricted to Estoria's origins + the Picker API). */
  apiKey: "AIzaSyCdjbT3Zk9Q8liOFG109NJyhYk7ffslG0k",
  /** Google Cloud project number: the Picker's app ID. */
  appId: "177782323056",
  /**
   * The sign-in broker (auth-server/). Local dev talks to `npm run dev` in
   * auth-server/, because the broker's cookie is only sent to pages on the
   * same site as the broker.
   */
  brokerUrl:
    (import.meta.env.VITE_BROKER_URL as string | undefined) ??
    (import.meta.env.DEV ? "http://localhost:3000" : "https://auth.labrarf.com"),
  /** Name of the folder Estoria creates in the user's Drive. */
  folderName: "Estoria",
} as const;

export const DRIVE_SCOPES = "openid email https://www.googleapis.com/auth/drive.file";

export function driveConfigured(): boolean {
  return !!DRIVE_CONFIG.clientId;
}
