package net.barnflix.proxic.auth

import java.io.PrintWriter
import java.sql.Connection
import java.sql.SQLTransientConnectionException
import java.util.logging.Logger
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * arena-admin with the database down said so in a Java stack trace,
 * after the pool's ten-second wait (2026-11-04). It says one line now.
 * No Docker: a data source that cannot connect is the whole situation.
 */
class AdminToolDatabaseDownTest {
    private object Down : DataSource {
        override fun getConnection(): Connection =
            throw SQLTransientConnectionException("Connection is not available, request timed out after 10000ms.")

        override fun getConnection(
            username: String?,
            password: String?,
        ): Connection = getConnection()

        override fun getLogWriter(): PrintWriter? = null

        override fun setLogWriter(out: PrintWriter?) = Unit

        override fun setLoginTimeout(seconds: Int) = Unit

        override fun getLoginTimeout(): Int = 0

        override fun getParentLogger(): Logger = Logger.getGlobal()

        override fun <T : Any?> unwrap(iface: Class<T>?): T = throw java.sql.SQLException("not a wrapper")

        override fun isWrapperFor(iface: Class<*>?): Boolean = false
    }

    @Test
    fun `a database that cannot be reached is one plain line`() {
        val sessions = Sessions(Down)
        val tool = AdminTool(Accounts(Down, sessions), sessions, Down)

        val result = tool.runSafely(listOf("list"))

        assertEquals(1, result.exitCode)
        assertEquals(
            "The database could not be reached: Connection is not available, request timed out after 10000ms.",
            result.message,
        )
        assertTrue('\n' !in result.message)
    }
}
