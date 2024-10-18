#!/usr/bin/env node
import { defineCommand, runMain, showUsage } from "citty";
import { consola } from "consola";
import pkg from "../package.json" assert { type: "json" };
import { allProtoFiles, cacheDir, parsePackage } from "./utils";
import { resolve } from "pathe";
import { downloadProto, downloadProtoDeps, generateQueryEndpoint, generateQueryIndex } from "./proto";
import { cwd } from "node:process";
import { deps } from "./deps.config";

const mainCommand = defineCommand({
  meta: {
    name: pkg.name + ' org:repo@version',
    version: pkg.version,
    description: pkg.description,
  },
  args: {
    debug: {
      type: "boolean",
      description: "Show verbose debugging info",
    },
  },
  run: async ({ args }) => {
    if (!args._[0]) {
      await showUsage(mainCommand);
      process.exit(0)
    }

    const protoToGenerate = args._[1]?.trim()
    if (!protoToGenerate) {
      consola.error("Please provide a valid proto dir. Example: bitsong");
      return
    }

    if (args.debug) {
      consola.level = 5
      process.env.DEBUG = process.env.DEBUG || "true";
    }

    consola.box(`${pkg.name} v${pkg.version}`);

    let org: string, repo: string, version: string;

    try {
      const input = parsePackage(args._[0]);
      org = input.org;
      repo = input.repo;
      version = input.version;
    } catch {
      consola.error("Please provide a valid input (org:repo@version). Example: bitsongofficial:go-bitsong@v0.17.0");
      return
    }

    consola.info(`Downloading ${org}/${repo}@${version} proto files...`);
    await downloadProto(org, repo, version);

    // @ts-ignore
    await downloadProtoDeps(org, repo, version, deps[protoToGenerate]);

    consola.success(`Successfully downloaded ${org}/${repo}@${version} proto files!`);

    const protoPath = resolve(cacheDir(), `${org}/${repo}/${version}`, "proto");
    const generatedPath = resolve(cwd(), 'generated', org, repo, version, 'types');
    const protoFiles = (await allProtoFiles(resolve(protoPath, protoToGenerate))).filter((file) => file.endsWith("query.proto"));

    consola.info(`Generating types for ${protoFiles.length} files...`);

    for (const proto of protoFiles) {
      await generateQueryEndpoint(proto, protoPath, generatedPath)
    }

    await generateQueryIndex(generatedPath.replace('/types', ''))

    consola.success(`Successfully generated query endpoints: ./generated/${org}/${repo}/${version}`);
  }
})

runMain(mainCommand);