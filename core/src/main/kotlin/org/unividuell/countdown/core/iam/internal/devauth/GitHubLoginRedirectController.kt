package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.servlet.view.RedirectView

/** When test-auth is off, the single SPA login button just goes to real GitHub OAuth. */
@Controller
@ConditionalOnProperty("app.test-auth.enabled", havingValue = "false", matchIfMissing = true)
class GitHubLoginRedirectController {
    @GetMapping("/login/github")
    fun toGitHub(): RedirectView = RedirectView("/oauth2/authorization/github")
}
