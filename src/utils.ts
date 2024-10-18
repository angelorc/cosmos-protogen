import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, readdir, cp } from "node:fs/promises";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { $fetch, fetch } from "ofetch";
import { resolve } from "pathe";
import { extract } from "tar";
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
  return resolve(cwd(), '.cache', 'cosmos-protogen');
}

export function createArchiveURL(org: string, repo: string, version: string, mode: "heads" | "tags" = "tags") {
  return `https://github.com/${org}/${repo}/archive/refs/${mode}/${version}.tar.gz`;
}

async function downloadDescriptorProto(protoPath: string) {
  const url = "https://raw.githubusercontent.com/jas-chen/ts-proto/refs/heads/948-http-support/integration/google-api-http/google/protobuf/descriptor.proto";
  const dest = resolve(protoPath, "google/protobuf/descriptor.proto");

  if (!existsSync(dirname(dest))) {
    await mkdir(dirname(dest), { recursive: true });
  }
  await download(url, dest);
}

export async function downloadProtoDeps(org: string, repo: string, version: string) {
  if (!org || !repo || !version) {
    throw new Error(`Invalid input: ${org}/${repo}@${version}`);
  }

  const deps = {
    packages: [
      'cosmos:cosmos-sdk@v0.45.13', 'cosmos:ibc-go@v7.0.0', 'cosmos:cosmos-proto'
    ],
    files: {
      /// bitsong
      'cosmos/base/v1beta1/coin.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/cosmos/base/v1beta1/coin.proto',
      // 'cosmos/base/query/v1beta1/pagination.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/cosmos/base/query/v1beta1/pagination.proto',
      // 'tendermint/abci/types.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/abci/types.proto',
      'cosmos_proto/cosmos.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/cosmos_proto/cosmos.proto',
      // 'tendermint/crypto/keys.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/crypto/keys.proto',
      // 'tendermint/crypto/proof.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/crypto/proof.proto',
      // 'tendermint/types/params.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/types/params.proto',
      // 'tendermint/types/types.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/types/types.proto',
      // 'tendermint/types/validator.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/types/validator.proto',
      // 'tendermint/version/types.proto': 'https://raw.githubusercontent.com/bitsongofficial/go-bitsong/refs/heads/main/third_party/proto/tendermint/version/types.proto',
      /// common
      'gogoproto/gogo.proto': 'https://raw.githubusercontent.com/cosmos/gogoproto/main/gogoproto/gogo.proto',
      'google/api/annotations.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto',
      'google/api/http.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto',
      /// osmosis
      'cosmos/ics23/v1/proofs.proto': 'https://raw.githubusercontent.com/cosmos/ics23/master/proto/cosmos/ics23/v1/proofs.proto',
      'google/protobuf/descriptor.proto': 'https://raw.githubusercontent.com/jas-chen/ts-proto/refs/heads/948-http-support/integration/google-api-http/google/protobuf/descriptor.proto',
    }
  }

  consola.info(`Downloading proto dependencies...`);
  for (const pkg of deps.packages) {
    let { org: pkgOrg, repo: pkgRepo, version: pkgVersion } = parsePackage(pkg);
    if (!pkgOrg || !pkgRepo) {
      consola.error(`Invalid package: ${pkg}`);
      continue;
    }

    if (!pkgVersion) {
      consola.debug(`Fetching latest version for ${pkgOrg}/${pkgRepo}...`);
      pkgVersion = await fetchLatestVersion(pkgOrg, pkgRepo)
    }

    consola.debug(`Downloading ${pkgOrg}/${pkgRepo}@${pkgVersion} proto files...`);
    await downloadProto(pkgOrg, pkgRepo, pkgVersion);

    consola.debug(`Skipping ${pkgOrg}/${pkgRepo}@${pkgVersion} proto files, already downloaded`);
  }

  for (const [file, url] of Object.entries(deps.files)) {
    consola.debug(`Downloading ${file}...`);

    const dest = resolve(cacheDir(), org, repo, version, 'proto', file);
    if (!existsSync(dirname(dest))) {
      consola.debug(`Creating directory for ${dest}`);
      await mkdir(dirname(dest), { recursive: true });
    }

    if (existsSync(dest)) {
      consola.debug(`Skipping ${file}, already downloaded`);
      continue;
    }

    await download(url, dest);
  }
}

export async function downloadProto(org: string, repo: string, version: string) {
  const tmpDir = cacheDir();
  const tarPath = resolve(tmpDir, `${org}-${repo}-${version}.tar.gz`);
  const extractPath = resolve(tmpDir, `${org}/${repo}/${version}`);

  if (existsSync(extractPath)) {
    consola.debug(`Skipping ${org}/${repo}@${version} proto files, already downloaded`);
    return;
  }

  await mkdir(dirname(tarPath), { recursive: true });

  const archiveUrl = createArchiveURL(org, repo, version, version.startsWith("v") ? "tags" : "heads");
  await download(archiveUrl, tarPath);

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
  consola.debug(`Extracted to ${extractPath}`);

  // const entryToRemove = (await readdir(extractPath)).filter(entry => entry !== "proto" && entry !== "third_party");
  const entryToRemove = (await readdir(extractPath)).filter(entry => entry !== "proto");
  for (const entry of entryToRemove) {
    await rm(resolve(extractPath, entry), { recursive: true, force: true });
  }
  consola.debug(`Removed unnecessary files`);

  // const protoPath = resolve(extractPath, "proto");
  // const thirdPartyPath = resolve(extractPath, "third_party");
  // const thirdPartyProtoPath = resolve(thirdPartyPath, "proto");

  // if (existsSync(thirdPartyProtoPath)) {
  //   consola.debug(`merging third_party/proto to proto`);

  //   await cp(thirdPartyProtoPath, protoPath, { recursive: true });
  //   await rm(thirdPartyPath, { recursive: true, force: true });
  // }

  // const googleDescriptorProtoPath = resolve(protoPath, "google/protobuf/descriptor.proto");
  // if (!existsSync(googleDescriptorProtoPath)) {
  //   await downloadDescriptorProto(protoPath);
  // }
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

export function parsePackage(input: string): { org: string, repo: string, version: string } {
  const [org, repoVersion] = input.split(":");

  let [repo, version] = repoVersion.split("@");
  return { org, repo, version }
}

async function fetchLatestVersion(org: string, repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${org}/${repo}/releases`;

  const response = await $fetch<{ tag_name: string }[]>(url)
  for (const release of response) {
    if (release.tag_name.startsWith("v")) {
      return release.tag_name;
    }
  }

  throw new Error(`Failed to fetch latest version for ${org}/${repo}`);
}