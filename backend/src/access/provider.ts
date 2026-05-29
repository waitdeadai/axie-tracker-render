import { JsonRpcProvider, FetchRequest, Network } from 'ethers';
import { config } from '../config';

let provider: JsonRpcProvider | null = null;

export function getRoninProvider(): JsonRpcProvider {
  if (provider) {
    return provider;
  }

  const { roninRpcUrl, roninRpcApiKey, chainId } = config.payment;

  // Static network avoids an eth_chainId round-trip on every reconnect and
  // pins us to Ronin mainnet (2020).
  const network = new Network('ronin', chainId);

  if (roninRpcApiKey) {
    const req = new FetchRequest(roninRpcUrl);
    req.setHeader('X-API-KEY', roninRpcApiKey);
    provider = new JsonRpcProvider(req, network, { staticNetwork: network });
  } else {
    provider = new JsonRpcProvider(roninRpcUrl, network, { staticNetwork: network });
  }

  return provider;
}
