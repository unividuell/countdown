# Configuration

About `core/src/main/resources/application*.yaml` and the `@ConfigurationProperties`
classes they bind to.

## No production configuration is under test — boot the app yourself

`core/src/test/resources/application.yaml` **replaces** the main file on the test
classpath; it does not layer over it. Every key the application really runs on is
therefore absent from every `@SpringBootTest`, and a fully green suite is no evidence
that the application can start at all.

- After touching any `application*.yaml` or any `@ConfigurationProperties` field, **run
  it**: `cd core && ./mvnw spring-boot:run`, wait for `Started CoreApplicationKt`, stop
  it. That is the only check there is.
- A key that test *contexts* also need (a feature switch, an auth flag) must be added to
  the test file as well — see [game-lab.md](game-lab.md) for the lab's version of this.

## A suffixed size or duration binds only onto `DataSize` / `Duration`

`max-bytes: 15MB` against a `val maxBytes: Int` fails the boot with
`NumberFormatException: For input string: "15MB"`. Boot's `DataSize` converters fire for
a `DataSize` target only; against a numeric target the string goes straight to
`Integer.parseInt`. Write the plain number (`15728640`) when the property is an
`Int`/`Long`, or declare the property `DataSize`. `30s` against a `Long` fails the same
way.
