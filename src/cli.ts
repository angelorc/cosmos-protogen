#!/usr/bin/env node
import { defineCommand, runMain, showUsage } from "citty";
import { consola } from "consola";
import pkg from "../package.json" assert { type: "json" };
import { allProtoFiles, cacheDir } from "./utils";
import { resolve } from "pathe";
import { downloadProto, downloadProtoDeps, generateQueryEndpoint, generateQueryIndex } from "./proto";
import { cwd } from "node:process";
import { deps } from "./deps.config";
import { getProtoInfo } from ".";

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

    if (args.debug) {
      consola.level = 5
      process.env.DEBUG = process.env.DEBUG || "true";
    }

    consola.box(`${pkg.name} v${pkg.version}`);

    const protoInfo = getProtoInfo(args._[0]);

    consola.info(`Downloading ${protoInfo.name} proto files...`);
    await downloadProto(protoInfo);

    // @ts-ignore
    const protoDeps = deps[`${protoInfo.name}#${protoInfo.version}`] || deps[protoInfo.name];
    await downloadProtoDeps(protoInfo, protoDeps);

    consola.success(`Successfully downloaded ${protoInfo.name}#${protoInfo.version} proto files!`);

    // const protoPath = resolve(cacheDir(), `${org}/${repo}/${version}`, "proto");
    // const generatedPath = resolve(cwd(), 'generated', org, repo, version, 'types');
    // const protoFiles = (await allProtoFiles(resolve(protoPath, protoToGenerate))).filter((file) => file.endsWith("query.proto"));

    // consola.info(`Generating types for ${protoFiles.length} files...`);

    // for (const proto of protoFiles) {
    //   await generateQueryEndpoint(proto, protoPath, generatedPath)
    // }

    // await generateQueryIndex(generatedPath.replace('/types', ''))

    // consola.success(`Successfully generated query endpoints: ./generated/${org}/${repo}/${version}`);
  }
})

runMain(mainCommand);