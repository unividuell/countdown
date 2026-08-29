package org.unividuell.countdown.core.gamelab.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameTypeHandle
import org.unividuell.countdown.core.game.GuessAction
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.SOLUTION_ASSET_KEY
import org.unividuell.countdown.core.game.Vote
import org.unividuell.countdown.core.game.VoteTally
import org.unividuell.countdown.core.game.awardFor
import org.unividuell.countdown.core.game.effectiveQualifies
import org.unividuell.countdown.core.game.guessActionFor
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.NullNode
import java.util.UUID

/**
 * The lab's only orchestration: resolve the community the same way every other module does, look up
 * the game in the **real** catalogue, choose the round, and assemble the response.
 *
 * What the lab adds to a real round is a choice where the real one has a clock: seed and phase come
 * from the URL instead of from the community's grid. Everything after that choice — the draw, the
 * payload, the verdict, the award rule, the re-evaluation, the solution gate — is the framework's,
 * not the lab's. That is what makes „what the lab shows is what the game shows“ a property rather
 * than a promise.
 *
 * Community context comes from the `community` module's PUBLIC api (`CommunityQuery` +
 * `MembershipQuery` + `MemberIdentityQuery`), never from `community.internal` — `CountdownService`
 * is the precedent.
 */
@Service
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val identities: MemberIdentityQuery,
    private val store: LabRoundStore,
    private val catalog: GameCatalog,
) {

    fun open(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val snapshot = store.open(communityId = communityId, gameId = gameId, round = round)
        // No stamp here on purpose: landing on the lab page is not a deliberate reveal, the same
        // distinction `useRound.ts`'s `sealed` face draws for a real round. [reveal] is the one call
        // that stamps.
        return respond(
            communityId = communityId,
            handle = handle,
            snapshot = snapshot,
            me = userId,
        )
    }

    /**
     * The lab's own explicit reveal, mirroring `PlayService.reveal`: starts this tester's clock,
     * once — `markOpened` is `putIfAbsent`, so a repeat call is a no-op. Meaningless but harmless for
     * a game that never asked for one; nothing calls it in that case, since the lab page never shows
     * the button.
     */
    fun reveal(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val snapshot = store.open(communityId = communityId, gameId = gameId, round = round)
        // After store.open() on purpose, same reasoning [open] used to carry: that call is what
        // decides tookOverRound, and marking first would make this method's own eviction check land
        // on an already-evicted round.
        store.markOpened(communityId = communityId, gameId = gameId, round = round, userId = userId)
        return respond(
            communityId = communityId,
            handle = handle,
            snapshot = snapshot,
            me = userId,
        )
    }

    fun guess(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
        guess: JsonNode,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        // The round this request will actually play — the stored one if the key matches, `round`
        // itself if it switches seed/phase (roundFor() never creates or evicts). Judging happens
        // against this rather than against a mutation, and `record` is then told to store the same
        // round it was judged against, so the two can never describe different rounds: not the
        // stored one while filing the entry under a freshly chosen one, and not the other way round.
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        val stage = store.stageOf(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        // Whether this round needs a deliberate reveal, checked before judging: a game that asked for
        // one must have it on record before any guess counts, the same guard `PlayService.guess` gets
        // for free from a missing play row. The lab keeps no row, so it asks the store's own stamp.
        val timed = handle.requiresReveal(playing.params)
        if (timed &&
            !store.hasOpened(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        ) {
            throw LabNotRevealedException()
        }
        val judgement = handle.judge(params = playing.params, guess = guess)
        val stages = handle.stages(playing.params)
        // Judged and (on advance) discarded on purpose: in phase one a wrong guess below the last
        // stage only burns the stage — the same rule `PlayService.guess` applies to a real round.
        if (guessActionFor(
                rule = playing.award.rule, qualifies = judgement.qualifies, stage = stage, stages = stages,
            ) == GuessAction.ADVANCE_STAGE
        ) {
            val advanced = store.advanceStage(
                communityId = communityId, gameId = gameId, round = playing, userId = userId, expected = stage,
            )
            if (!advanced) throw LabStageMovedOnException()
            return respond(
                communityId = communityId, handle = handle,
                snapshot = store.open(communityId = communityId, gameId = gameId, round = playing),
                me = userId,
            )
        }
        // A staged game's distance is the stage, and the store never sees stages; a timed game's is
        // the duration since reveal, computed by the store from its own stamp — `timed` is already
        // resolved above. One adjustment here, one flag passed down — the same split `PlayService`
        // makes.
        val adjusted = if (stages > 1) judgement.copy(deviation = stage.toDouble()) else judgement
        val result = store.record(
            communityId = communityId, gameId = gameId, round = playing,
            userId = userId, guess = guess, judgement = adjusted, timed = timed,
        )
        return when (result) {
            is RecordResult.Recorded -> respond(
                communityId = communityId, handle = handle, snapshot = result.snapshot, me = userId,
            )
            RecordResult.AlreadyGuessed -> throw AlreadyGuessedException()
        }
    }

    /** Voluntary stage advance — the lab's own "skip", replaying `PlayService.skip`'s guard. */
    fun skip(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
        fromStage: Int,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        val stages = handle.stages(playing.params)
        // No skip off the top: the exits up there are the terminal guess, or giving up.
        if (fromStage < 0 || fromStage >= stages - 1) throw LabStageMovedOnException()
        val advanced = store.advanceStage(
            communityId = communityId, gameId = gameId, round = playing, userId = userId, expected = fromStage,
        )
        if (!advanced) throw LabStageMovedOnException()
        return respond(
            communityId = communityId, handle = handle,
            snapshot = store.open(communityId = communityId, gameId = gameId, round = playing),
            me = userId,
        )
    }

    /** The explicit exit without an answer: spends the guess, scores 0, opens the solution gate. */
    fun giveUp(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        val stage = store.stageOf(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        val result = store.record(
            communityId = communityId, gameId = gameId, round = playing, userId = userId,
            guess = NullNode.instance,
            judgement = Judgement(qualifies = false, deviation = stage.toDouble(), outcome = null),
            timed = false,
        )
        return when (result) {
            is RecordResult.Recorded -> respond(
                communityId = communityId, handle = handle, snapshot = result.snapshot, me = userId,
            )
            RecordResult.AlreadyGuessed -> throw AlreadyGuessedException()
        }
    }

    /**
     * One of the round's binary assets. The gate is framework state, replayed exactly like
     * `PlayService.asset`: unlocked stages stay fetchable (`key` <= the tester's stage), the solution
     * asset opens once the tester has an entry of their own — guessed or given up, either spends it.
     */
    fun asset(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
        key: Int,
    ): RoundAsset {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        val stage = store.stageOf(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        val snapshot = store.open(communityId = communityId, gameId = gameId, round = playing)
        val hasGuessed = snapshot.entries.any { it.userId == userId }
        val allowed = if (key == SOLUTION_ASSET_KEY) hasGuessed else key in 0..stage
        if (!allowed) throw LabAssetForbiddenException()
        val assets = store.assetsOf(
            communityId = communityId, gameId = gameId, round = playing,
            produce = { handle.produceAssets(playing.params) },
        )
        return assets[key] ?: throw LabAssetNotFoundException()
    }

    fun resetRound(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        return respond(
            communityId = communityId,
            handle = handle,
            snapshot = store.resetRound(communityId = communityId, gameId = gameId, round = round),
            me = userId,
        )
    }

    fun forgetMine(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = userId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        return respond(
            communityId = communityId,
            handle = handle,
            snapshot = store.forget(
                communityId = communityId, gameId = gameId, round = round, userId = userId,
            ),
            me = userId,
        )
    }

    /**
     * Casting, changing, or withdrawing a ballot — the lab's twin of `ReviewService.vote`. Refuses a
     * self-vote and a voter without an entry of their own, same as the real round; a game that does
     * not allow review at all is refused before either of those.
     */
    fun vote(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        voterUserId: UUID,
        isSuperAdmin: Boolean,
        targetUserId: UUID,
        value: Vote?,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = voterUserId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        if (!handle.allowsPeerReview(playing.params)) throw LabReviewNotOpenException()
        if (targetUserId == voterUserId) throw LabReviewNotAllowedException("you cannot vote on your own tip")
        val snapshot = store.open(communityId = communityId, gameId = gameId, round = playing)
        if (snapshot.entries.none { it.userId == voterUserId }) {
            throw LabReviewNotAllowedException("you have not played this round")
        }
        val updated = store.vote(
            communityId = communityId, gameId = gameId, round = playing,
            targetUserId = targetUserId, voterUserId = voterUserId, value = value,
        ) ?: throw LabReviewNotAllowedException("there is no tip to vote on")
        return respond(communityId = communityId, handle = handle, snapshot = updated, me = voterUserId)
    }

    /**
     * The game master's verdict on one tip — the lab's twin of `ReviewService.override`, minus the
     * admin check: in the lab everybody is the game master, so the only gates left are a game that
     * allows review at all and a tip to override.
     */
    fun override(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        adminId: UUID,
        isSuperAdmin: Boolean,
        targetUserId: UUID,
        value: Boolean?,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(
            slug = slug, gameId = gameId, userId = adminId, isSuperAdmin = isSuperAdmin,
        )
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        val playing = store.roundFor(communityId = communityId, gameId = gameId, requested = round)
        if (!handle.allowsPeerReview(playing.params)) throw LabReviewNotOpenException()
        val updated = store.override(
            communityId = communityId, gameId = gameId, round = playing,
            targetUserId = targetUserId, value = value,
        ) ?: throw LabReviewNotAllowedException("there is no tip to override")
        return respond(communityId = communityId, handle = handle, snapshot = updated, me = adminId)
    }

    /**
     * The one gate for every action above, [guess] included: unlike `PlayService.playable`, which
     * never lets a super-admin skip membership before a write because a real `CLOSEST_ONLY` round
     * would move every member's points to zero for a guess that never shows up in the standings, a
     * super-admin here may guess without being a member. Deliberate, not an oversight: lab points are
     * not standings, and the person running a game review from outside the community is exactly who
     * this bypass is for.
     */
    private fun resolve(
        slug: String,
        gameId: String,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): Pair<UUID, GameTypeHandle<*>> {
        val community = communities.findBySlug(slug) ?: throw LabAccessDeniedException()
        val id = requireNotNull(community.id) { "a persisted community always has an id" }
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = id, userId = userId)) {
            throw LabAccessDeniedException()
        }
        val handle = catalog.handle(gameId) ?: throw UnknownLabGameException("no game '$gameId'")
        return id to handle
    }

    /**
     * The lab's substitute for a round grid. `awardFor` decides the rule and the stake — the lab picks
     * the phase, never the points — and it needs a round number to do that, so the lab pretends every
     * round is [LAB_ROUND_NUMBER]. In phase two the threshold sits on that same number, which is the
     * first round of phase two and therefore its lowest stake; the number is arbitrary, the fact that
     * it comes out of the real function is not.
     */
    private fun chooseRound(handle: GameTypeHandle<*>, seed: Int, phase: Phase): LabRound {
        val award: Award = awardFor(
            roundNumber = LAB_ROUND_NUMBER,
            phaseTwoStartRound = if (phase == Phase.TWO) LAB_ROUND_NUMBER else null,
        )
        return LabRound(
            seed = seed,
            phase = phase,
            params = handle.draw(
                random = GameRandom.fromSeed(seed),
                context = RoundContext(roundNumber = LAB_ROUND_NUMBER, phase = phase),
            ),
            award = award,
        )
    }

    private fun respond(
        communityId: UUID,
        handle: GameTypeHandle<*>,
        snapshot: LabRoundSnapshot,
        me: UUID,
    ): LabRoundResponse {
        val mine = snapshot.entries.firstOrNull { it.userId == me }
        // Withheld, not filtered client-side, and unconditional: there is no game for which showing
        // another tester's guess before one's own is right, so there is no switch to get it wrong
        // with. A payload the browser never receives cannot be read out of the network tab either.
        val visible = if (mine == null) emptyList() else snapshot.entries.filter { it.userId != me }
        val shown = visible + listOfNotNull(mine)
        // Voters get names too — they may not be among the players this response otherwise shows.
        val byId = identities.of(
            communityId = communityId,
            userIds = shown.map { it.userId } + shown.flatMap { it.votes.keys },
        )
        // A tester whose user row vanished mid-session drops out of the list rather than taking the
        // whole page down with them.
        fun dtoOf(entry: LabEntry) = byId[entry.userId]?.let { identity ->
            LabEntryDto(
                userId = entry.userId,
                username = identity.username,
                avatar = identity.avatar,
                guess = entry.guess,
                outcome = entry.outcome,
                points = entry.points,
                at = entry.at,
                stage = entry.stage,
                durationMs = entry.durationMs,
                votes = entry.votes.mapNotNull { (voterId, value) ->
                    byId[voterId]?.let { LabVoteView(userId = voterId, username = it.username, value = value) }
                }.sortedBy { it.username },
                // `!effectiveQualifies(...)`, not `struckOut(...)` alone, so an override shows up here
                // exactly as it shows up in the scoring — one rule, read twice, never two rules.
                struck = !effectiveQualifies(
                    adminOverride = entry.adminOverride,
                    qualifies = entry.qualifies,
                    tally = VoteTally.of(entry.votes.values.toList()),
                ),
                adminOverride = entry.adminOverride,
            )
        }

        // Revealed already if the game never asked for a deliberate one; otherwise the store's own
        // stamp is the only truth — a peek, so a response never mutates what it is only reporting on.
        val revealed = !handle.requiresReveal(snapshot.round.params) ||
            store.hasOpened(communityId = communityId, gameId = handle.id, round = snapshot.round, userId = me)

        return LabRoundResponse(
            seed = snapshot.round.seed,
            phase = snapshot.round.phase,
            game = handle.id,
            displayName = handle.displayName,
            awardRule = snapshot.round.award.rule,
            awardPoints = snapshot.round.award.points,
            // Withheld until revealed, the same way solution is withheld until guessed: for a game
            // that gates on a reveal, the payload IS the board, so sending it early would make the
            // click a formality rather than the thing that actually protects the board.
            payload = if (revealed) handle.present(snapshot.round.params) else null,
            // The one condition, evaluated server-side: the viewer has an entry of their own.
            // Whoever deletes their guess stands in front of the gate again.
            solution = if (mine == null) null else handle.solution(snapshot.round.params),
            me = mine?.let(::dtoOf),
            others = visible.mapNotNull(::dtoOf),
            tookOverRound = snapshot.tookOverRound,
            myStage = store.stageOf(communityId = communityId, gameId = handle.id, round = snapshot.round, userId = me),
            revealed = revealed,
            // Always true: in the lab everybody is the game master, the one deliberate difference
            // from the product — the lab models no roles anywhere.
            canOverride = true,
        )
    }

    private companion object {
        /**
         * The round every lab round pretends to be. The lab has no grid, and `awardFor` needs a
         * number; which number it is only shifts phase two's stake, and the lab is about the rule.
         */
        const val LAB_ROUND_NUMBER = 12
    }
}
