-- DROP TABLE IF EXISTS Games;
-- CREATE TABLE IF NOT EXISTS Games (
-- 	GameId INTEGER PRIMARY KEY AUTOINCREMENT,
-- 	ContractGameId INTEGER,
-- 	DurableObjectId TEXT,
-- 	DisplayGameId TEXT,
-- 	Player1Address TEXT,
-- 	Player2Address TEXT,
-- 	CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

ALTER TABLE Games ADD COLUMN ContractGameId INTEGER;
