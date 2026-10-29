package org.unividuell.countdown.core

import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus

/**
 * A real [org.springframework.transaction.support.TransactionTemplate] over a manager that does
 * nothing but say when it is inside a transaction. The service's own path stays unstubbed -- what
 * is faked is the database, not the boundary being tested.
 */
internal class RecordingTransactionManager : PlatformTransactionManager {
    val events = mutableListOf<String>()
    var active = false
        private set

    override fun getTransaction(definition: TransactionDefinition?): TransactionStatus {
        events += "begin"
        active = true
        return SimpleTransactionStatus()
    }

    override fun commit(status: TransactionStatus) {
        events += "commit"
        active = false
    }

    override fun rollback(status: TransactionStatus) {
        events += "rollback"
        active = false
    }
}
