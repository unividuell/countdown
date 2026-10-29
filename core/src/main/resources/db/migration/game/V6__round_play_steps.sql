-- The player's input per stage stepped, in order: one entry per stage, JSON null for a step without
-- input (Anspielung's „mehr hören“). Appended in the statement that advances `stage`, so its length
-- is the stage. The game's answer to a step is recomputed from it, never stored.
ALTER TABLE game.round_plays
    ADD COLUMN steps JSONB NOT NULL DEFAULT '[]';
