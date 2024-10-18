const common = {
  packages: [
    'cosmos:cosmos-proto@v1.0.0-beta.5', // cosmos_proto
    'cometbft:cometbft@v0.34.27', // tendermint
  ],
  files: {
    'google/api/annotations.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto',
    'google/api/http.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto',
    'google/protobuf/descriptor.proto': 'https://raw.githubusercontent.com/protocolbuffers/protobuf/refs/heads/main/src/google/protobuf/descriptor.proto',
    'gogoproto/gogo.proto': 'https://raw.githubusercontent.com/cosmos/gogoproto/main/gogoproto/gogo.proto',
  }
}

const bitsong = {
  packages: [
    'cosmos:cosmos-sdk@v0.45.16',
    'cosmos:ibc-go@v7.0.0',
    ...common.packages,
  ],
  files: {
    ...common.files,
    'cosmos/ics23/v1/proofs.proto': 'https://raw.githubusercontent.com/cosmos/ics23/master/proto/cosmos/ics23/v1/proofs.proto',
    //'ibc/core/commitment/v1/commitment.proto': 'https://raw.githubusercontent.com/cosmos/ibc-go/refs/tags/v7.0.0/proto/ibc/core/commitment/v1/commitment.proto'
  }
}

const cosmos = {
  packages: [
    ...common.packages,
  ],
  files: {
    ...common.files
  }
}

const osmosis = {
  packages: [
    'cosmos:cosmos-sdk@v0.47.8',
  ]
}

export const deps = {
  bitsong,
  cosmos,
  osmosis
}