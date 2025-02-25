import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { Chess } from "chess.js";
import { verifyMessage, writeContract } from "@wagmi/core";
import { config } from "./wagmiconfig";
import { generateId } from "./generateId";
import { createClients } from "./viemClients";
import { contracts } from "./contracts";

export type WsMessage = {
	type: string,
	data: any
}

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.json`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */
export class ChessGame extends DurableObject<Env> {
	game: Chess | null = null;
	createdTimestamp: number | null = null;
	player1Address: `0x${string}` | null = null;
	player2Address: `0x${string}` | null = null;
	userFacingGameId: string | null = null;
	latestPlayer1Signature: `0x${string}` | null = null;
	latestPlayer1Message: string | null = null;
	latestPlayer2Signature: `0x${string}` | null = null;
	latestPlayer2Message: string | null = null;
	contractGameId: number | null = null;

	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.json
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		console.log("ChessGame constructor");
		super(ctx, env);
		this.initGame();
	}

	// Called multiple times!
	// loads data from storage into the durable object instance in memory
	async initGame() {
		console.log("initGame()");
		const gameFenStr: string = (await this.ctx.storage.get('gameFen') || '');
		const gamePgnStr: string = (await this.ctx.storage.get('gamePgn') || '');
		if (gameFenStr && gamePgnStr) {
			const loadedGame = new Chess();
			// load fen and pgn (avoid having to do recursive deserialization)
			// loadedGame.load(gameFenStr);
			loadedGame.loadPgn(gamePgnStr);
			this.game = loadedGame;
		} else {
			this.game = new Chess();
		}

		const player1Address: string = (await this.ctx.storage.get('player1Address')) || '';
		const player2Address: string = (await this.ctx.storage.get('player2Address')) || '';
		const userFacingGameId: string = (await this.ctx.storage.get('gameId')) || '';
		if (player1Address && player2Address && userFacingGameId) {
			this.player1Address = player1Address as `0x${string}`;
			this.player2Address = player2Address as `0x${string}`;
			this.userFacingGameId = userFacingGameId;
			this.contractGameId = await this.ctx.storage.get('contractGameId') as number | null;
		}
	}

	async setInitialPlayerData(gameData: {
		player1Address: `0x${string}`,
		player2Address: `0x${string}`,
		gameId: string,
		contractGameId: number
	}) {
		this.createdTimestamp = Date.now();
		await this.ctx.storage.put('createdTimestamp', this.createdTimestamp);
		await this.ctx.storage.put('player1Address', gameData.player1Address);
		await this.ctx.storage.put('player2Address', gameData.player2Address);
		await this.ctx.storage.put('contractGameId', gameData.contractGameId);
		this.player1Address = gameData.player1Address as `0x${string}`;
		this.player2Address = gameData.player2Address as `0x${string}`;
		await this.ctx.storage.put('gameId', gameData.gameId);
		this.userFacingGameId = gameData.gameId;

		// also set the pgn headers using this data
		if (this.game) {
			console.log("setting PGN headers");
			this.game.header('White', gameData.player1Address);
			this.game.header('Black', gameData.player2Address);
			this.game.header('Event', `${gameData.contractGameId},${gameData.gameId}`);
			this.game.header('Site', 'Based Chess');
			this.game.header('Date', new Date().toISOString());
		} else {
			console.error("PGN headers not set because this.game not initialized");
		}
		await this.saveGame();
	}

	async getUserFacingGameId() {
		return await this.ctx.storage.get('gameId');
	}

	async getUserFacingGameData(): Promise<{
		player1Address: `0x${string}` | undefined,
		player2Address: `0x${string}` | undefined,
		gameId: string | undefined,
		liveViewers: number | undefined,
		latestPlayer1Signature: `0x${string}` | undefined,
		latestPlayer1Message: string | undefined,
		latestPlayer2Signature: `0x${string}` | undefined,
		latestPlayer2Message: string | undefined,
		createdTimestamp: number | undefined,
		contractGameId: number | undefined,
	}> {
		const player1Address = await this.ctx.storage.get('player1Address') as `0x${string}` | undefined;
		const player2Address = await this.ctx.storage.get('player2Address') as `0x${string}` | undefined;
		const gameId = await this.ctx.storage.get('gameId') as string | undefined;
		if (!player1Address || !player2Address || !gameId) {
			console.error("userFacingGameData not found for gameId: ", this.userFacingGameId);
		}
		const latestPlayer1Signature = await this.ctx.storage.get('latestPlayer1Signature') as `0x${string}` | undefined;
		const latestPlayer1Message = await this.ctx.storage.get('latestPlayer1Message') as string | undefined;
		const latestPlayer2Signature = await this.ctx.storage.get('latestPlayer2Signature') as `0x${string}` | undefined;
		const latestPlayer2Message = await this.ctx.storage.get('latestPlayer2Message') as string | undefined;
		const createdTimestamp = await this.ctx.storage.get('createdTimestamp') as number | undefined;
		const contractGameId = await this.ctx.storage.get('contractGameId') as number | undefined;
		return {
			player1Address,
			player2Address,
			gameId,
			liveViewers: this.ctx.getWebSockets().length,
			latestPlayer1Signature,
			latestPlayer1Message,
			latestPlayer2Signature,
			latestPlayer2Message,
			createdTimestamp,
			contractGameId
		}
	}

	async saveGame() {
		if (!this.game) {
			console.error("game not initialized");
			return;
		}
		await this.ctx.storage.put('gameFen', this.game.fen());
		await this.ctx.storage.put('gamePgn', this.game.pgn());
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async getGameFEN(): Promise<string> {
		return this.game?.fen() || '';
	}

	getGamePgn(): string {
		if (!this.game) {
			console.error("game not initialized");
			return '';
		}
		return this.game.pgn();
	}

	getGame() {
		return this.game;
	}

	resetGame() {
		console.log("resetGame");
		this.game = new Chess();
		this.saveGame();
		this.broadcast({ type: "game", data: { pgn: this.getGamePgn() } });
	}

	broadcast(message: WsMessage, self?: string) {
		this.ctx.getWebSockets().forEach((ws) => {
			//   const { id } = ws.deserializeAttachment();
			//   if (id !== self) ws.send(JSON.stringify(message));
			ws.send(JSON.stringify(message));
		});
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		if (typeof message !== "string") return;
		const parsedMsg: WsMessage = JSON.parse(message);

		switch (parsedMsg.type) {
			case "get-game":
				const player1Address = await this.ctx.storage.get('player1Address');
				const player2Address = await this.ctx.storage.get('player2Address');
				// const liveViewers = await this.ctx.storage.get('liveViewers');
				const liveViewers = this.ctx.getWebSockets().length;
				const latestPlayer1Signature = await this.ctx.storage.get('latestPlayer1Signature') as `0x${string}` | undefined;
				const latestPlayer1Message = await this.ctx.storage.get('latestPlayer1Message') as string | undefined;
				const latestPlayer2Signature = await this.ctx.storage.get('latestPlayer2Signature') as `0x${string}` | undefined;
				const latestPlayer2Message = await this.ctx.storage.get('latestPlayer2Message') as string | undefined;
				const contractGameId = await this.ctx.storage.get('contractGameId') as number | undefined;
				console.log("getGame() liveViewers: ", liveViewers);
				ws.send(JSON.stringify(
					{
						type: "game", data: {
							pgn: this.getGamePgn(),
							player1Address,
							player2Address,
							liveViewers,
							latestPlayer1Signature,
							latestPlayer1Message,
							latestPlayer2Signature,
							latestPlayer2Message,
							contractGameId
						}
					}));
				break;
			case "reset-game":
				this.resetGame();
				break;
			case "move":
				if (!this.game) {
					console.error("game not initialized");
					return;
				}
				const msgData: {
					from: string,
					to: string,
					promotion: string, // always promote to a queen for example simplicity
					address: `0x${string}`,
					message: string,
					signature: `0x${string}`, // signature of the game pgn after the move is made
				} = parsedMsg.data

				// validate move
				try {
					const move = this.game.move({
						from: msgData.from, to: msgData.to, promotion: msgData.promotion
					});
					console.log("move received:", JSON.stringify(move));
					// check if the move is made by the correct player
					if (move.color === 'w' && msgData.address !== this.player1Address) {
						console.error("move made by wrong player");
						// undoes the latest move
						this.game.undo();
						return;
					}
					if (move.color === 'b' && msgData.address !== this.player2Address) {
						console.error("move made by wrong player");
						return;
					}
				} catch (error) {
					// illegal move
					console.error("error invalid move:", error);
					return;
				}

				// validate move signature
				console.log("game pgn after move:", JSON.stringify(this.game.pgn()));
				const verified = await verifyMessage(config, {
					address: msgData.address,
					message: this.game.pgn(),
					signature: msgData.signature,
				})
				if (!verified) {
					console.error("move signature verification failed");
					return;
				}
				console.log("user move signature verified:", verified);

				// todo: save each player's latest signature and message (pgn)
				if (msgData.address === this.player1Address) {
					this.latestPlayer1Signature = msgData.signature;
					this.latestPlayer1Message = this.game.pgn();
					await this.ctx.storage.put('latestPlayer1Signature', msgData.signature);
					await this.ctx.storage.put('latestPlayer1Message', this.game.pgn());
				} else if (msgData.address === this.player2Address) {
					this.latestPlayer2Signature = msgData.signature;
					this.latestPlayer2Message = this.game.pgn();
					await this.ctx.storage.put('latestPlayer2Signature', msgData.signature);
					await this.ctx.storage.put('latestPlayer2Message', this.game.pgn());
				} else {
					console.error("move made by non-player address");
					return;
				}

				await this.saveGame();
				// ws.serializeAttachment(session);
				// this.broadcast(parsedMsg, session.id);
				this.broadcast(parsedMsg);

				// check if game is over
				if (this.game.isGameOver()) {
					this.broadcast({ type: "game-over", data: { pgn: this.getGamePgn() } });

					// todo: save game state to a smart contract
				}
				break;
			case "live-viewers":
				console.log("live-viewers msg liveViewers: ", this.ctx.getWebSockets().length);
				ws.send(JSON.stringify({ type: "live-viewers", data: { liveViewers: this.ctx.getWebSockets().length } }));
				break;
			default:
				break;
		}
	}

	async webSocketClose(ws: WebSocket, code: number) {
		// If the client closes the connection, the runtime will invoke the webSocketClose() handler.
		ws.close(code, "Chess Durable Object is closing WebSocket");
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		this.ctx.acceptWebSocket(server);
		// If the client opens the connection, the runtime will invoke the webSocketOpen() handler.
		console.log("accepting new websocket connection");
		// const id = url.searchParams.get("id");
		// if (!id) {
		//   return new Response("Missing id", { status: 400 });
		// }

		// Set Id and Default Position
		// const sessionInitialData: Session = { id, x: -1, y: -1 };
		// server.serializeAttachment(sessionInitialData);
		// this.sessions.set(server, sessionInitialData);
		// this.broadcast({ type: "join", id }, id);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
}

export class SessionsRPC extends WorkerEntrypoint<Env> {
	async getGameFEN() {
		const id = this.env.CHESS_GAME.idFromName("globalRoom");
		const stub = this.env.CHESS_GAME.get(id);
		const gameFEN = await stub.getGameFEN();
		console.log("stub.getGameFEN", gameFEN);
		// Invoking Durable Object RPC method. Same `wrangler dev` session.
		return gameFEN;
	}
}

async function handleOptions(request: Request<unknown, CfProperties<unknown>>) {
	if (
		request.headers.get("Origin") !== null &&
		request.headers.get("Access-Control-Request-Method") !== null &&
		request.headers.get("Access-Control-Request-Headers") !== null
	) {
		// Handle CORS preflight requests.
		return new Response(null, {
			headers: {
				...corsHeaders,
				"Access-Control-Allow-Headers": request.headers.get(
					"Access-Control-Request-Headers",
				) || '*',
			},
		});
	} else {
		// Handle standard OPTIONS request.
		return new Response(null, {
			headers: {
				Allow: "GET, HEAD, POST, OPTIONS",
			},
		});
	}
}

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
	"Access-Control-Max-Age": "86400",
};

const setCors = (response: Response) => {
	// Set CORS headers
	response.headers.set("Access-Control-Allow-Origin", "*")
	response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	return response
}

export default {
	// 	/**
	// 	 * This is the standard fetch handler for a Cloudflare Worker
	// 	 *
	// 	 * @param request - The request submitted to the Worker from the client
	// 	 * @param env - The interface to reference bindings declared in wrangler.json
	// 	 * @param ctx - The execution context of the Worker
	// 	 * @returns The response to be sent back to the client
	// 	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log("request: ", request.url);
		if (request.method === "OPTIONS") {
			// Handle CORS preflight requests
			return handleOptions(request);
		}
		if (request.url.match("/ws")) {
			const upgradeHeader = request.headers.get("Upgrade");
			if (!upgradeHeader || upgradeHeader !== "websocket") {
				return new Response("Chess Durable Object expected Upgrade: websocket", {
					status: 426,
				});
			}
			const gameId = new URL(request.url).searchParams.get("gameId");
			if (!gameId) {
				return new Response(null, {
					status: 400,
					statusText: `Game gameId ${gameId} not found`,
					headers: {
						"Content-Type": "text/plain",
					},
				});
			}
			const id = env.CHESS_GAME.idFromName(gameId);
			console.log("id", id);
			const stub = env.CHESS_GAME.get(id);
			// if game does not have player data or gameId, return 404
			const userFacingGameId = await stub.getUserFacingGameId();
			if (!userFacingGameId) {
				return new Response(null, {
					status: 404,
					statusText: `Game ${gameId} not found`,
					headers: {
						"Content-Type": "text/plain",
					},
				});
			}
			return stub.fetch(request);
		} else if (request.url.match("/user/games")) {
			console.log("match /user/games")
			if (request.method == 'GET') {
				console.log("In GET /user/games")
				const address = new URL(request.url).searchParams.get("address");
				console.log("address", address);
				if (!address) {
					console.log("GET /user/games: address not found")
					return new Response(null, {
						status: 400,
						statusText: `URL search parameter address is required`,
						headers: {
							"Content-Type": "text/plain",
						},
					});
				}
				const games = await env.KV_CHESS_GAMES_BY_USER.get(address);
				console.log("games", games);
				const gameIds = games ? games.split(",") : [];
				let gameData = await Promise.all(gameIds.map(async (gameId) => {
					const stub = env.CHESS_GAME.get(env.CHESS_GAME.idFromName(gameId));
					const userFacingGameData = await stub.getUserFacingGameData();
					if (!userFacingGameData || !userFacingGameData.gameId || !userFacingGameData.player1Address || !userFacingGameData.player2Address) {
						console.error("userFacingGameData not found for gameId: ", gameId);
					}
					return { ...userFacingGameData };
				}));
				// put newest games first (todo: remove as games are stored newest first by default)
				gameData = gameData.sort((a, b) => {
					const aCreatedTimestamp = a.createdTimestamp || 0;
					const bCreatedTimestamp = b.createdTimestamp || 0;
					return bCreatedTimestamp - aCreatedTimestamp;
				});
				console.log("gameData", JSON.stringify(gameData));
				return setCors(new Response(JSON.stringify({ games: gameData })));
			}
		} else if (request.url.match("/game")) {
			console.log("match /game")
			if (request.method == 'POST') {
				console.log("POST /game")
				const body: {
					player1Address: `0x${string}`,
					player2Address: `0x${string}`,
				} = await request.json();
				const player1Address = body.player1Address;
				const player2Address = body.player2Address;
				if (!player1Address || !player2Address) {
					return new Response(null, {
						status: 400,
						statusText: `Player addresses not found. Player1: ${player1Address}, Player2: ${player2Address}`,
						headers: {
							"Content-Type": "text/plain",
						},
					});
				}
				const gameId = generateId();

				const id = env.CHESS_GAME.idFromName(gameId);
				console.log("id", id);
				const stub = env.CHESS_GAME.get(id);
				// if the gameId is already initialized then this is a random collision error, return 409
				// gameIds are generated using generateId() which is a random 6 character string
				const userFacingGameId = await stub.getUserFacingGameId();
				if (userFacingGameId) {
					return new Response(null, {
						status: 409,
						statusText: `Game ${gameId} already exists. Rare collision error. Try again.`,
						headers: {
							"Content-Type": "text/plain",
						},
					});
				}

				// Create a new game on the smart contract then save the gameId to the database
				console.log(`env.CHAIN_ID: ${env.CHAIN_ID}`);
				console.log(`env.BASE_TRANSPORT_URL: ${env.BASE_TRANSPORT_URL}`);
				if (!env.WALLET_PRIVATE_KEY) {
					console.error("WALLET_PRIVATE_KEY not found!");
				}
				if (!env.CHAIN_ID) {
					console.error("CHAIN_ID not found!");
				} else {
					console.log("env.CHAIN_ID: ", env.CHAIN_ID);
				}

				if (!env.BASE_TRANSPORT_URL) {
					console.error("BASE_TRANSPORT_URL not found!");
				} else {
					console.log("env.BASE_TRANSPORT_URL: ", env.BASE_TRANSPORT_URL);
				}

				const { account, publicClient, walletClient } = createClients(env);
				if (!env.WALLET_PRIVATE_KEY) {
					console.error("WALLET_PRIVATE_KEY not found");
					return new Response(null, {
						status: 500,
						statusText: "Internal Server Error",
					});
				}

				const { request: createGameRequest } = await publicClient.simulateContract({
					account,
					address: contracts.gamesContract[env.CHAIN_ID].address,
					abi: contracts.gamesContract[env.CHAIN_ID].abi,
					functionName: 'createGame',
					args: [player1Address, player2Address],
				})
				const txHash = await walletClient.writeContract(createGameRequest)
				console.log("txHash", txHash);

				const transaction = await publicClient.waitForTransactionReceipt(
					{ hash: txHash }
				)
				console.log("transaction status", transaction.status);
				console.log("transaction gameId", transaction.logs[0].topics[1]);

				// get the gameId emitted from the transaction
				// using the event GameCreated(uint256 indexed gameId);
				const rawGameId = transaction.logs[0].topics[1];
				const bigIntGameId = BigInt(rawGameId as string);
				const contractGameId = Number(bigIntGameId);   // As number: 291 (if within safe range)
				console.log("contractGameId: ", contractGameId);

				// create game data object
				const gameData = {
					player1Address,
					player2Address,
					gameId,
					contractGameId
				}
				console.log("gameData", JSON.stringify(gameData));

				await stub.setInitialPlayerData(gameData);
				let player1Games = await env.KV_CHESS_GAMES_BY_USER.get(player1Address);
				let player2Games = await env.KV_CHESS_GAMES_BY_USER.get(player2Address);
				// add new games to the beginning of the list
				player1Games = player1Games ? `${gameId},${player1Games}` : gameId;
				player2Games = player2Games ? `${gameId},${player2Games}` : gameId;
				await env.KV_CHESS_GAMES_BY_USER.put(player1Address, player1Games);
				await env.KV_CHESS_GAMES_BY_USER.put(player2Address, player2Games);

				// save the gameId to the databases
				const result = await env.D1_GAMES.prepare("INSERT INTO games (ContractGameId, DurableObjectId, DisplayGameId, Player1Address, Player2Address) VALUES (?, ?, ?, ?, ?)")
					.bind(contractGameId, id.toString(), gameId, player1Address, player2Address)
					.run();
				console.log("result", JSON.stringify(result));

				// response.headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") || '*');
				return setCors(new Response(JSON.stringify({ gameId })));
			}
		} else if (request.url.match("/image")) {
			// Define an SVG
			const gameId = new URL(request.url).searchParams.get("gameId");
			const object = await env.BUCKET_BASEDCHESS_BOARDS.get(`${gameId}.png`);

			if (object === null) {
				return new Response("Object Not Found", { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set("etag", object.httpEtag);

			return new Response(object.body, {
				headers,
			});
		}
		console.log("Router handler not found for request: ", request.url);
		return new Response("sah dude", {
			status: 200,
			statusText: "OK",
			headers: {
				"Content-Type": "text/plain",
			},
		});
		// return new Response(null, {
		// 	status: 400,
		// 	statusText: "Bad Request",
		// 	headers: {
		// 		"Content-Type": "text/plain",
		// 	},
		// });

		// 		// We will create a `DurableObjectId` using the pathname from the Worker request
		// 		// This id refers to a unique instance of our 'MyDurableObject' class above
		// 		let id: DurableObjectId = env.CHESS_GAME.idFromName(new URL(request.url).pathname);

		// 		// This stub creates a communication channel with the Durable Object instance
		// 		// The Durable Object constructor will be invoked upon the first call for a given id
		// 		let stub = env.CHESS_GAME.get(id);

		// 		// We call the `sayHello()` RPC method on the stub to invoke the method on the remote
		// 		// Durable Object instance
		// 		let greeting = await stub.getGameFEN();

		// 		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;
