import { RoninWalletConnector } from '@sky-mavis/tanto-connect';
import { BrowserProvider, Contract, getAddress, type Eip1193Provider } from 'ethers';

// Ronin mainnet. The backend SIWE verifier rejects any other chainId.
export const RONIN_CHAIN_ID = 2020;

// Minimal ERC-20 surface needed to move USDC from the connected wallet.
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)'
];

let connector: RoninWalletConnector | null = null;

function getConnector(): RoninWalletConnector {
  if (!connector) {
    connector = new RoninWalletConnector();
  }
  return connector;
}

export function isRoninWalletInstalled(): boolean {
  // tanto-connect 0.0.22 has no install-check helper; the Ronin Wallet extension
  // injects an EIP-1193 provider at window.ronin (EIP-6963 also available).
  return typeof window !== 'undefined' && Boolean((window as { ronin?: unknown }).ronin);
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
}

// Opens the Ronin Wallet, ensures we're on Ronin mainnet, and returns the
// EIP-55 checksummed account. The connector's EIP-1193 provider is what every
// subsequent signMessage / transfer call rides on.
export async function connectWallet(): Promise<ConnectedWallet> {
  const c = getConnector();
  const { account, chainId } = await c.connect(RONIN_CHAIN_ID);

  if (chainId !== RONIN_CHAIN_ID) {
    await c.switchChain(RONIN_CHAIN_ID);
  }

  return { address: getAddress(account), chainId: RONIN_CHAIN_ID };
}

export async function getConnectedAddress(): Promise<string | null> {
  const c = getConnector();
  if (!(await c.isAuthorized())) {
    return null;
  }
  const accounts = await c.getAccounts();
  const first = accounts[0];
  return first ? getAddress(first) : null;
}

export async function disconnectWallet(): Promise<void> {
  try {
    await getConnector().disconnect();
  } catch {
    // A wallet that's already disconnected is fine.
  }
}

async function getEip1193Provider(): Promise<Eip1193Provider> {
  const provider = await getConnector().getProvider();
  return provider as unknown as Eip1193Provider;
}

// EIP-191 personal_sign over the prepared SIWE message, via the connected wallet.
export async function signMessage(message: string, address: string): Promise<string> {
  const browserProvider = new BrowserProvider(await getEip1193Provider(), RONIN_CHAIN_ID);
  const signer = await browserProvider.getSigner(address);
  return signer.signMessage(message);
}

// Sends an ERC-20 transfer of `amount` (base units, as a decimal string) of
// `tokenContract` to `to`, signed by the connected wallet. Returns the tx hash.
export async function transferToken(params: {
  tokenContract: string;
  to: string;
  amount: string;
  from: string;
}): Promise<string> {
  const browserProvider = new BrowserProvider(await getEip1193Provider(), RONIN_CHAIN_ID);
  const signer = await browserProvider.getSigner(params.from);
  const token = new Contract(params.tokenContract, ERC20_ABI, signer);
  const tx = await token.transfer(params.to, BigInt(params.amount));
  return tx.hash as string;
}
