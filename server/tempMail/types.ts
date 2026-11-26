export type TempMailMessage = {
  subject: string;
  preview: string;
  body?: string;
  code?: string | null;
};

export type TempMailProviderConfig = {
  id: number;
  name: string;
  domain: string;
  url: string;
  adapterKey: string;
};

export type TempMailAdapter = {
  key: string;
  name: string;
  readAddress(): Promise<string>;
  copyAddress(): Promise<string>;
  regenerate(): Promise<string>;
  listMessages(): Promise<TempMailMessage[]>;
  openMessage(index: number): Promise<TempMailMessage>;
  waitForCode(timeoutMs: number, abort?: Promise<unknown>): Promise<{ code: string; message: TempMailMessage }>;
};
