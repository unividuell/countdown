package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.MemberPointsQuery

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class MemberPointsConfigurationTest(
    @Autowired val applicationContext: ApplicationContext,
) {
    @Test
    fun `exactly one MemberPointsQuery bean is registered`() {
        val beans = applicationContext.getBeansOfType(MemberPointsQuery::class.java)
        beans.size shouldBe 1
    }

    /**
     * Guards the config-file contract, not the factory: `app.stub-points.enabled` is set in
     * `application-staging.yaml` and nowhere else, so that no production config file has to mention
     * stubbing. Re-adding it to `application.yaml` would silently turn invented points on for every
     * environment — and would force production to override it back to false again.
     */
    @Test
    fun `invented points are off with no profile active, because no shared config file enables them`() {
        val bean = applicationContext.getBean(MemberPointsQuery::class.java)
        bean::class.simpleName shouldBe "RoundPlayPoints"
    }
}
