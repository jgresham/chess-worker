import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains'

export const createClients = (env: Env) => {
	const chain = env.ENVIRONMENT === "production" ? base : baseSepolia;
	const account = privateKeyToAccount(env.WALLET_PRIVATE_KEY);
	return {
		publicClient: createPublicClient({
			chain,
			transport: http(env.BASE_TRANSPORT_URL)
		}),
		account,
		walletClient: createWalletClient({
			account,
			chain,
			transport: http(env.BASE_TRANSPORT_URL),
		})
	}
}
