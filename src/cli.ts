#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import pkg from "../package.json" assert { type: "json" };
import { downloadProto, parseInput } from "./utils";

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
      const input = parseInput(args._[0]);
      org = input.org;
      repo = input.repo;
      version = input.version;
    } catch {
      consola.error("Please provide a valid input (org:repo@version). Example: bitsongofficial:go-bitsong@v0.17.0");
      return
    }

    consola.info(`Downloading ${org}/${repo}@${version} proto files...`);
    await downloadProto(org, repo, version);

    consola.success(`Successfully downloaded ${org}/${repo}@${version} proto files!`);
  }
})

runMain(mainCommand);