import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  declaration: true,
  failOnWarn: false,
  rollup: {
    emitCJS: true,
  },
  entries: [
    'src/index.ts',
    'src/cli.ts',
  ],
  externals: ['protobufjs']
})