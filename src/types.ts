export interface ProtoDeps {
  packages?: string[];
  files?: Record<string, string>;
}

export interface GitInfo {
  provider: "github" | "gitlab" | "bitbucket" | "sourcehut";
  repo: string;
  subdir: string;
  ref: string;
}

export interface SourceInfo {
  providerName: string;
  source: string;
}

export interface ProtoInfo {
  name: string;
  formattedName: string;
  tar: string;
  version?: string;
  subdir: string;
  url?: string;
  headers?: Record<string, string | undefined>;

  cacheDir?: string;

  [key: string]: any;
}

export type Provider = (input: string) => ProtoInfo | Promise<ProtoInfo> | null;