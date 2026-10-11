import { DRIVE_CONFIG } from "@/lib/driveConfig";
import { driveAuth } from "@/lib/driveAuth";
import { FOLDER_MIME } from "@/lib/drive";
import { DriveOfflineError } from "@/lib/driveErrors";

/**
 * Google's Picker: how files Estoria didn't create become visible to it
 * (docs/PLAN-drive-sync.md, H17). With the `drive.file` permission Estoria
 * sees only its own files and the ones the person hands it here, so a laptop
 * moving from the Drive desktop app picks its existing Estoria folder and
 * project files once. Google's script loads only when the Picker is opened.
 */

interface PickedDoc {
  id: string;
  name: string;
}

/* Just the corner of Google's Picker API used here. */
interface PickerView {
  setIncludeFolders(v: boolean): PickerView;
  setSelectFolderEnabled(v: boolean): PickerView;
  setMimeTypes(types: string): PickerView;
  setParent(id: string): PickerView;
}
interface PickerBuilder {
  addView(v: PickerView): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  enableFeature(f: string): PickerBuilder;
  setCallback(fn: (data: { action: string; docs?: PickedDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface PickerNamespace {
  DocsView: new (viewId?: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { DOCS: string; FOLDERS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}
type PickerWindow = Window & {
  gapi?: { load(name: string, opts: { callback: () => void; onerror: () => void }): void };
  google?: { picker?: PickerNamespace };
};

let loading: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  const w = window as PickerWindow;
  loading ??= new Promise((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(new DriveOfflineError("Couldn't load Google's file picker. Check your connection and try again."));
    };
    const ready = () => (w.google?.picker ? resolve(w.google.picker) : fail());
    if (w.gapi) return w.gapi.load("picker", { callback: ready, onerror: fail });
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => w.gapi!.load("picker", { callback: ready, onerror: fail });
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Let the person choose in Google Drive. Resolves with what they picked
 * (empty if they cancelled). `folder`: one folder. `files`: project files,
 * optionally inside one folder, one or several.
 */
export async function pickFromDrive(
  kind: "folder" | "files",
  opts: { parentId?: string; multiple?: boolean; title?: string } = {}
): Promise<PickedDoc[]> {
  const picker = await loadPicker();
  const token = await driveAuth.getAccessToken();
  return new Promise((resolve) => {
    const view =
      kind === "folder"
        ? new picker.DocsView(picker.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes(FOLDER_MIME)
        : new picker.DocsView(picker.ViewId.DOCS).setMimeTypes("application/json");
    if (kind === "files" && opts.parentId) view.setParent(opts.parentId);
    const builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(DRIVE_CONFIG.apiKey)
      .setAppId(DRIVE_CONFIG.appId)
      .setTitle(opts.title ?? (kind === "folder" ? "Choose your Estoria folder" : "Choose project files"))
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name })));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (opts.multiple) builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    builder.build().setVisible(true);
  });
}
