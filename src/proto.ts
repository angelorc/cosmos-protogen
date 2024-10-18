import { spawnSync } from "node:child_process";
import { Dirent, existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { cwd } from "node:process";
import { dirname, resolve } from "pathe";
import * as protobuf from 'protobufjs';
import { code, Code, imp, joinCode } from "ts-poet";
import { cacheDir, createArchiveURL, download, fetchLatestVersion, parsePackage, toCamelCase } from "./utils";
import consola from "consola";
import { extract, t } from "tar";
import { ProtoDeps } from "./types";

// https://raw.githubusercontent.com/jas-chen/ts-proto/refs/heads/948-http-support/integration/google-api-http/google/protobuf/descriptor.proto
// put this file in playground/proto/google/protobuf/descriptor.proto

export function createProtoRoot(path: string): protobuf.Root {
  const root = new protobuf.Root();

  // fix path resolution
  // TODO: this is a hack, we should find a better way to resolve paths
  root.resolvePath = (_origin, target) => {
    const paths = ['bitsong', 'confio', 'cosmos', 'cosmos_proto', 'gogoproto', 'google', 'ibc', 'tendermint', 'osmosis', 'amino']
    if (paths.some((path) => target.startsWith(path))) {
      target = resolve(path, target);
    }
    return target;
  }

  return root;
}

async function traverseServices(current: any, fn: any) {
  //consola.log(`Traversing ${current.name}`);
  if (current instanceof protobuf.Service) {
    consola.debug(`- end traversing: ${current.name}`);
    return await fn(current);
  }

  if (current.nestedArray) {
    for (const nested of current.nestedArray) {
      consola.debug(`- traversing: ${nested.name}`);
      return await traverseServices(nested, fn);
    }
  }
}

export function generatedTypesDir() {
  return resolve(cwd(), 'generated', 'types');
}

function runProtoc(...args: string[]) {
  const child = spawnSync('/usr/bin/protoc', args, { shell: true });

  if (child.error) {
    throw child.error;
  }

  if (child.status !== 0) {
    throw new Error(`Failed to run protoc: ${child.status} - protoc ${args.join(' ')}`);
  }
}

export async function generateTypes(file: string, protoPath: string, generatedPath: string) {
  if (!existsSync(generatedPath)) {
    consola.log(`Creating directory ${generatedPath}`);

    await mkdir(generatedPath, { recursive: true });
  }

  // TODO: move to ./generated/bitsongofficial/go-bitsong/v0.17.0/

  runProtoc(
    `--plugin=./node_modules/.bin/protoc-gen-ts_proto`,
    `--ts_proto_out=${generatedPath}`,
    `--ts_proto_opt=onlyTypes=true`,
    `${file}`,
    `-I${protoPath}`
  );
}


// export async function generateQueryEndpoints(file: string, protoPath: string, generatedPath: string) {
//   consola.debug(`Loading file ${file}`);

//   try {
//     const root = createProtoRoot(protoPath)
//     const load = root.loadSync(file, { keepCase: true });

//     await traverseServices(load, async function (service: any) {
//       let prefix = service.fullName.startsWith('.') ? service.fullName.slice(1) : service.fullName;
//       const parts = prefix.split('.');
//       consola.log(parts)

//       if (parts.at(-1) === 'Query') {
//         parts.pop();
//         prefix = parts.join('.');
//       } else {
//         consola.debug(`skipping service ${service.fullName}, is not a Query service`);
//         return
//       }

//       // TODO: generate types at the end
//       consola.debug(`Generating types for ${file}`);
//       await generateTypes(file, protoPath, generatedPath);

//       const parent = prefix.split('.')[0]
//       const module = prefix.split('.')[1]
//       const version = prefix.split('.')[2]

//       const chunks: Code[] = [];

//       chunks.push(code`
//       import {
//         ${service.methodsArray.map((method: any) => {
//         return `${method.requestType}, ${method.responseType}`
//       }).join(', ')}
//       } from './types/${parent}/${module}/${version}/query';

//       export const ${module} = {
//         ${version}: {
//     `);


//       for (const method of service.methodsArray) {
//         const name = toCamelCase(method.name);

//         if (method.options === undefined) {
//           consola.warn(`Method ${name} does not have options, file: ${file}`);
//           continue;
//         }

//         const path = method.options['(google.api.http).get'];
//         if (!path) {
//           consola.warn(`Method ${name} does not have (google.api.http) options, file: ${file}`);
//           continue;
//         }

//         const reqParams = method.requestType;
//         const resParams = method.responseType

//         chunks.push(code`\
//         ${name}: {
//           path: "${path}",
//           method: "get",
//           requestType: undefined as unknown as ${reqParams},
//           responseType: undefined as unknown as ${resParams},
//         },`);
//       }

//       chunks.push(code`}
//     }`);

//       const codeToWrite = joinCode(chunks, { on: "\n" })

//       const filePath = resolve(generatedPath.replace('/types', ''), `${module}.ts`);
//       await writeFile(filePath, codeToWrite.toString());

//       consola.success(`Generated file ${filePath}`);
//     })
//   } catch (error) {
//     consola.error(`Failed to load file ${file}: ${error}`);
//   }
// }

interface QueryEndpoint {
  namespace: string[]
  methods: {
    name: string;
    path: string;
    reqParams: string;
    resParams: string;
  }[]
}

export async function generateQueryEndpoint(file: string, protoPath: string, generatedPath: string) {
  consola.debug(`Loading file ${file}`);

  try {
    const root = createProtoRoot(protoPath)
    const load = root.loadSync(file, { keepCase: true });

    const data: QueryEndpoint = {
      namespace: [],
      methods: []
    }

    await traverseServices(load, async function (service: any) {
      let prefix = service.fullName.startsWith('.') ? service.fullName.slice(1) : service.fullName;
      const namespace = prefix.split('.');

      data.namespace = namespace

      if (namespace.at(-1) === 'Query') {
        namespace.pop();
        prefix = namespace.join('.');
      } else {
        consola.debug(`skipping service ${service.fullName}, is not a Query service`);
        return
      }

      // TODO: generate types at the end
      consola.debug(`Generating types for ${file}`);
      await generateTypes(file, protoPath, generatedPath);

      for (const method of service.methodsArray) {
        const name = toCamelCase(method.name);

        if (method.options === undefined) {
          consola.warn(`Method ${name} does not have options, file: ${file}`);
          continue;
        }

        const path = method.options['(google.api.http).get'];
        if (!path) {
          consola.warn(`Method ${name} does not have (google.api.http) options, file: ${file}`);
          continue;
        }

        const reqParams = method.requestType;
        const resParams = method.responseType

        data.methods.push({
          name,
          path,
          reqParams,
          resParams
        })
      }
      // consola.info(data)
      await generateCodeForQueryEndpoints(data, generatedPath)
    })
  } catch (error) {
    consola.error(`Failed to load file ${file}: ${error}`);
  }
}

export async function generateCodeForQueryEndpoints(data: QueryEndpoint, generatedPath: string) {
  const chunks: Code[] = [];

  const imports = data.methods.map((method) => {
    return `${method.reqParams}, ${method.resParams}`
  }).join(', ')

  chunks.push(code`
  import {
    ${imports}
  } from './types/${data.namespace.join('/')}/query';
  `);

  chunks.push(code`export const ${data.namespace[1]} = {`);

  for (const ns of data.namespace.slice(2)) {
    chunks.push(code` ${ns}: {`);
  }

  for (const method of data.methods) {
    const name = toCamelCase(method.name);

    chunks.push(code`\
    ${name}: {
      path: '${method.path}',
      method: "get",
      reqParams: undefined as unknown as ${method.reqParams},
      resParams: undefined as unknown as ${method.resParams},
    },`);
  }

  for (const _ of data.namespace.slice(1)) {
    chunks.push(code`}`);
  }

  const codeToWrite = joinCode(chunks, { on: "\n", trim: false })

  if (!existsSync(generatedPath)) {
    consola.log(`Creating directory ${generatedPath}`);
    await mkdir(generatedPath, { recursive: true });
  }

  const filePath = resolve(generatedPath.replace('/types', ''), `${data.namespace[1]}.ts`);
  await writeFile(filePath, codeToWrite.toString());

  consola.success(`Generated file ${filePath}`);
}

export async function generateQueryIndex(generatedPath: string) {
  const files = await readdir(generatedPath, { withFileTypes: true });
  const chunks: Code[] = [];

  const modules = files.filter(
    (file) => file.isFile()
      && file.name.endsWith('.ts')
      && file.name !== 'index.ts').map((file) => file.name.replace('.ts', ''))

  for (const module of modules) {
    chunks.push(code`import { ${module} } from './${module}'`);
  }

  chunks.push(code`\n`)
  chunks.push(code`export default { ${modules.join(', ')} }`);

  const codeToWrite = joinCode(chunks, { on: "\n", trim: false })

  const filePath = resolve(generatedPath, `index.ts`);
  await writeFile(filePath, codeToWrite.toString());

  consola.success(`Generated file ${filePath}`);
}

export async function downloadProtoDeps(org: string, repo: string, version: string, deps?: ProtoDeps) {
  if (!org || !repo || !version) {
    throw new Error(`Invalid input: ${org}/${repo}@${version}`);
  }

  const dest = resolve(cacheDir(), org, repo, version, 'proto');

  consola.info(`Downloading proto dependencies...`);
  if (deps && deps.packages) {
    for (const pkg of deps.packages) {
      // eslint-disable-next-line prefer-const
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

      // copy proto files to the main proto directory
      const src = resolve(cacheDir(), pkgOrg, pkgRepo, pkgVersion, 'proto');
      consola.debug(`Source: ${src}`);

      if (!existsSync(src)) {
        consola.error(`Proto files not found for ${pkgOrg}/${pkgRepo}@${pkgVersion}`);
        continue;
      }

      // for each directory in the source, copy the directory to the destination
      const entries: Dirent[] = await readdir(src, { withFileTypes: true }).then((e) => e || [])
      await Promise.all(
        entries.map(async (entry) => {
          const srcDir = resolve(src, entry.name);
          const destDir = resolve(dest, entry.name);

          if (entry.isDirectory()) {
            consola.debug(`Copying ${entry.name} to ${dest}`);
            await cp(srcDir, destDir, { recursive: true });
          }
        })
      )

      // if (!existsSync(dest)) {
      //   consola.error(`Proto files not found for ${pkgOrg}/${pkgRepo}@${pkgVersion}`);
      //   return
      // }
      consola.debug(`[downloadProtoDeps] Copied proto files to ${dest}`);


      // consola.debug(`Skipping ${pkgOrg}/${pkgRepo}@${pkgVersion} proto files, already downloaded`);
    }
  }

  if (deps && deps.files) {
    for (const [file, url] of Object.entries(deps.files)) {
      consola.debug(`Downloading ${file}...`);

      const destFile = resolve(dest, file);
      if (!existsSync(dirname(destFile))) {
        consola.debug(`Creating directory for ${destFile}`);
        await mkdir(dirname(destFile), { recursive: true });
      }

      if (existsSync(destFile)) {
        consola.debug(`Skipping ${file}, already downloaded`);
        continue;
      }

      await download(url, destFile);
    }
  }
}

export async function downloadProto(org: string, repo: string, version: string) {
  const tmpDir = cacheDir();
  const tarPath = resolve(tmpDir, `${org}-${repo}-${version}.tar.gz`);
  const extractPath = resolve(tmpDir, `${org}/${repo}/${version}`);

  if (existsSync(extractPath)) {
    consola.debug(`[downloadProto] Skipping ${org}/${repo}@${version} proto files, already downloaded`)
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