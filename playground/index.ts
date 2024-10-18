import { PathTemplate } from "google-gax";
import bitsongUrls from '../generated/bitsongofficial/go-bitsong/v0.17.0'
import osmosisUrls from '../generated/osmosis-labs/osmosis/v25.0.0'
import cosmosUrls from '../generated/cosmos/cosmos-sdk/v0.45.16'
import { cfetch } from 'cosmos-fetch'
import fsDriver from 'unstorage/drivers/fs'
import { Storage, StorageValue, createStorage } from 'unstorage'

type Endpoint = { path: string; method: string; reqParams: any; resParams: any };
type Service<S> = { [K in keyof S]: S[K] extends Endpoint ? (params: S[K]['reqParams']) => Promise<S[K]['resParams']> : Service<S[K]> };

function createApi<S>(chain: string, service: S, cache?: Storage<StorageValue>): Service<S> {
  const client: any = {};

  for (const [key, value] of Object.entries(service as Record<string, any>)) {
    client[key] = 'path' in value && 'method' in value && 'reqParams' in value && 'resParams' in value ? async (params: typeof value.reqParams) => {
      const pathTemplate = new PathTemplate(value.path);
      const path = pathTemplate.render(params);

      return await cfetch(`/${path}`, { chain, cache });
    } : createApi(chain, value, cache);
  }

  return client as Service<S>;
}

const cache = createStorage({ driver: fsDriver({ base: './.cache/cosmos-fetch' }) })

const bitsong = createApi('bitsong', bitsongUrls, cache);
const osmosis = createApi('osmosis', osmosisUrls, cache);
const cosmos = createApi('cosmoshub', cosmosUrls, cache);

const { fantoken: clay } = await bitsong.fantoken.v1beta1.fanToken({ denom: 'ft2D8E7041556CE93E1EFD66C07C45D551A6AAAE09' })
console.log(clay);

const { params: osmosisCLParams } = await osmosis.concentratedliquidity.v1beta1.params({})
console.log(osmosisCLParams);

const { params } = await cosmos.bank.v1beta1.params({})
console.log(params);