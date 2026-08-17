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
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
import tools.jackson.databind.JsonNode
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
        return respond(
            communityId = communityId,
            handle = handle,
            snapshot = store.open(communityId = communityId, gameId = gameId, round = round),
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
        val judgement = handle.judge(params = playing.params, guess = guess)
        val result = store.record(
            communityId = communityId, gameId = gameId, round = playing,
            userId = userId, guess = guess, judgement = judgement,
        )
        return when (result) {
            is RecordResult.Recorded -> respond(
                communityId = communityId, handle = handle, snapshot = result.snapshot, me = userId,
            )
            RecordResult.AlreadyGuessed -> throw AlreadyGuessedException()
        }
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
        val byId = identities.of(
            communityId = communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId },
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
            )
        }

        return LabRoundResponse(
            seed = snapshot.round.seed,
            phase = snapshot.round.phase,
            game = handle.id,
            displayName = handle.displayName,
            awardRule = snapshot.round.award.rule,
            awardPoints = snapshot.round.award.points,
            payload = handle.present(snapshot.round.params),
            // The one condition, evaluated server-side: the viewer has an entry of their own.
            // Whoever deletes their guess stands in front of the gate again.
            solution = if (mine == null) null else handle.solution(snapshot.round.params),
            me = mine?.let(::dtoOf),
            others = visible.mapNotNull(::dtoOf),
            tookOverRound = snapshot.tookOverRound,
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
