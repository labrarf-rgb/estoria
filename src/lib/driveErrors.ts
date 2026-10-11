/**
 * What can go wrong talking to Google Drive, as types the UI can tell apart
 * (docs/PLAN-drive-sync.md, H9: offline, paused and "needs reconnecting" are
 * different states, and only the last one needs a click).
 */

/** No network, or Google/the broker didn't answer. Retry later; never a reason to reconnect. */
export class DriveOfflineError extends Error {
  constructor(message = "Google Drive can't be reached right now. Estoria will retry.") {
    super(message);
    this.name = "DriveOfflineError";
  }
}

/** Sign-in is gone (never connected here, or revoked at Google). Needs a click on Connect/Reconnect. */
export class DriveReconnectError extends Error {
  constructor(readonly reason: "not-connected" | "revoked") {
    super(
      reason === "revoked"
        ? "Google Drive needs reconnecting. Press Reconnect."
        : "Google Drive isn't connected on this device."
    );
    this.name = "DriveReconnectError";
  }
}

/** Connecting didn't finish, for a reason the person can fix. */
export class DriveConnectError extends Error {
  constructor(readonly reason: "drive-scope-missing" | "no-refresh-token" | "cancelled" | "failed") {
    super(
      reason === "drive-scope-missing"
        ? "Estoria needs access to its own files in your Drive. Connect again and leave the Drive box ticked."
        : reason === "cancelled"
          ? "Connecting to Google Drive was cancelled."
          : "Couldn't connect to Google Drive. Try again."
    );
    this.name = "DriveConnectError";
  }
}

/** The kill switch is off (or the broker was unreachable at startup): no writes to Drive. */
export class DrivePausedError extends Error {
  constructor() {
    super("Drive backup is paused. Your work keeps saving in this browser.");
    this.name = "DrivePausedError";
  }
}

/** A Drive request failed for a reason retrying won't fix. */
export class DriveRequestError extends Error {
  constructor(
    readonly status: number,
    readonly reason?: string
  ) {
    super(`Google Drive refused the request (${status}${reason ? `, ${reason}` : ""}).`);
    this.name = "DriveRequestError";
  }
}

/** The project's linked file is trashed or no longer visible to Estoria. Never silently recreated. */
export class DriveFileMissingError extends Error {
  constructor() {
    super(
      "Estoria can't see this project's file in Google Drive anymore (it may be in the trash). Nothing was changed."
    );
    this.name = "DriveFileMissingError";
  }
}

/** The file moved on between reading it and writing it (H4): re-run the compare. */
export class DriveRevisionMovedError extends Error {
  constructor() {
    super("The Drive file changed while syncing. Nothing was overwritten. Press Sync again.");
    this.name = "DriveRevisionMovedError";
  }
}

/** Two files share the project's name in the Estoria folder (H2d): stop and let the person choose. */
export class DriveDuplicateError extends Error {
  constructor(
    readonly fileName: string,
    readonly fileIds: string[]
  ) {
    super(`There are ${fileIds.length} files named "${fileName}" in your Estoria folder. Choose which one is this project.`);
    this.name = "DriveDuplicateError";
  }
}
