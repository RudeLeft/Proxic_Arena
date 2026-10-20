# P6-BL — production worker privacy, 2026-10-20

Build 21d3fa1 on the owner's Unraid host, behind the Cloudflare tunnel
for proxic.barnflix.net. The home address is left out on purpose.

## Inside: what listens (owner ran it on the host)

`docker ps` ports: `arena-server` publishes 8765->8080 only;
`postgres` publishes nothing (5432 reachable from the compose network
only). `/proc/net/tcp{,6}` in the arena-server container, decoded:

| state  | address                  | what                                   |
|--------|--------------------------|----------------------------------------|
| LISTEN | :::8080                  | the Ktor server -- the only listener   |
| LISTEN | 127.0.0.11:44775         | Docker's embedded DNS, container-only  |
| ESTAB  | 172.18.0.3 -> 172.18.0.2:5432 | the server's database pool        |
| TIME_WAIT | 127.0.0.1 -> :8080    | the container's own health checks      |

The Forge worker opens no socket: it is a child process spoken to over
stdin/stdout (`WorkerMain`), and its code has no ServerSocket, bind or
HTTP server (grep over forge-worker/src/main/java).

## Outside: from a different network (phone hotspot)

The PC's public address changed from the home address to the phone
carrier's, so these ran from the internet, not the LAN.

| test                                                    | result                 |
|---------------------------------------------------------|------------------------|
| https://proxic.barnflix.net/api/health/ready            | 200, via Cloudflare (104.21.51.80) |
| home address :8765 (arena-server, direct)               | no connection (timeout) |
| home address :5432 (database)                           | no connection (timeout) |
| home address :80 and :443                               | no connection (timeout) |
| https://proxic.barnflix.net forced to the home address  | no connection (timeout) |

The only public path is the Cloudflare tunnel to the web application;
no Forge runtime port or endpoint exists, and the server's own port is
not reachable from outside.
