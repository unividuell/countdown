package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration

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
}
