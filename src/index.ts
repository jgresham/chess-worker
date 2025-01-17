import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { Chess } from "chess.js";

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
	game: Chess;

	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.json
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.game = new Chess();
		// todo: deserialize game state from env?
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async getGameFEN(): Promise<string> {
		return this.game.fen();
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
		  case "move":
			  const msgData: {
				  from: string,
				  to: string,
				  promotion: string, // always promote to a queen for example simplicity
				  } = parsedMsg.data

			  // validate move
			  const move = this.game.move(msgData);
				console.log("move:", move);

				// illegal move
				// todo: handle illegal move
				if (move === null) {
					console.error("illegal move");
					return;
				}
			// ws.serializeAttachment(session);
			// this.broadcast(parsedMsg, session.id);
				this.broadcast(parsedMsg);
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
	  console.log("stub", stub);
	  const gameFEN = await stub.getGameFEN();
	  console.log("stub.getGameFEN", gameFEN);
	  // Invoking Durable Object RPC method. Same `wrangler dev` session.
	  return gameFEN;
	}
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
	if (request.url.match("/ws")) {
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader !== "websocket") {
		  return new Response("Chess Durable Object expected Upgrade: websocket", {
			status: 426,
		  });
		}
		const id = env.CHESS_GAME.idFromName("globalRoom");
		const stub = env.CHESS_GAME.get(id);
		return stub.fetch(request);
	  }
	  return new Response(null, {
		status: 400,
		statusText: "Bad Request",
		headers: {
		  "Content-Type": "text/plain",
		},
	  });

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
