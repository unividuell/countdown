package org.unividuell.countdown.core.iam.internal.devauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.servlet.view.RedirectView
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.springframework.web.util.HtmlUtils

@Controller
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class DevLoginController(
    private val users: UserRepository,
    private val seeder: TestUserSeeder,
) {

    private val logger = KotlinLogging.logger {}

    private val securityContextRepository = HttpSessionSecurityContextRepository()

    @GetMapping("/login/github", produces = ["text/html;charset=UTF-8"])
    @ResponseBody
    fun picker(
        request: HttpServletRequest,
        @RequestParam(required = false) redirect: String?,
    ): String {
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        val byLogin = users.findByGithubLoginIn(seeder.seedLogins).associateBy { it.githubLogin }
        val buttons = seeder.seedUsers.mapNotNull { seed ->
            val user = byLogin[seed.login] ?: run {
                // Dropping one button beats a broken page, but a silently absent button is the
                // hardest kind of dev-tool bug to diagnose — so say which login went missing.
                logger.warn { "no database row for seed login '${seed.login}' — omitting its button" }
                return@mapNotNull null
            }
            """<form method="post" action="/login/github/as">
                 <input type="hidden" name="_csrf" value="${csrf.token}"/>
                 <input type="hidden" name="login" value="${HtmlUtils.htmlEscape(seed.login)}"/>
                 <input type="hidden" name="redirect" value="${HtmlUtils.htmlEscape(redirect ?: "")}"/>
                 <button type="submit">
                   <span class="chip" aria-hidden="true">${seed.emoji}</span>
                   <span>${HtmlUtils.htmlEscape(user.username)}</span>
                 </button>
               </form>"""
        }.joinToString("\n")
        return """<!doctype html><html lang="de"><head><meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Test-Login</title>
          <style>
            :root{color-scheme:light dark;--bg:#fafaf9;--card:#fff;--border:#e7e5e4;--fg:#1c1917;--hover:#f5f5f4}
            @media (prefers-color-scheme:dark){
              :root{--bg:#1c1917;--card:#292524;--border:#44403c;--fg:#fafaf9;--hover:#44403c}
            }
            *{box-sizing:border-box}
            body{margin:0;padding:1.5rem 1rem;min-height:100dvh;display:flex;align-items:center;justify-content:center;
                 font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
            .card{width:100%;max-width:22rem;background:var(--card);border:1px solid var(--border);
                  border-radius:12px;padding:1.25rem}
            h1{font-size:1.125rem;font-weight:600;margin:0 0 1rem}
            form{margin:0 0 .5rem}
            form:last-of-type{margin-bottom:0}
            button{display:flex;align-items:center;gap:.75rem;width:100%;min-height:44px;padding:.5rem .75rem;
                   border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;
                   font:inherit;text-align:left;cursor:pointer}
            button:hover{background:var(--hover)}
            .chip{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;
                  background:#e7e5e4;font-size:15px;line-height:1}
          </style></head>
          <body><div class="card"><h1>Test-Login</h1>$buttons</div></body></html>"""
    }

    @PostMapping("/login/github/as")
    fun loginAs(
        @RequestParam login: String,
        @RequestParam(required = false) redirect: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): RedirectView {
        // permitAll: only seed logins are resolvable here, or anyone could assume any registered
        // identity by name (and, since TestUserSeeder, potentially a super-admin one).
        val user = users.findByGithubLogin(login)?.takeIf { login in seeder.seedLogins }
            ?: error("unknown test user: $login")
        val principal = CountdownOAuth2User(user, mapOf("login" to user.githubLogin))
        val auth = OAuth2AuthenticationToken(principal, principal.authorities, "github")
        val context = SecurityContextHolder.createEmptyContext().apply { authentication = auth }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        // Expansion off: RedirectView otherwise treats "{...}" in the URL as a URI template and
        // resolves it against the (empty) model, throwing on any redirect containing a brace
        // instead of just redirecting to it.
        return RedirectView(safeRedirect(redirect)).apply { setExpandUriTemplateVariables(false) }
    }

    /**
     * Only same-site absolute paths. `//host` and `/\host` are protocol-relative and leave the
     * site; anything without a leading slash is not a path at all.
     *
     * Tab, CR and LF are rejected outright rather than sanitised, because browsers **strip those
     * characters from a URL before resolving it**: `"/\t/evil.example"` passes a naive prefix
     * check and is then resolved as the protocol-relative `//evil.example`. Checking the raw
     * string is therefore not enough on its own.
     *
     * This endpoint is permitAll, so an unchecked redirect here would be a genuine open redirect
     * even in a dev-only build.
     */
    private fun safeRedirect(candidate: String?): String {
        if (candidate == null) return "/"
        if (candidate.any { it == '\t' || it == '\n' || it == '\r' }) return "/"
        val sameSite = candidate.startsWith("/") &&
            !candidate.startsWith("//") &&
            !candidate.startsWith("/\\")
        return if (sameSite) candidate else "/"
    }
}
