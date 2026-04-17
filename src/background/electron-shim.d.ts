declare module "electron" {
  export type OpenDialogOptions = {
    title?: string;
    defaultPath?: string;
    properties?: Array<
      | "openFile"
      | "openDirectory"
      | "multiSelections"
      | "showHiddenFiles"
      | "createDirectory"
      | "promptToCreate"
    >;
  };

  export type OpenDialogReturnValue = {
    canceled: boolean;
    filePaths: string[];
  };

  export const dialog: {
    showOpenDialog(
      window: BrowserWindow | undefined,
      options: OpenDialogOptions,
    ): Promise<OpenDialogReturnValue>;
    showOpenDialog(
      options: OpenDialogOptions,
    ): Promise<OpenDialogReturnValue>;
  };

  export const shell: {
    showItemInFolder(fullPath: string): void;
    openPath(path: string): Promise<string>;
  };

  export class BrowserWindow {
    static getFocusedWindow(): BrowserWindow | null;
    static getAllWindows(): BrowserWindow[];
    isDestroyed(): boolean;
  }
}
