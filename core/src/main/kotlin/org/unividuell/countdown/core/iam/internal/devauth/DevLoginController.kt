package org.unividuell.countdown.core.iam.internal.devauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
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
class DevLoginController(private val users: UserRepository) {

    private val securityContextRepository = HttpSessionSecurityContextRepository()

    @GetMapping("/login/github", produces = [MediaType.TEXT_HTML_VALUE])
    @ResponseBody
    fun picker(request: HttpServletRequest): String {
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        val buttons = users.findByGithubLoginIn(SEED_LOGINS).joinToString("\n") { u ->
            val label = HtmlUtils.htmlEscape(u.username)
            """<form method="post" action="/login/github/as">
                 <input type="hidden" name="_csrf" value="${csrf.token}"/>
                 <input type="hidden" name="login" value="${HtmlUtils.htmlEscape(u.githubLogin)}"/>
                 <button type="submit">$label</button>
               </form>"""
        }
        return """<!doctype html><html><head><meta charset="utf-8"><title>Test login</title>
          <style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0}
          .card{border:1px solid #ddd;border-radius:8px;padding:24px;min-width:260px;text-align:center}
          h1{font-size:1rem;margin:0 0 16px} form{margin:6px 0} button{width:100%;padding:8px;cursor:pointer}</style>
          </head><body><div class="card"><h1>Test-Login (nicht prod)</h1>$buttons</div></body></html>"""
    }

    @PostMapping("/login/github/as")
    fun loginAs(@RequestParam login: String, request: HttpServletRequest, response: HttpServletResponse): RedirectView {
        val user = users.findByGithubLogin(login) ?: error("unknown test user: $login")
        val principal = CountdownOAuth2User(user, mapOf("login" to user.githubLogin))
        val auth = OAuth2AuthenticationToken(principal, principal.authorities, "github")
        val context = SecurityContextHolder.createEmptyContext().apply { authentication = auth }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        return RedirectView("/")
    }

    companion object { val SEED_LOGINS = listOf("Fry", "leela", "Bender", "prof", "amy") }
}
