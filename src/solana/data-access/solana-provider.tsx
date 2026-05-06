import type { ReactNode } from 'react'

import {
  createSolanaDevnet,
  createSolanaLocalnet,
  createSolanaTestnet,
  createWalletUiConfig,
  WalletUi,
} from '@wallet-ui/react'

const config = createWalletUiConfig({
  clusters: [
    createSolanaDevnet('https://api.devnet.solana.com'),
    createSolanaLocalnet('http://127.0.0.1:8899'),
    createSolanaTestnet('https://api.testnet.solana.com'),
  ],
})

export function SolanaProvider({ children }: { children: ReactNode }) {
  return <WalletUi config={config}>{children}</WalletUi>
}
