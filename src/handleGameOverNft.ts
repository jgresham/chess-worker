import { isChessPgnValidForCurrentPgn, parseHeaders } from "./chessPgn";
import { Chess } from "chess.js";
import { contracts } from "./contracts";
import { createClients } from "./viemClients";

/**
 * Call the ERC1155 nft contract to set the metadataUrl for the specific contract + gameId
 *
 */
export const handleGameOverNft = async ({
	env,
	contractAddress,
	contractGameId,
	metadataUrl,
}: {
	env: Env,
	contractAddress: `0x${string}`,
	contractGameId: number,
	metadataUrl: string,
}): Promise<Response> => {
	// first, check if the game exists
	// check if signer is player1 or player2 of the game or creator of the game
	// check if the signature is valid for the message and signer
	try {
		const dbResult = await env.D1_GAMES.prepare("SELECT * from games WHERE ContractGameId = ? AND ContractAddress = ?")
			.bind(contractGameId, contracts.gamesContract[env.CHAIN_ID].address)
			.run();
		console.log("result", JSON.stringify(dbResult));

		if (dbResult.results.length === 0) {
			console.log("gameId ${contractGameId} not found for contract ${contractAddress}");
			return new Response(`gameId ${contractGameId} not found for contract ${contractAddress}`, { status: 404 });
		}

		// const dbGame = dbResult.results[0];
		// if (signer !== dbGame.Player1Address && signer !== dbGame.Player2Address && signer !== dbGame.CreatorAddress) {
		// 	return new Response(`signer ${signer} of the update is not a player in game ${contractGameId} or the creator`, { status: 403 });
		// }


		const { account, publicClient, walletClient } = createClients(env);
		if (!env.WALLET_PRIVATE_KEY) {
			console.error("WALLET_PRIVATE_KEY not found");
			return new Response(null, {
				status: 500,
				statusText: "Internal Server Error",
			});
		}

		if (contractAddress !== contracts.gamesContract[env.CHAIN_ID].address) {
			return new Response(`contractAddress ${contractAddress} is not the current games contract`, { status: 403 });
		}

		// call the function 	() optionally declaring a winner.
		console.log(`calling setGameOverNftMetadata ${contractGameId} ${metadataUrl}`);
		const { request: verifyGameUpdateRequest } = await publicClient.simulateContract({
			account,
			address: contracts.nftContract[env.CHAIN_ID].address,
			abi: contracts.nftContract[env.CHAIN_ID].abi,
			functionName: 'setNftUri',
			args: [contracts.gamesContract[env.CHAIN_ID].address, contractGameId, metadataUrl],
		})
		const txHash = await walletClient.writeContract(verifyGameUpdateRequest)
		console.log("txHash", txHash);

		try {
			// wait for the tx to be included in a block
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			console.log("tx included in a block");
			return new Response(JSON.stringify({ success: true, data: { txHash } }), { status: 200 });
		} catch (error) {
			console.error("verifyGameUpdate tx revert and not included in a block", error);
			return new Response(JSON.stringify({ error: "verifyGameUpdate tx revert and not included in a block" }), { status: 500 });
		}

	} catch (error: any) {
		console.error("setGameOverNftMetadata error", error);
		console.error("setGameOverNftMetadata error stack", error?.stack);
		return new Response(JSON.stringify({ error: "setGameOverNftMetadata error" }), { status: 500 });
	}
}
