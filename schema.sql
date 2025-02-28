DROP TABLE IF EXISTS Games;
CREATE TABLE IF NOT EXISTS Games (
	GameId INTEGER PRIMARY KEY AUTOINCREMENT,
	ContractGameId INTEGER NOT NULL,
	ContractAddress TEXT NOT NULL,
	DurableObjectId TEXT,
	DisplayGameId TEXT,
	Player1Address TEXT,
	Player2Address TEXT,
	CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (ContractGameId, ContractAddress)
);

-- ALTER TABLE Games ADD COLUMN ContractGameId INTEGER;
-- ALTER TABLE Games ADD COLUMN ContractAddress TEXT;
