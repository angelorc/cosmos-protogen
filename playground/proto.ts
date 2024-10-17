import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { cwd } from "node:process";
import { resolve } from "pathe";
import * as protobuf from 'protobufjs';
import { code, Code, joinCode } from "ts-poet";
import { toCamelCase } from "./utils";
import consola from "consola";

// https://raw.githubusercontent.com/jas-chen/ts-proto/refs/heads/948-http-support/integration/google-api-http/google/protobuf/descriptor.proto
// put this file in playground/proto/google/protobuf/descriptor.proto

export function createProtoRoot(path: string): protobuf.Root {
  const root = new protobuf.Root();

  // fix path resolution
  // TODO: this is a hack, we should find a better way to resolve paths
  root.resolvePath = (_origin, target) => {
    const paths = ['bitsong', 'confio', 'cosmos', 'cosmos_proto', 'gogoproto', 'google', 'ibc', 'tendermint']
    if (paths.some((path) => target.startsWith(path))) {
      target = resolve(path, target);
    }
    return target;
  }

  return root;
}

async function traverseServices(current, fn) {
  if (current instanceof protobuf.Service) {
    return await fn(current);
  }

  if (current.nestedArray) {
    for (const nested of current.nestedArray) {
      await traverseServices(nested, fn);
    }
  }
}

export function generatedTypesDir() {
  return resolve(cwd(), 'generated', 'types');
}

function runProtoc(...args: string[]) {
  const child = spawnSync('/usr/bin/protoc', args, { shell: true, stdio: 'inherit' });

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

export async function generateQueryEndpoints(root: protobuf.Root, file: string, protoPath: string, generatedPath: string) {
  console.log(`Loading file ${file}`);

  const load = root.loadSync(file, { keepCase: true });

  return await traverseServices(load, async function (service) {
    console.log(`Generating service ${service.fullName}`);

    let prefix = service.fullName.startsWith('.') ? service.fullName.slice(1) : service.fullName;
    const parts = prefix.split('.');

    if (parts.at(-1) === 'Query') {
      parts.pop();
      prefix = parts.join('.');
    } else {
      console.log(`skipping service ${service.fullName}, is not a Query service`);
      return
    }

    console.log(`Prefix: ${prefix}`);

    console.log(`Generating types for ${file}`);
    await generateTypes(file, protoPath, generatedPath);

    const parent = prefix.split('.')[0]
    const module = prefix.split('.')[1]
    const version = prefix.split('.')[2]

    const chunks: Code[] = [];

    chunks.push(code`
      import {
        ${service.methodsArray.map((method) => {
      return `${method.requestType}, ${method.responseType}`
    }).join(', ')}
      } from './types/${parent}/${module}/${version}/query';

      export const ${module} = {
        ${version}: {
    `);


    for (const method of service.methodsArray) {
      const name = toCamelCase(method.name);
      const path = method.options['(google.api.http).get'];
      const reqParams = method.requestType;
      const resParams = method.responseType

      chunks.push(code`\
        ${name}: {
          path: "${path}",
          method: "get",
          requestType: undefined as unknown as ${reqParams},
          responseType: undefined as unknown as ${resParams},
        },`);
    }

    chunks.push(code`}
    }`);

    const codeToWrite = joinCode(chunks, { on: "\n" })

    const filePath = resolve(generatedPath.replace('/types', ''), `${module}.ts`);
    await writeFile(filePath, codeToWrite.toString());

    consola.log(`Generated file ${filePath}`);
  })
}