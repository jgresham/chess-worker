import { http, createConfig } from '@wagmi/core'
import { base, baseSepolia } from '@wagmi/core/chains'

export const config = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
})
