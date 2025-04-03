const truncateAddress = (address: `0x${string}` | undefined) => {
	if (!address) {
		return "";
	}
	return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
};

export type FarcasterUser = {
	fid: number;
	username: string;
	display_name: string;
	pfp_url: string;
}

export const getFarcasterUserByAddress = async (address: string, env: Env): Promise<FarcasterUser | null> => {
	const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`, {
		headers: {
			'accept': 'application/json',
			'x-api-key': env.NEYNAR_API_KEY,
			'x-neynar-experimental': 'false'
		}
	});

	const data = await response.json();
	console.log(data);
	const lowerCaseAddress = address.toLowerCase();
	if (data && data[lowerCaseAddress] && data[lowerCaseAddress].length > 0) {
		const { fid, username, display_name, pfp_url } = data[lowerCaseAddress][0];
		console.log(`For address ${address}, found user ${username}, ${fid}, ${display_name}, ${pfp_url}`);
		return { fid, username, display_name, pfp_url };
	} else {
		console.log(`For address ${address}, no user found`);
	}
	return null;
};

export const getFarcasterUsersByAddresses = async (addresses: string[], env: Env): Promise<{
	[address: string]: FarcasterUser[]
}> => {
	const response = await fetch(
		`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses.join(',')}`,
		{
			headers: {
				'accept': 'application/json',
				'x-api-key': env.NEYNAR_API_KEY,
				'x-neynar-experimental': 'false'
			}
		}
	);
	if (!response.ok) {
		console.error(`Failed to fetch farcaster users for addresses ${addresses.join(',')}: ${response.statusText}`);
		return {};
	}
	const data = await response.json() as {
		[address: string]: FarcasterUser[]
	};
	console.log(data);
	return data;
};

export const sendFarcasterNotification = async ({ env, player1Address, player2Address, gameId }: { env: Env, player1Address: string, player2Address: string, gameId: string }) => {
	console.log("sendFarcasterNotification", JSON.stringify({ player1Address, player2Address, gameId }));
	if (env.NEYNAR_API_KEY) {
		console.log('NEYNAR_API_KEY is set');
	} else {
		console.error('NEYNAR_API_KEY is not set');
	}
	const [player1Neynar, player2Neynar] = await Promise.all([
		getFarcasterUserByAddress(player1Address, env),
		getFarcasterUserByAddress(player2Address, env)
	]);
	if (player2Neynar) {
		const target_fids = [player2Neynar.fid];
		const player1Username = player1Neynar?.username ? `@${player1Neynar.username}` : truncateAddress(player1Address as `0x${string}`);
		const notification = {
			title: "BasedChess invite ♟️",
			body: `${player1Username} invited you to a game!`,
			target_url: `https://basedchess.xyz/games/${gameId}`,
		};
		const body = JSON.stringify({ target_fids, notification });
		console.log("neynar notification body:", body);

		const response = await fetch(`https://api.neynar.com/v2/farcaster/frame/notifications`, {
			method: 'POST',
			headers: {
				'accept': 'application/json',
				'content-type': 'application/json',
				'x-api-key': env.NEYNAR_API_KEY,
				'x-neynar-experimental': 'false',
			},
			body,
		});
		console.log("neynar publishFrameNotifications response:", JSON.stringify(response));
		const data = await response.json();
		console.log("neynar publishFrameNotifications response data:", JSON.stringify(data));
	}
};

// const test = async () => {
//   const user = await getFarcasterUserByAddress('0x2a99EC82d658F7a77DdEbFd83D0f8F591769cB64');
//   console.log(user);
// };

// test();
