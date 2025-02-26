import { Chess } from "chess.js";

// Function to parse headers from a string
export function parseHeaders(pgnString: string): Record<string, string> {
	const headers: Record<string, string> = {};
	const lines = pgnString.split('\n');

	for (const line of lines) {
		const match = line.match(/^\[(\w+)\s+"([^"]*)"\]$/);
		if (match) {
			const [, key, value] = match;
			headers[key] = value;
		}
	}

	return headers;
}

/**
 * Check if the current pgn is a valid previous or current state of the current pgn
 * If the current game is over, then only the current pgn is valid
 * @param prevPgn - The previous pgn
 * @param currentPgn - The current pgn
 * @returns true if the current pgn is a valid previous state of the previous pgn, false otherwise
 */
export const isChessPgnValidForCurrentPgn = (prevPgn: string, currentPgn: string) => {
	if (currentPgn === prevPgn) {
		return true;
	}

	// todo: compare pgn headers
	const prevHeaders = parseHeaders(prevPgn);
	const currentHeaders = parseHeaders(currentPgn);

	// check if the headers are the same
	for (const key in prevHeaders) {
		console.log(key, prevHeaders[key], currentHeaders[key])
		if (prevHeaders[key] !== currentHeaders[key]) {
			console.error(`Header ${key} is different: prev ${prevHeaders[key]} !== current ${currentHeaders[key]}`)
			return false;
		}
	}

	// prevPgn is X moves behind currentPgn
	// check if all the moves in prevPgn are in currentPgn
	const prevChess = new Chess();
	prevChess.loadPgn(prevPgn);
	const currentChess = new Chess();
	currentChess.loadPgn(currentPgn);
	const currentMoves = currentChess.history();
	const prevMoves = prevChess.history();
	let index = 0;
	for (const move of prevMoves) {
		if (currentMoves[index] !== move) {
			console.error(`Move ${index} is different: prev ${move} !== current ${currentMoves[index]}`)
			return false;
		}
		index++;
	}

	return true;
};
