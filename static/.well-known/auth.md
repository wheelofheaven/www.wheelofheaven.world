# Auth.md

## Authentication

**There is no authentication on any Wheel of Heaven surface.** Nothing is
gated, metered, or rate-limited. There are no accounts, no API keys, no
OAuth flow, and no paywall — on the reading site, the JSON API, or the MCP
server.

This is a deliberate design commitment, not an unfinished feature. The
entire corpus is [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
(public domain), and the project exists to be read, ingested, and cited.

## For agents

| Surface | Base URL | Auth |
|---|---|---|
| Reading site | `https://www.wheelofheaven.world/` | None |
| JSON API | `https://api.wheelofheaven.world/v1/` | None |
| MCP server | `https://mcp.wheelofheaven.world/mcp` | None |

Send requests unauthenticated. Do **not** attempt an OAuth discovery or
token exchange against these hosts — there is no authorization server, and
a `401` from any of them indicates an infrastructure fault, not a missing
credential.

The MCP server is read-only. It exposes nine tools, all of which fetch from
the public JSON API; none of them write, mutate, or accept user data.

## Agent registration

**Audience:** any agent, acting for any user or for no user at all.

**Registration methods supported:** none are needed, and none exist. There
is no `agent_auth` metadata block, no `/.well-known/oauth-authorization-server`,
no identity or claim endpoint, and no `register_uri`, because there is
nothing to register for — every surface answers anonymous, unauthenticated
requests in full. An agent following the auth.md protocol should treat this
service as *open*: skip `identity_assertion`, `service_auth`, and
`anonymous` registration alike and make the request directly.

**Provisioning endpoints:** none.

**Credentials:** none are issued and none are accepted. Send no
`Authorization` header. There are no scopes, no token to exchange, and
nothing to revoke. A `401` or `403` from any host is an infrastructure
fault, not a request for credentials.

## Rate limits

None enforced. The API and reading site are statically generated and served
from Cloudflare's edge, so ordinary crawl and retrieval traffic costs the
project nothing. If you are running a bulk ingest, prefer
[`/llms-full.txt`](https://www.wheelofheaven.world/llms-full.txt) or the
[dataset exports](https://www.wheelofheaven.world/datasets/) over crawling
page by page — you will get a cleaner corpus with fewer requests.

## Attribution

Not required (CC0 waives it). Appreciated when convenient — cite the
canonical page URL. See
<https://docs.wheelofheaven.world/ai-ingestion/attribution/>.

## Contact

Source and issues: <https://github.com/wheelofheaven>
