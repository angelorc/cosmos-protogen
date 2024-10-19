import { describe, expect, it } from "vitest";
import { getProtoInfo } from "../src";

describe("packageName", () => {
  it("pass", () => {
    const protoInfo = getProtoInfo("bitsongofficial/go-bitsong/proto/bitsong")

    expect(protoInfo).toMatchObject({
      provider: 'github',
      name: 'bitsongofficial/go-bitsong',
      formattedName: 'bitsongofficial-go-bitsong',
      version: 'main',
      subdir: '/proto/bitsong',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      url: 'https://github.com/bitsongofficial/go-bitsong/tree/main/proto/bitsong',
      tar: 'https://api.github.com/repos/bitsongofficial/go-bitsong/tarball/main'
    })
  });
});
