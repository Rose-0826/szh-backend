export {};

declare global {
  interface Window {
    /** Present only inside the Electron client (see electron/preload.ts). */
    szhDesktop?: {
      isDesktop: true;
      platform: string;
      harnessUrl: string;
      toggleMaximize: () => Promise<void>;
      onWindowState: (cb: (s: { maximized: boolean; focused: boolean }) => void) => () => void;
    };
  }
}
