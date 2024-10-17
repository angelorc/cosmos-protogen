import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, readdir, cp } from "node:fs/promises";
import { homedir } from "node:os";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { fetch } from "ofetch";
import { resolve } from "pathe";
import { extract } from "tar";
import { consola } from "consola";

export async function download(url: string, dest: string) {
  console.log(`Downloading ${url}`)

  const response = await fetch(url);
  if (response.status >= 400) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  console.log(`Saving to ${dest}`);
  const stream = createWriteStream(dest);
  await promisify(pipeline)(response.body as any, stream);

  if (!existsSync(dest)) {
    throw new Error(`Failed to save, file not found: ${dest}`);
  }
}

export function cacheDir() {
  return resolve(homedir(), '.cache/cosmos-protogen');
}

export function createArchiveURL(org: string, repo: string, version: string) {
  return `https://github.com/${org}/${repo}/archive/refs/tags/${version}.tar.gz`;
}

async function downloadDescriptorProto(protoPath: string) {
  const url = "https://raw.githubusercontent.com/jas-chen/ts-proto/refs/heads/948-http-support/integration/google-api-http/google/protobuf/descriptor.proto";
  const dest = resolve(protoPath, "google/protobuf/descriptor.proto");

  if (!existsSync(dirname(dest))) {
    await mkdir(dirname(dest), { recursive: true });
  }
  await download(url, dest);
}

export async function downloadProto(org: string, repo: string, version: string) {
  const tmpDir = cacheDir();
  const tarPath = resolve(tmpDir, `${org}-${repo}-${version}.tar.gz`);

  await mkdir(dirname(tarPath), { recursive: true });
  await download(createArchiveURL(org, repo, version), tarPath);

  const extractPath = resolve(tmpDir, `${org}/${repo}/${version}`);
  await rm(extractPath, { recursive: true, force: true });
  await mkdir(extractPath, { recursive: true });

  await extract({
    file: tarPath,
    cwd: extractPath,
    onentry(entry) {
      entry.path = entry.path.split("/").splice(1).join("/");
    }
  })

  await rm(tarPath, { force: true });
  consola.log(`Extracted to ${extractPath}`);

  const entryToRemove = (await readdir(extractPath)).filter(entry => entry !== "proto" && entry !== "third_party");
  for (const entry of entryToRemove) {
    await rm(resolve(extractPath, entry), { recursive: true, force: true });
  }
  consola.log(`Removed unnecessary files`);

  const protoPath = resolve(extractPath, "proto");
  const thirdPartyPath = resolve(extractPath, "third_party");
  const thirdPartyProtoPath = resolve(thirdPartyPath, "proto");

  if (existsSync(thirdPartyProtoPath)) {
    consola.log(`merging third_party/proto to proto`);

    await cp(thirdPartyProtoPath, protoPath, { recursive: true });
    await rm(thirdPartyPath, { recursive: true, force: true });
  }

  const googleDescriptorProtoPath = resolve(protoPath, "google/protobuf/descriptor.proto");
  if (!existsSync(googleDescriptorProtoPath)) {
    await downloadDescriptorProto(protoPath);
  }
}

export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export async function allProtoFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir, { withFileTypes: true });
  let result: string[] = [];

  for (const file of files) {
    if (file.isDirectory()) {
      result = [...result, ...await allProtoFiles(`${dir}/${file.name}`)];
    } else {
      if (file.name.endsWith('.proto'))
        result.push(`${dir}/${file.name}`);
    }
  }

  return result;
}