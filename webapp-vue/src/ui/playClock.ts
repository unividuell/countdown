/**
 * What the band's board shows instead of the round countdown: a timed play, running since the
 * instant its clock started — `me.revealedAt` in a real round. `null` — the countdown itself — is
 * every other caller's case.
 */
export type PlayClock = { phase: 'running'; since: string }
