import { GitInfo, ProtoInfo, Provider, SourceInfo } from './types'

const inputRegex =
  /^(?<repo>[\w.-]+\/[\w.-]+)(?<subdir>[^#]+)?(?<ref>#[\w./@-]+)?/;

function parseGitURI(input: string): GitInfo {
  const m = input.match(inputRegex)?.groups || {};
  return <GitInfo>{
    repo: m.repo,
    subdir: m.subdir || "/",
    ref: m.ref ? m.ref.slice(1) : "main",
  };
}

function parseSource(input: string): SourceInfo {
  let providerName = "github";

  const sourceProtoRe = /^([\w-.]+):/;
  let source: string = input;
  const sourceProvierMatch = input.match(sourceProtoRe);
  if (sourceProvierMatch) {
    providerName = sourceProvierMatch[1];
    source = input.slice(sourceProvierMatch[0].length);
    if (providerName === "http" || providerName === "https") {
      source = input;
    }
  }

  return <SourceInfo>{
    providerName,
    source,
  };
}

const github: Provider = (input) => {
  const parsed = parseGitURI(input);
  const githubApiUrl = "https://api.github.com";
  const githubUrl = "https://github.com";

  return {
    name: parsed.repo,
    formattedName: parsed.repo.replace("/", "-"),
    version: parsed.ref,
    subdir: parsed.subdir,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    url: `${githubUrl}/${parsed.repo}/tree/${parsed.ref}${parsed.subdir}`,
    tar: `${githubApiUrl}/repos/${parsed.repo}/tarball/${parsed.ref}`,
  };
};

export function getProtoInfo(input: string): ProtoInfo {
  const { providerName, source } = parseSource(input);
  const result = github(source)

  return <ProtoInfo>{
    provider: providerName,
    ...result
  }
}