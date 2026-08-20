-- How far the player has opened this round's staged content. Framework state: the flow advances
-- it under the same zero-rows-is-a-409 guards as the guess; what a stage MEANS (0.1s ... 15s of
-- audio) is the game's business. Constant 0 for single-stage games like Guess Hue.
ALTER TABLE game.round_plays
    ADD COLUMN stage INT NOT NULL DEFAULT 0;
