#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import pkg from "../package.json" assert { type: "json" };
import { allProtoFiles, cacheDir, downloadProto, downloadProtoDeps, parsePackage } from "./utils";
import { resolve } from "pathe";
import { createProtoRoot, generateQueryEndpoints } from "./proto";
import { cwd } from "node:process";

const mainCommand = defineCommand({
  meta: {
    name: pkg.name,
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

    await downloadProtoDeps(org, repo, version);

    consola.success(`Successfully downloaded ${org}/${repo}@${version} proto files!`);

    const protoPath = resolve(cacheDir(), `${org}/${repo}/${version}`, "proto");
    const generatedPath = resolve(cwd(), 'generated', org, repo, version, 'types');

    const protoFiles = await allProtoFiles(protoPath);
    const root = createProtoRoot(protoPath)

    for (const proto of protoFiles) {
      consola.debug(`Generating query endpoints for ${proto}...`);
      await generateQueryEndpoints(root, proto, protoPath, generatedPath)
    }

    consola.success(`Successfully generated query endpoints: ./generated/${org}/${repo}/${version}`);
  }
})

runMain(mainCommand);