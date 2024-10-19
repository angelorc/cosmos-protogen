import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { $fetch, fetch } from "ofetch";
import { resolve } from "pathe";
import { consola } from "consola";
import { cwd } from "node:process";

export async function download(url: string, dest: string) {
  consola.debug(`Downloading ${url}`)

  const response = await fetch(url);
  if (response.status >= 400) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  consola.debug(`Saving archive to ${dest}`);
  const stream = createWriteStream(dest);
  await promisify(pipeline)(response.body as any, stream);

  if (!existsSync(dest)) {
    throw new Error(`Failed to save, file not found: ${dest}`);
  }
}

export function cacheDir() {
  return resolve(cwd(), '.cache');
}

// export function createArchiveURL(org: string, repo: string, version: string, mode: "heads" | "tags" = "tags") {
//   return `https://github.com/${org}/${repo}/archive/refs/${mode}/${version}.tar.gz`;
// }

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
