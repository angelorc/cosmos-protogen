import { resolve } from "pathe";
import { downloadProto, allProtoFiles, cacheDir } from "../src/utils";
import { createProtoRoot, generateQueryEndpoints } from "../src/proto";
import consola from "consola";
import { cwd } from "node:process";

async function main() {
  // const org = "bitsongofficial";
  // const repo = "go-bitsong";
  // const version = "v0.17.0";

  // const org = "osmosis-labs";
  // const repo = "osmosis";
  // const version = "v25.2.1";

  const org = "cosmos";
  const repo = "cosmos-sdk";
  const version = "v0.45.16";

  // await downloadProto(org, repo, version);

  const extractPath = resolve(cacheDir(), `${org}/${repo}/${version}`);
  const protoPath = resolve(extractPath, "proto");
  consola.log(protoPath);

  const protoFiles = await allProtoFiles(protoPath);
  consola.log(protoFiles);

  const root = createProtoRoot(protoPath)

  //const generatedPath = resolve(cwd(), 'generated', 'types');
  const generatedPath = resolve(cwd(), 'generated', org, repo, version, 'types');

  for (const proto of protoFiles) {
    await generateQueryEndpoints(root, proto, protoPath, generatedPath)
  }
}

await main().catch(console.error);