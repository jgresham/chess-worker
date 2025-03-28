import { isChessPgnValidForCurrentPgn, parseHeaders } from "./chessPgn";
import { Chess } from "chess.js";
import { contracts } from "./contracts";
import { createClients } from "./viemClients";

/**
 * first part checks the validity of the message, but it isn't vital
 * second part importantly checks if the message is valid for the game
 * third part is calling the smart contract function verifyGameUpdate() with the result
 * Verifying a game update for a previous games contract address (version) is not supported at the moment
 */
export const verifyGameUpdate = async ({
	env,
	gameUpdate: {
		contractGameId,
		signer,
		message,
		signature,
		updateIndex,
	}
}: {
	env: Env,
	gameUpdate: {
		contractGameId: number,
		signer: `0x${string}`,
		message: string,
		signature: `0x${string}`,
		updateIndex: number,
	}
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
			console.log("gameId ${contractGameId} not found");
			return new Response(`gameId ${contractGameId} not found`, { status: 404 });
		}

		const dbGame = dbResult.results[0];
		if (signer !== dbGame.Player1Address && signer !== dbGame.Player2Address && signer !== dbGame.CreatorAddress) {
			return new Response(`signer ${signer} of the update is not a player in game ${contractGameId} or the creator`, { status: 403 });
		}


		const { account, publicClient, walletClient } = createClients(env);
		if (!env.WALLET_PRIVATE_KEY) {
			console.error("WALLET_PRIVATE_KEY not found");
			return new Response(null, {
				status: 500,
				statusText: "Internal Server Error",
			});
		}

		const verified = await publicClient.verifyMessage({
			message,
			signature,
			address: signer,
		});

		if (!verified) {
			return new Response(`signature is invalid for message ${message} and signer ${signer}`, { status: 403 });
		}
		// Check if the message is valid for the game.
		// First check if the message is a valid chess PGN, then check if the pgn is the current game state
		// Get the server game state from the durable object
		const durableObjectId = env.CHESS_GAME.idFromName(dbGame.DisplayGameId);
		const stub = env.CHESS_GAME.get(durableObjectId);
		const gameDataDo = await stub.getUserFacingGameData();
		console.log("gameDataDo", gameDataDo);
		let latestPlayerMessage = gameDataDo.latestPlayer1Message
		if (gameDataDo.latestPlayer2Message) {
			if (gameDataDo.latestPlayer1Message?.length > gameDataDo.latestPlayer2Message?.length) {
				latestPlayerMessage = gameDataDo.latestPlayer1Message;
			} else {
				latestPlayerMessage = gameDataDo.latestPlayer2Message;
			}
		}

		console.log("latestPlayerMessage", latestPlayerMessage);
		const currentChess = new Chess();
		currentChess.loadPgn(await stub.getGamePgn());
		const isChessPgnValid = isChessPgnValidForCurrentPgn(latestPlayerMessage, currentChess.pgn());
		console.log("latestPlayerMessage", latestPlayerMessage);
		console.log("isChessPgnValid", isChessPgnValid);
		if (!isChessPgnValid) {
			return new Response(`latestPlayerMessage is invalid for game ${contractGameId}`, { status: 403 });
		}

		// calc game over result for the smart contract data
		let gameOverResult = 0; // no result
		let gameWinnerAddress = '0x0000000000000000000000000000000000000000'; // zero address
		if (currentChess.isGameOver()) {
			console.log("game is over");
			if (currentChess.isCheckmate()) {
				gameOverResult = 1; // winning result
				// if it is blacks turn, that means white won
				if (currentChess.turn() === "b") {
					gameWinnerAddress = dbGame.Player1Address;
				} else {
					gameWinnerAddress = dbGame.Player2Address;
				}
			} else if (currentChess.isDraw()) {
				gameOverResult = 2; // draw result
				if (currentChess.isStalemate()) {
					gameOverResult = 3; // stalemate result
				}
				if (currentChess.isThreefoldRepetition()) {
					gameOverResult = 4; // insufficient material
				}
			} else {
				// this should handle the resignation case where there isn't a checkmate or draw
				// check the Result header
				const resultHeader = parseHeaders(currentChess.pgn());
				if (resultHeader.result === "1-0") {
					gameOverResult = 1; // winning result
					gameWinnerAddress = dbGame.Player1Address;
				} else if (resultHeader.result === "0-1") {
					gameOverResult = 1; // winning result
					gameWinnerAddress = dbGame.Player2Address;
				}
			}
			console.log(`Game result: ${gameOverResult} winner: ${gameWinnerAddress}`);
		}

		// call the function verifyGameUpdate() optionally declaring a winner.
		console.log(`calling verifyGameUpdate ${contractGameId} ${updateIndex} ${gameOverResult} ${gameWinnerAddress}`);
		const { request: verifyGameUpdateRequest } = await publicClient.simulateContract({
			account,
			address: contracts.gamesContract[env.CHAIN_ID].address,
			abi: contracts.gamesContract[env.CHAIN_ID].abi,
			functionName: 'verifyGameUpdate',
			args: [contractGameId, updateIndex, gameOverResult, gameWinnerAddress],
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
			return new Response("verifyGameUpdate tx revert and not included in a block", { status: 500 });
		}

	} catch (error: any) {
		console.error("verifyGameUpdate error", error);
		console.error("verifyGameUpdate error stack", error?.stack);
		return new Response("verifyGameUpdate error", { status: 500 });
	}
}
