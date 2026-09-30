// Type declarations for mammoth's prebuilt browser bundle (mammoth/mammoth.browser.js),
// which ships without its own .d.ts file.
declare module "mammoth/mammoth.browser.js" {
  interface MammothRawTextResult {
    value: string;
    messages: unknown[];
  }

  interface MammothBrowserModule {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothRawTextResult>;
  }

  const mammoth: MammothBrowserModule;
  export default mammoth;
}
