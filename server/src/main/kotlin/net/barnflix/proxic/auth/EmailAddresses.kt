package net.barnflix.proxic.auth

import java.util.UUID
import javax.sql.DataSource

/**
 * Spec 0026 — each account's email address, where a password reset goes.
 * Apart from [Accounts] because it is a different question: not who
 * someone is, but how to reach them.
 */
class EmailAddresses(private val dataSource: DataSource) {
    /** The address, or null when the account has none. */
    fun of(userId: UUID): String? =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT email FROM app_user WHERE user_id = ?").use {
                it.setObject(1, userId)
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
        }

    /** [email] already normalised ([Emails.normalize]). */
    fun set(
        userId: UUID,
        email: String,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE app_user SET email = ? WHERE user_id = ?").use {
                it.setString(1, email)
                it.setObject(2, userId)
                it.executeUpdate()
            }
        }
    }

    /** The account, by id: the Admin page and a reset link know the id, not the username. */
    fun user(userId: UUID): User? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT username, display_name, role, status FROM app_user WHERE user_id = ?",
            ).use {
                it.setObject(1, userId)
                it.executeQuery().use { rows ->
                    if (!rows.next()) return null
                    User(
                        userId = userId,
                        username = rows.getString(1),
                        displayName = rows.getString(2),
                        role = Role.valueOf(rows.getString(3)),
                        status = AccountStatus.valueOf(rows.getString(4)),
                    )
                }
            }
        }
}
