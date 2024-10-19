import { spawnSync } from "node:child_process";
import { Dirent, existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { cwd } from "node:process";
import { dirname, resolve } from "pathe";
import * as protobuf from 'protobufjs';
import { code, Code, imp, joinCode } from "ts-poet";
import { cacheDir, download, toCamelCase } from "./utils";
import consola from "consola";
import { extract, t } from "tar";
import { ProtoDeps, ProtoInfo } from "./types";
import { getProtoInfo } from "./providers";

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

export async function downloadProtoDeps(protoInfo: ProtoInfo, deps?: ProtoDeps) {
  console.log(protoInfo.cacheDir)
  console.log(cacheDir())
  const tmpDir = resolve(protoInfo.cacheDir ?? cacheDir(), 'cosmos-protogen');
  consola.debug(`[downloadProtoDeps] Temp directory: ${tmpDir}`);
  const subdir = protoInfo.subdir !== '/' ? protoInfo.subdir : '';
  const dest = resolve(tmpDir, `${protoInfo.formattedName}-${protoInfo.version}`, subdir);
  consola.debug(`[downloadProtoDeps] Destination: ${dest}`);

  consola.info(`Downloading proto dependencies...`);
  if (deps && deps.packages) {
    for (const pkg of deps.packages) {
      const pkgProtoInfo = getProtoInfo(pkg);

      consola.debug(`Downloading ${pkgProtoInfo.name}#${pkgProtoInfo.version} proto files...`);
      await downloadProto(pkgProtoInfo);

      // copy proto files to the main proto directory
      const src = resolve(dest, 'proto');
      consola.debug(`Source: ${src}`);

      if (!existsSync(src)) {
        consola.error(`Proto files not found for ${pkgProtoInfo.name}#${pkgProtoInfo.version}`);
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

      consola.debug(`[downloadProtoDeps] Copied proto files to ${dest}`);
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

export async function downloadProto(protoInfo: ProtoInfo) {
  // .cache/cosmos-protogen
  const tmpDir = resolve(protoInfo.cacheDir || cacheDir(), 'cosmos-protogen');
  // .cache/cosmos-protogen/bitsongofficial-go-bitsong-main.tar.gz
  const tarPath = resolve(tmpDir, `${protoInfo.formattedName}-${protoInfo.version}.tar.gz`);
  // .cache/cosmos-protogen/bitsongofficial-go-bitsong-main
  const extractPath = resolve(tmpDir, `${protoInfo.formattedName}-${protoInfo.version}`);

  if (existsSync(extractPath)) {
    consola.debug(`[downloadProto] Skipping ${protoInfo.formattedName}-${protoInfo.version} proto files, already downloaded`)
    return;
  }

  await mkdir(dirname(tarPath), { recursive: true });
  await download(protoInfo.tar, tarPath);
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

  const entryToRemove = (await readdir(extractPath)).filter(entry => entry !== "proto");
  for (const entry of entryToRemove) {
    await rm(resolve(extractPath, entry), { recursive: true, force: true });
  }
  consola.debug(`Removed unnecessary files`);
}