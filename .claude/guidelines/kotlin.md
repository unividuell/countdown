# Kotlin call sites

## From two arguments on, name them

Two positional arguments of the same type compile just as happily swapped:

```kotlin
membershipQuery.isAdmin(id, me.id)      // (communityId, userId)
membershipQuery.isAdmin(me.id, id)      // also valid Kotlin, and not an authorisation check
```

So **a call with two or more arguments uses named arguments.** No review catches the
swapped pair reliably; the parameter name at the call site does.

```kotlin
// no
countdown.forSlug(c.slug, ownerId, false)
CountdownResponse(now, null, edition.startsAtTimezone, null, null)

// yes
countdown.forSlug(slug = c.slug, userId = ownerId, isSuperAdmin = false)
CountdownResponse(
    serverNow = now, startsAt = null, startsAtTimezone = edition.startsAtTimezone,
    round = null, nextRound = null,
)
```

It pays most where the argument is a **literal**: a bare `false`, `null` or `0` says nothing
about which parameter it lands on, and no type checks it.

It also pays where the call site's variable name differs from the parameter's — passing a
community's `name` as an edition's `rawLabel` is a deliberate decision, and
`editions.create(communityId = id, rawLabel = name)` is where it gets stated.

## Where it does not apply

Don't force it — these are noise or impossible:

- **One argument.** `requireNotNull(id)`, `ZoneId.of(zone)`, `logger.warn { … }`.
- **Varargs.** `setOf("A", "B")`, `@ExceptionHandler(A::class, B::class)`.
- **Functions declared in Java.** Kotlin forbids named arguments there — the parameter
  names are not guaranteed in the bytecode.
- **A trailing lambda.** It belongs outside the parentheses, unnamed.
- **`infix` and operator calls.** `actual shouldBe expected`, `key to value`.

Test code is not exempt: a mockk `every { … }` stub, a `@SpringBootTest` fixture builder and a
constructor call in a unit test are calls like any other. The mocked-collaborator constructor in a
plain unit test is in fact a prime case — four repositories of four different types today, two of
the same type after the next change.
