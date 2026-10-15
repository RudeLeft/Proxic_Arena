# Proxic Arena Build Plan

# Phase 2 — Deck Package Import

**Status:** PROVISIONAL  
**Phase Type:** Production feature  
**Depends On:** Completed and accepted Phase 1  
**Primary Input:** Existing Proxic Deck Builder ZIP export  
**Gameplay:** NOT IMPLEMENTED IN THIS PHASE


> **PROVISIONAL, not LOCKED.** This phase was locked before Phase 0 was
> executed. Phase 0 exists to decide the architecture, so a locked
> specification downstream of it is a guess wearing a lock. Phase 0 has
> been split into `PHASE_00A` (blocking) and `PHASE_00B` (deferred with
> triggers); this phase may be locked once 0A is accepted.
>
> Content is unchanged. Only the status and the dependency notes below
> were added.

**Phase-0A-dependent decisions in this phase:**

- §2.10 already states that Phase 0 Forge decisions remain authoritative.
- Deck → Forge construction depends on 0A.6 (adapter) and 0A.9A (the
  exact-printing lookup API at the new pin).

The ZIP handling, validation, path-traversal and resource-limit rules are
independent of 0A and can be treated as settled.

---

## 2.0 Purpose

Phase 2 adds the first persistent user-content feature to Proxic Arena:

> Import a deck package produced by Proxic Deck Builder.

The existing Deck Builder exports a ZIP containing:

```text
deck TXT file
card PNG images
```

Proxic Arena must accept that package, determine what deck it represents, verify that Forge can identify the cards, safely store the included artwork, and persist the imported deck for later use.

The desired flow is:

```text
Proxic Deck Builder
        │
        ▼
    Export ZIP
        │
        ├── deck TXT
        └── card PNGs
        │
        ▼
Proxic Arena Import
        │
        ├── validate ZIP
        ├── parse deck TXT
        ├── resolve cards through Forge
        ├── associate PNG artwork
        ├── create internal manifest
        └── persist deck
        │
        ▼
Imported Arena Deck
```

Phase 2 does not invent a new deck-package format before inspecting the real existing export.

---

## 2.1 Project Locations

All locked project-location rules remain in force.

### Old Proxic Arena — Reference Only

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

The coding agent may:

```text
READ
INSPECT
COMPARE
COPY USEFUL MATERIAL FROM
```

the old Arena project.

It MUST NOT modify it.

### New Proxic Arena — Production Build

All production work occurs in:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

Permanent rule:

```text
READ OLD
BUILD NEW
```

### Proxic Deck Builder — Strictly Read Only

The existing Deck Builder project is located at:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

The coding agent may use this project only as evidence for the existing deck-export contract.

The coding agent MAY:

```text
read source files
inspect the ZIP exporter
inspect TXT generation
inspect PNG export and naming behavior
inspect existing tests
inspect configuration relevant to export behavior
compare implementation against real exported ZIP packages
```

The coding agent MUST NOT:

```text
edit any file
reformat any file
update dependencies
change exporter behavior
add tests
delete files
rename files
move files
commit changes
write generated files into the project
perform any other modification
```

For Phase 2:

```text
PROXIC DECK BUILDER
=
STRICTLY READ ONLY
```

If Proxic Arena cannot reliably consume the existing export, the coding agent must report the problem and stop for project-owner direction.

It must not solve the problem by changing Proxic Deck Builder.

---

## 2.2 Phase 2 Entry Gate

Do not begin Phase 2 implementation unless:

```text
Phase 0 execution is accepted
Phase 1 implementation is accepted
Phase 1 acceptance tests pass
the Phase 0 Forge decisions are available
the permanent Forge worker boundary exists
the database foundation exists
the React/Ktor foundation exists
```

---

## 2.3 Required Real Deck Builder Export

Before defining the permanent import parser, the coding agent MUST inspect at least one real ZIP produced by the current Proxic Deck Builder.

Prefer multiple representative exports if available.

Useful examples include:

```text
normal 60-card deck
deck with duplicate cards
deck with basic lands
deck with multiple printings if supported
deck containing double-faced cards
Commander deck if Deck Builder supports it
```

The coding agent must not guess the package layout.

---

## 2.4 Real Package Inspection Report

Before writing the production parser, create:

```text
docs/research/phase-02/DECK_BUILDER_EXPORT_INSPECTION.md
```

Document the actual observed package.

At minimum:

```text
ZIP filename convention
files contained in the ZIP
directory structure
deck TXT filename
deck TXT encoding
line-ending format
deck line syntax
quantity syntax
set information if present
collector-number information if present
special section syntax if present
Commander representation if present
sideboard representation if present
PNG filename convention
PNG directory structure
PNG format
how duplicate cards relate to PNG files
how double-faced cards are represented
whether additional metadata files exist
```

Every statement must come from:

```text
a real Deck Builder export
or
the read-only Deck Builder exporter source
```

Do not infer undocumented fields.

---

## 2.5 Inspect Deck Builder Export Code

The coding agent MUST inspect the existing exporter source at:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

when doing so helps establish the package contract.

The source can clarify:

```text
filename construction
text encoding
special characters
deck section ordering
image selection
duplicate handling
double-faced-card handling
export error behavior
```

Inspection is read-only.

No Phase 2 work may modify the Deck Builder project.

---

## 2.6 Existing Format First

The preferred architecture is:

> Proxic Arena adapts to the existing Proxic Deck Builder export where practical.

Do not redesign the exporter merely because a different package would be more convenient for Arena.

If the current export can be imported safely and unambiguously, preserve it unchanged.

---

## 2.7 Insufficient Package Escalation

If inspection proves the existing ZIP lacks information required for reliable import:

**STOP AND ASK THE PROJECT OWNER.**

Report:

```text
PACKAGE CONTRACT PROBLEM

Observed package behavior:

Missing or ambiguous information:

Why Arena cannot reliably infer it:

Forge requirement affected:

Arena-side options:

Deck Builder change that would be required, if any:

Recommendation:
```

The coding agent must not modify Deck Builder.

---

## 2.8 No External Card-Service Dependency

Proxic Arena must not require an external card-information service to import or play an exported deck.

The import path is:

```text
Deck Builder ZIP
      +
Forge
      =
Arena deck
```

A deck import must not depend on reaching a third-party card API.

An external service outage must not prevent an otherwise valid Deck Builder package from being imported.

---

## 2.9 Card Responsibility

The imported package and Forge have separate responsibilities.

### Deck package provides

```text
deck composition
card identity information present in the TXT
card PNG artwork
printing/art choice represented by the export
```

### Forge provides

```text
card rules
gameplay implementation
card resolution
legality mechanisms
game-engine identity
```

Arena must not derive gameplay behavior from the PNG or deck text beyond identifying which Forge cards belong in the deck.

---

## 2.10 Phase 0 Forge Decisions Remain Authoritative

Phase 2 must use the exact card-resolution and printing strategy accepted from Phase 0.

Do not independently invent a second Forge lookup mechanism.

Use the Phase 0 findings for:

```text
card-name lookup
set lookup
collector-number lookup
exact printing
fallback behavior
PaperCard / CardRules identity
double-faced-card identity
```

where applicable.

---

## 2.11 Deck Package Contract

After inspecting and successfully testing the real Deck Builder exports, create:

```text
docs/architecture/DECK_PACKAGE_FORMAT.md
```

This becomes the authoritative interoperability contract between:

```text
Proxic Deck Builder
        ↕
Proxic Arena
```

The document must describe what actually works.

---

## 2.12 Contract Must Cover

At minimum:

```text
archive type
archive structure
deck TXT location
deck TXT encoding
deck-line grammar
quantities
deck sections
card identity
printing identity if available
PNG locations
PNG naming
card-to-image mapping
duplicate-card behavior
multi-face-card behavior
allowed optional files
required files
validation rules
failure behavior
```

---

## 2.13 Do Not Require a Manifest Unless Necessary

Do not require a new file in the Deck Builder ZIP solely because it would make Arena implementation easier.

First determine whether:

```text
deck TXT
+
PNG filenames
```

already provide a reliable contract.

If they do, use them.

If they do not, stop and report the limitation rather than modifying Deck Builder.

---

## 2.14 Arena Internal Manifest

Regardless of the external ZIP structure, Arena SHOULD create its own normalized internal manifest after successful import.

Example concept:

```json
{
  "schema_version": 1,
  "deck_id": "...",
  "display_name": "...",
  "cards": [
    {
      "section": "main",
      "quantity": 4,
      "source_text": "...",
      "forge_identity": "...",
      "asset_id": "..."
    }
  ]
}
```

This is an Arena internal representation.

It does not require changing Deck Builder.

---

## 2.15 Internal Manifest Purpose

The internal manifest gives later phases one stable Arena-owned representation.

Later gameplay code should not repeatedly:

```text
reopen ZIP
reparse TXT
guess PNG filenames
resolve the same cards again
```

every time a match starts.

Import should perform normalization once.

---

## 2.16 Internal Manifest Is Not a Rules Source

The manifest may store:

```text
identity
quantity
section
Forge lookup result
art asset reference
```

It must not store independent Magic rules or card behavior.

Forge remains authoritative.

---

## 2.17 Import Workflow

The production import should conceptually perform:

```text
1. Receive ZIP

2. Store upload in isolated temporary location

3. Validate archive structure and limits

4. Extract safely to staging directory

5. Locate required deck TXT

6. Parse deck TXT

7. Resolve every deck entry through Forge

8. Match required PNGs

9. Validate PNGs

10. Build Arena internal manifest

11. Persist database records

12. Promote staged files to permanent storage

13. Return successful import result
```

If any mandatory step fails:

```text
import fails
partial deck is not exposed
staging artifacts are cleaned up
```

---

## 2.18 Import Must Be Atomic From the User's Perspective

A deck must not appear as successfully imported when:

```text
half its files copied
database insert failed
Forge resolution failed
manifest creation failed
required artwork is missing
```

A deck becomes visible only after the complete import succeeds.

---

## 2.19 Upload Endpoint

Create a production API such as:

```text
POST /api/decks/import
```

using multipart file upload.

The exact endpoint name may change if the project's established API conventions require it.

The request contains one Deck Builder ZIP.

---

## 2.20 Public Exposure Before Authentication

Phase 2 occurs before the dedicated authentication/access-control phase.

Therefore:

> Deck mutation endpoints MUST NOT be exposed as unrestricted anonymous public endpoints on `arena.barnflix.net`.

Phase 2 must support full local/development testing.

Until authentication is implemented, production deployment must keep deck-import mutation functionality disabled or otherwise inaccessible from the public internet.

Do not create a temporary authentication system for Phase 2.

---

## 2.21 Feature Availability Configuration

If needed, Phase 2 may introduce an explicit configuration such as:

```text
DECK_IMPORT_ENABLED=false
```

for production before authentication exists.

Development/testing may enable it.

The name may follow project configuration conventions.

The important rule is:

```text
unauthenticated public ZIP upload
=
not allowed
```

---

## 2.22 No Temporary Authentication System

Do not introduce:

```text
hardcoded password
query-string secret
shared magic URL
browser-stored admin key
temporary username system
```

simply to expose Phase 2 publicly.

Proper authentication/access control belongs in the dedicated account/authentication phase.

---

## 2.23 Future Ownership and Sharing Model

Imported decks are intended eventually to belong to the authenticated user who uploaded them.

Users will also be able to share decks with other users through the future:

```text
Deck Depot
```

Phase 2 must not invent temporary ownership semantics before authenticated user identity exists.

The intended later model is conceptually:

```text
User
  │
  └── owns Deck

Deck
  │
  └── may be shared with other Users
```

Ownership and sharing policy are not implemented in Phase 2.

---

## 2.24 Planned Ownership Phases

The intended sequence is:

```text
Phase 2
Deck Package Import
        ↓
stable imported-deck identity and storage

Phase 3
Accounts & Authentication
        ↓
authenticated user identity
authorization foundation

Phase 4
Deck Depot
        ↓
deck ownership
user deck library
sharing
share revocation
Deck Depot UI
access-controlled deck/artwork APIs
```

The exact later phase specifications remain subject to their own review and locking.

---

## 2.25 No Fake Owner in Phase 2

Do not create:

```text
dummy user
user_id = 1
anonymous owner row
temporary account
placeholder owner foreign key requiring fake data
```

merely to anticipate Deck Depot.

Phase 2 decks exist as stable imported deck objects without user ownership.

A later database migration will add ownership when the authenticated user model exists.

---

## 2.26 ZIP File Validation

Never trust:

```text
filename
extension
browser MIME type
ZIP entry paths
```

merely because the Deck Builder normally creates valid packages.

Validate the actual upload.

---

## 2.27 ZIP Signature Validation

The upload must actually be a supported ZIP archive.

A file called:

```text
mydeck.zip
```

is not sufficient evidence.

---

## 2.28 ZIP Path Traversal Protection

Reject archive entries attempting paths such as:

```text
../
../../
/absolute/path
C:\...
```

No ZIP entry may write outside the import staging directory.

---

## 2.29 ZIP Symlink Protection

Reject or safely ignore ZIP entries representing symbolic links or equivalent filesystem indirection.

Imported packages must not be able to create links into host/container filesystem locations.

---

## 2.30 ZIP Resource Limits

After inspecting representative real exports, establish reasonable configurable limits for:

```text
maximum uploaded ZIP size
maximum uncompressed size
maximum file count
maximum individual file size
maximum deck TXT size
maximum PNG count
maximum PNG size
```

Do not choose arbitrary tiny values.

Measure normal Deck Builder exports and provide reasonable safety margin.

---

## 2.31 ZIP Bomb Protection

The importer must protect against pathological compression ratios and unexpectedly large decompressed content.

Reject packages that exceed configured extraction limits.

---

## 2.32 Nested Archives

Unless the real Deck Builder package requires them, nested archives are unsupported.

Do not recursively extract arbitrary ZIPs inside the uploaded ZIP.

---

## 2.33 Encrypted Archives

Unless the current Deck Builder deliberately creates encrypted archives, reject encrypted ZIP entries.

---

## 2.34 Duplicate Archive Paths

Reject ambiguous duplicate paths.

An archive must not contain two different files that normalize to the same effective path.

---

## 2.35 Case-Collision Handling

Because Deck Builder and Arena development may involve Windows while deployment uses Linux, test filenames that differ only by case.

Example:

```text
Lightning Bolt.png
lightning bolt.png
```

The importer must not produce platform-dependent behavior.

---

## 2.36 Unicode Filename Handling

Validate names containing:

```text
apostrophes
commas
hyphens
accented characters
Unicode punctuation
```

where real Magic card names or exported files require them.

Do not assume ASCII-only card names.

---

## 2.37 Temporary Extraction Directory

Every import receives an isolated staging directory.

Conceptually:

```text
/data/temp/deck-imports/<import-id>/
```

No files become permanent until validation succeeds.

---

## 2.38 Cleanup

After:

```text
successful import
failed import
parser exception
Forge-resolution failure
client disconnect
```

temporary files must be cleaned up appropriately.

Stale abandoned import directories should not accumulate indefinitely.

---

## 2.39 Deck TXT Encoding

Determine the actual encoding used by Deck Builder.

The importer must explicitly support that encoding.

Do not rely on platform-default text encoding.

If UTF-8 is used, parse UTF-8 explicitly.

Handle a BOM if the current exporter creates one.

---

## 2.40 Line Ending Handling

If applicable, support normal line-ending differences:

```text
CRLF
LF
```

without changing card meaning.

---

## 2.41 Parser Must Follow the Actual Export

Do not begin with a generic Magic deck parser and hope the Deck Builder export fits it.

Implement the exact observed grammar.

---

## 2.42 Preserve Original Source Lines

For diagnostics, Arena should retain enough information to report which source line caused an error.

Example:

```text
Line 14:
4 Some Card [SET:123]

Error:
Forge could not resolve the requested card identity.
```

---

## 2.43 Quantity Validation

Validate quantities according to the real export format.

Reject malformed values such as:

```text
negative quantity
zero where invalid
non-numeric quantity
integer overflow
```

Deck-format copy limits are a separate concern from parser validity.

---

## 2.44 Structural Validation vs Format Legality

Import validity and Magic format legality are different things.

Phase 2 primarily asks:

> Can this package be parsed and its cards be resolved through Forge?

It should not reject a structurally valid imported deck merely because a future match format may consider that deck illegal, unless the package explicitly declares a format and the accepted architecture requires validation at import.

Final match-format legality belongs to Forge at the appropriate later match/setup stage.

---

## 2.45 No Arena Deck-Legality Engine

Arena must not implement rules such as:

```text
maximum four copies
Commander singleton
color identity
minimum deck size
sideboard size
```

itself.

When those rules must be evaluated, use Forge.

---

## 2.46 Forge Card Resolution

Every imported deck entry must be mapped to a Forge-recognized card identity.

Produce a resolution result for every unique deck entry.

Conceptual statuses:

```text
RESOLVED
AMBIGUOUS
NOT_FOUND
UNSUPPORTED
```

Exact names may differ.

---

## 2.47 Failed Card Resolution

If a required deck entry cannot be reliably resolved:

```text
import must not silently substitute another card
```

Return a clear validation error.

---

## 2.48 Ambiguous Card Resolution

If a TXT entry could resolve to more than one materially different Forge card identity and the package does not provide enough information:

**do not guess.**

Report the ambiguity.

If the ambiguity reflects a package-contract limitation, escalate.

---

## 2.49 Printing Identity

If the Deck Builder TXT contains:

```text
set code
collector number
printing identifier
```

Phase 2 must use the exact Phase 0 printing-resolution strategy.

If it contains only a canonical card name, follow the Phase 0-approved fallback behavior.

Do not invent printing semantics.

---

## 2.50 Artwork Does Not Determine Forge Rules Identity

The fact that a PNG depicts a particular printing does not itself define the rules object sent to Forge.

The TXT/package contract determines card identity.

The PNG is presentation artwork.

---

## 2.51 Duplicate Card Copies

Determine how Deck Builder represents:

```text
4 copies of the same card
```

and how many PNGs it exports.

Arena should not require four identical PNG copies if the existing package uses one shared asset.

Persist quantities separately from artwork.

---

## 2.52 Same Card With Different Art/Printing

If Deck Builder can intentionally include different printings of the same named card, Phase 2 must test that situation.

Determine whether:

```text
each printing receives a distinct PNG
each printing can be mapped unambiguously
Forge needs exact printing or canonical rules identity
```

Do not collapse deliberately distinct imported artwork accidentally.

---

## 2.53 PNG Validation

For every PNG required by the contract:

- verify it is a real PNG;
- verify it can be decoded;
- verify file size is within limits;
- verify image dimensions are reasonable;
- reject corrupt content;
- do not trust extension alone.

---

## 2.54 Persistent Application Data Root

Production persistent application data must be stored under a stable container-visible root:

```text
/data
```

The Docker deployment must map this location to persistent storage on the Unraid server.

The coding agent must inspect the existing Proxic Arena Docker/Unraid deployment configuration to determine the actual host-side appdata location.

Do not invent an Unraid host path if the real configuration already defines one.

The production requirement is:

```text
Unraid persistent appdata/storage
            ↓
Docker bind mount or equivalent
            ↓
          /data
```

Container recreation must not erase imported decks.

---

## 2.55 Permanent Deck Storage Layout

The preferred normalized storage structure is:

```text
/data/
├── decks/
│   └── <deck-id>/
│       ├── manifest.json
│       └── images/
│           └── ...
│
└── temp/
    └── deck-imports/
```

The exact filenames below `<deck-id>` may adapt to the actual implementation.

The stable principle is:

```text
deck storage is keyed by Arena deck ID
```

---

## 2.56 Do Not Key Filesystem Layout by User

Do not create a permanent layout such as:

```text
/data/users/<user-id>/decks/<deck-id>/
```

for Phase 2.

Deck sharing means filesystem ownership and application authorization are different concerns.

Use:

```text
/data/decks/<deck-id>/
```

and let the database later determine:

```text
who owns the deck
who can access the deck
who the deck is shared with
```

Changing ownership or sharing permissions should not require physically moving the deck directory.

---

## 2.57 Artwork Storage

Store validated imported artwork inside the Arena-controlled deck directory.

Conceptually:

```text
/data/decks/<deck-id>/images/
```

Do not expose arbitrary uploaded filesystem paths to the browser.

---

## 2.58 Package-Local Artwork

At the project's expected scale, prefer correctness and simplicity over premature global image deduplication.

It is acceptable for an imported deck package to own its normalized artwork files.

Do not build a complex global asset-deduplication system unless actual storage measurements justify it.

---

## 2.59 Browser Asset IDs

The browser should receive safe Arena asset identifiers or URLs.

Do not require the browser to construct server filesystem paths from card names.

Conceptually:

```text
/api/decks/{deckId}/assets/{assetId}
```

or equivalent.

---

## 2.60 Immutable Imported Assets

Once an import succeeds, its card artwork should be treated as immutable for that imported deck version.

If the deck is imported again with different artwork, that can become a new import or an explicit replacement operation defined by the implementation.

Do not silently mutate image files underneath an existing imported deck.

---

## 2.61 HTTP Image Response

Imported PNG responses should use:

```text
Content-Type: image/png
```

and appropriate caching behavior.

Do not use uploaded filenames directly as unsafe response headers.

---

## 2.62 Missing Required PNG

If the package contract requires artwork for a deck card and that artwork is missing:

```text
import fails
```

unless inspection of the actual Deck Builder format proves missing images are an expected supported condition.

Do not fetch missing artwork from the internet.

---

## 2.63 Unexpected PNG

If an unreferenced PNG exists in the archive, its behavior must be explicitly defined by the final package contract.

Possible behavior:

```text
ignore with warning
reject package
retain as package asset
```

Choose based on the real Deck Builder output.

---

## 2.64 Double-Faced and Multi-Face Cards

Phase 2 must inspect how Deck Builder exports artwork for:

```text
transforming double-faced cards
modal double-faced cards
split cards
other multi-face cards present in representative exports
```

Determine:

```text
one PNG or multiple PNGs
filename convention
front/back association
browser asset model needed later
Forge identity relationship
```

The permanent package specification must document the observed behavior.

---

## 2.65 Game-Created Tokens Are Not Deck Entries

Deck packages primarily describe the cards physically present in the deck.

Cards created during gameplay, such as tokens, may not have PNGs in the exported package.

Phase 2 must document this limitation if observed.

Do not expand Phase 2 into a general token-art acquisition system.

---

## 2.66 Internal Deck ID

Every successfully imported deck receives an Arena-owned immutable identifier.

Recommended:

```text
UUID
```

or equivalent robust opaque ID.

Do not use the deck display name as the primary identifier.

---

## 2.67 Deck Display Name

Determine where the existing package obtains the deck's human-readable name.

Potential sources may include:

```text
TXT content
TXT filename
ZIP filename
```

Use the real exporter behavior.

If no unambiguous deck name exists, stop and present the project owner with the cleanest options before defining permanent behavior.

---

## 2.68 Database Schema

Phase 2 adds only persistence required for imported decks.

Expected concepts:

```text
imported deck
deck entries
art assets
import metadata
```

Exact normalized tables should follow the final package findings.

Do not add:

```text
user ownership
sharing permissions
ratings
folders
tags
match history
```

during Phase 2.

---

## 2.69 No User Ownership Yet

Authentication/accounts are not part of Phase 2.

Do not invent a fake user ID merely to populate future ownership columns.

A later migration will associate existing imported decks with the proper ownership model when Accounts/Authentication and Deck Depot are implemented.

---

## 2.70 Future Deck Depot Ownership

The intended Deck Depot model will eventually allow:

```text
authenticated user uploads deck
        ↓
user becomes deck owner
        ↓
deck appears in user's library
        ↓
owner may share deck with other users
```

Conceptually, later database relationships may resemble:

```text
users
  id
  ...

decks
  id
  owner_user_id
  ...

deck_shares
  deck_id
  shared_with_user_id
  permission
```

This is future architecture guidance only.

Phase 2 must not create fake ownership records before the user model exists.

---

## 2.71 Suggested Deck Metadata

A successful Phase 2 import should persist enough metadata to expose:

```text
deck_id
display_name
import timestamp
source archive filename
package checksum
card counts
section counts
import schema version
Forge resolution status
storage relationship
```

Exact schema should remain minimal.

---

## 2.72 Package Checksum

Calculate a cryptographic checksum such as:

```text
SHA-256
```

for the uploaded package or normalized package content.

This assists diagnostics and duplicate detection.

Duplicate detection does not need to block identical imports unless explicitly desired.

---

## 2.73 Duplicate Imports

If the same ZIP is imported twice, do not silently overwrite an existing deck.

A straightforward Phase 2 behavior is acceptable:

```text
create a separate imported deck
+
report that the package checksum matches an existing import
```

If a cleaner behavior emerges from actual workflow testing, present it for review.

---

## 2.74 Import API Response

Successful import should return a stable structured response.

Conceptually:

```json
{
  "deck_id": "...",
  "name": "...",
  "status": "ready",
  "main_count": 60,
  "other_sections": {},
  "unique_cards": 24
}
```

Actual fields should reflect the discovered package.

---

## 2.75 Validation Error Response

Invalid imports must return structured problems rather than an opaque:

```text
500 Internal Server Error
```

Example concepts:

```text
INVALID_ARCHIVE
PACKAGE_TOO_LARGE
MISSING_DECK_LIST
INVALID_DECK_LINE
CARD_NOT_FOUND
CARD_AMBIGUOUS
MISSING_IMAGE
INVALID_IMAGE
UNSUPPORTED_PACKAGE
```

Exact codes should be documented.

---

## 2.76 Error Detail Safety

Errors may identify:

```text
source deck line
expected file
card name
validation category
```

They must not expose:

```text
server absolute paths
stack traces
database credentials
container internals
```

---

## 2.77 Deck Listing API

Create a minimal API for later phases to discover imported decks.

Conceptually:

```text
GET /api/decks
GET /api/decks/{deckId}
```

Responses should expose normalized deck metadata.

Do not expose server filesystem paths.

---

## 2.78 Deck Detail API

Deck detail should provide enough information to verify import results.

Potential fields:

```text
deck ID
display name
sections
quantities
card names/identities
associated art URLs
import timestamp
```

It should not expose Forge implementation internals unnecessarily.

---

## 2.79 Deck Deletion

Provide a minimal delete operation for local/development management:

```text
DELETE /api/decks/{deckId}
```

Deletion must remove:

```text
database records
owned deck assets
internal manifest
```

without affecting another imported deck.

Public exposure remains subject to the authentication restriction.

---

## 2.80 Deletion Atomicity

A failed deletion should not leave a deck appearing healthy while half its assets are missing.

Implement and test cleanup/failure behavior.

---

## 2.81 Phase 2 Frontend

Add a basic deck-import page.

Recommended route:

```text
/decks
```

The UI should support:

```text
select ZIP
upload ZIP
show upload/validation progress
show success
show validation errors
list imported decks
open imported deck details
delete imported deck in enabled environments
```

This is functional UI, not final visual design.

---

## 2.82 Upload UI

The frontend should clearly indicate that it expects a package exported by:

```text
Proxic Deck Builder
```

Do not present it as a generic MTG deck-file importer.

---

## 2.83 Client Does Not Validate Forge Cards

The browser may perform convenience checks such as:

```text
file selected
extension
file size preview
```

but the server remains authoritative for package validation and Forge resolution.

---

## 2.84 Import Progress

Do not fake fine-grained progress if the server cannot provide it.

A simple state model is sufficient:

```text
selected
uploading
validating
imported
failed
```

---

## 2.85 Import Result View

On success show useful confirmation such as:

```text
deck name
card count
unique card count
artwork count
import status
```

Use actual returned data.

---

## 2.86 Import Error View

For a validation failure, show:

```text
clear error category
human-readable explanation
relevant deck line or filename when safe
```

Do not require the user to inspect container logs for ordinary package mistakes.

---

## 2.87 Card Preview

Deck details may display imported PNG artwork to prove the image pipeline works.

A sophisticated deck-builder UI is not required.

A simple list/grid is sufficient.

---

## 2.88 No Deck Editing

Phase 2 does not implement deck editing inside Arena.

Deck editing remains the responsibility of:

```text
Proxic Deck Builder
```

Arena imports the package.

It does not become another deck-building application.

---

## 2.89 No Generic Text Paste Import

Do not add:

```text
paste deck list
third-party deck-site import
generic TXT upload
```

in Phase 2.

The supported source is the Proxic Deck Builder ZIP contract.

---

## 2.90 No Card-Art Downloading

Do not add internet artwork downloading.

The package supplies the artwork required by the import contract.

---

## 2.91 No Gameplay Selection Yet

An imported deck does not yet need to launch a game.

Phase 2 only guarantees that a later match phase can retrieve a validated imported deck by:

```text
deck_id
```

---

## 2.92 Forge Deck Construction Proof

Phase 2 must prove that a successfully imported Arena deck can be converted into the Forge deck representation selected in Phase 0.

This is not browser gameplay.

It is a backend integration test.

---

## 2.93 Forge Construction Round Trip

Test conceptually:

```text
Deck Builder ZIP
      ↓
Arena importer
      ↓
Arena internal manifest
      ↓
Forge deck construction
      ↓
Forge sees expected card counts
```

---

## 2.94 No Silent Card Substitution

Compare:

```text
parsed quantities
Arena manifest
Forge deck
```

The resulting Forge deck must contain the intended card identities and quantities.

Do not silently replace unresolved cards.

---

## 2.95 Representative Integration Deck

Use at least one real Deck Builder export as a manual/private acceptance fixture.

Do not commit full card-art packages to the source repository unless the project owner explicitly chooses to.

---

## 2.96 Repository Test Fixtures

Automated repository tests may use:

```text
small synthetic PNG files
minimal ZIP fixtures
real Forge-recognized card names in text
```

where appropriate.

The purpose is to test code, not maintain a card-art library in Git.

---

## 2.97 Private Real-Export Testing

Real Deck Builder packages used for integration testing may remain outside Git.

Document how the developer provides them to the test harness locally.

---

## 2.98 Required Import Tests

At minimum test:

```text
valid real Deck Builder ZIP
valid synthetic fixture
corrupt ZIP
wrong file type
missing deck TXT
multiple unexpected deck TXT candidates
malformed deck line
unknown card
ambiguous card
missing required PNG
corrupt PNG
extra PNG
duplicate ZIP path
path traversal
absolute path
oversized archive
oversized uncompressed archive
duplicate card quantities
Unicode filename/card name
restart after successful import
delete imported deck
```

Adapt tests to the actual discovered package contract.

---

## 2.99 Exact Printing Test

If the real exporter includes exact printing identity, test at least one card where:

```text
name is same
printing is different
```

Verify intended artwork and Forge resolution remain associated correctly.

---

## 2.100 Double-Faced Card Test

Use a real Deck Builder export containing a supported double-faced or multi-face card.

Verify:

```text
deck parser identifies it correctly
Forge resolves it correctly
required PNG assets map correctly
internal manifest represents it unambiguously
```

---

## 2.101 Basic Land Test

Import a deck containing basic lands.

Verify the package → Arena → Forge path preserves expected quantities and Forge identities.

---

## 2.102 Duplicate Card Test

Import a deck containing several copies of the same card.

Verify:

```text
quantity remains correct
artwork mapping remains correct
only required asset files are stored
Forge deck count remains correct
```

---

## 2.103 No-External-Service Acceptance Test

Run a successful import while external card-information services are unavailable or inaccessible.

The import must still succeed using:

```text
package contents
+
local Forge
```

---

## 2.104 Atomic Failure Test

Force an import failure after staging has begun.

Verify:

```text
no usable partial deck record appears
no orphan permanent deck directory remains
temporary state is cleaned up
```

---

## 2.105 Restart Persistence Test

Import a deck.

Restart:

```text
Arena Server
PostgreSQL
full Docker stack
```

Verify the imported deck and artwork remain available.

---

## 2.106 Container Recreation Persistence Test

Import a deck.

Recreate the Arena application container without deleting its persistent appdata mapping.

Verify:

```text
/data/decks/<deck-id>
```

and the corresponding database state remain available.

This test proves imported deck files are stored outside the disposable container filesystem.

---

## 2.107 Image Serving Test

For an imported card asset:

```text
request art URL
receive 200
Content-Type is image/png
PNG decodes correctly
```

Invalid asset IDs must not expose filesystem paths.

---

## 2.108 Public Mutation Protection Test

Before authentication exists, production configuration must prove that public users cannot anonymously perform deck mutations.

At minimum:

```text
public ZIP import unavailable
public deck deletion unavailable
```

while local/development Phase 2 testing remains possible.

---

## 2.109 Logging

Import logs should support correlation using:

```text
request_id
import_id
deck_id
```

where available.

Do not log entire uploaded ZIP contents.

Do not dump binary PNG data into logs.

---

## 2.110 Storage Measurement

Record representative real-world storage usage for:

```text
one imported deck ZIP
normalized deck
PNG artwork
database metadata
```

The purpose is to validate that simple package-local storage is reasonable.

Do not optimize based on guesses.

---

## 2.111 Import Performance

Measure approximately:

```text
upload
validation
Forge resolution
image validation
persistence
```

for at least one normal real Deck Builder export.

No strict performance target is required unless actual behavior is problematic.

---

## 2.112 Timeout Behavior

A normal deck import must not fail because of an unrealistically short generic HTTP timeout.

Configure upload/import timing based on measured package sizes.

Do not permit unlimited requests.

---

## 2.113 Database Migration

Add a new Flyway migration for Phase 2.

Example naming:

```text
V002__deck_package_import.sql
```

Use the next actual migration number in the repository.

Never modify an already-applied migration merely to add Phase 2.

---

## 2.114 File/Database Consistency

The importer must have a documented strategy for keeping:

```text
database records
internal manifest
PNG files
```

consistent.

The implementation must handle failures around the persistence boundary.

---

## 2.115 Storage Paths Are Server-Owned

Uploaded ZIP filenames and deck names must never directly determine arbitrary filesystem paths.

Use generated IDs and sanitized internal paths.

---

## 2.116 File Permissions

Imported deck files should be readable only as required by the Arena application/container environment.

They do not need executable permissions.

---

## 2.117 Archive Content Types

After inspecting the real exporter, define the exact allowed package content types.

Do not accept arbitrary executable or script files merely because they happen to be inside the ZIP.

---

## 2.118 Original ZIP Retention

Determine whether retaining the original successfully imported ZIP has diagnostic value.

Preferred default:

```text
normalized persistent deck
+
manifest
+
validated PNGs
```

are sufficient.

Do not retain redundant uploads indefinitely without a reason.

If the original archive is retained, document why and include it in storage accounting.

---

## 2.119 Import Version

Persist an Arena importer/schema version with each imported deck.

Example concept:

```text
import_schema_version = 1
```

This allows later code to recognize which normalization rules produced an existing deck.

---

## 2.120 Existing Deck Compatibility

Future importer versions must not silently reinterpret previously normalized decks.

The internal manifest/version exists partly to avoid this.

---

## 2.121 Docker / Unraid Storage Requirement

Phase 2 must update the Docker deployment so persistent Arena application data maps to the Unraid server's persistent appdata/storage area.

The coding agent must inspect the existing Docker deployment and document:

```text
actual Unraid host-side path
container-side mount path
read/write permissions
backup-relevant data
```

The container-side application path should remain:

```text
/data
```

unless an existing accepted Phase 1 convention requires an equivalent location.

Required persistent content includes:

```text
/data/decks/
```

and any other Phase 2 permanent deck data.

Temporary import staging may also live beneath `/data/temp/`, provided cleanup is enforced.

---

## 2.122 Docker Storage Must Survive Rebuilds

Imported deck data must survive:

```text
Arena image rebuild
Arena container replacement
Arena service restart
Docker Compose recreation
```

provided the persistent appdata storage is not intentionally deleted.

Do not store permanent uploaded decks only inside the container's writable layer.

---

## 2.123 Phase 2 Required Documentation

Create/update:

```text
docs/architecture/DECK_PACKAGE_FORMAT.md
docs/research/phase-02/DECK_BUILDER_EXPORT_INSPECTION.md
docs/architecture/DECK_IMPORT_PIPELINE.md
docs/troubleshooting/DECK_IMPORT.md
```

Also update:

```text
README.md
BUILD_PLAN.md
AGENTS.md
```

where Phase 2 introduces implementation-relevant instructions.

---

## 2.124 `DECK_IMPORT_PIPELINE.md`

Document:

```text
upload
staging
archive validation
TXT parsing
Forge resolution
PNG validation
internal manifest creation
database persistence
file promotion
cleanup
serving imported artwork
Unraid-backed persistent storage
```

Include a flow diagram.

---

## 2.125 Troubleshooting Documentation

Cover actionable failures such as:

```text
ZIP rejected
deck TXT not found
deck line rejected
Forge card not found
card ambiguous
PNG missing
PNG corrupt
package too large
import disabled in production
database failure
storage permission failure
persistent /data mount missing
```

---

## 2.126 Phase 2 Checklist

### Project references

- [ ] Verify old Arena path is read-only.
- [ ] Verify Deck Builder path is `C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder`.
- [ ] Treat Deck Builder as strictly read-only.
- [ ] Make no modifications to Deck Builder.

### Existing export inspection

- [ ] Obtain real Deck Builder ZIP.
- [ ] Inspect archive structure.
- [ ] Inspect deck TXT.
- [ ] Determine encoding.
- [ ] Determine deck-line grammar.
- [ ] Determine deck sections.
- [ ] Determine PNG naming.
- [ ] Determine card-to-PNG mapping.
- [ ] Test duplicate-card behavior.
- [ ] Test multi-face behavior where available.
- [ ] Inspect Deck Builder exporter source.
- [ ] Create export inspection report.
- [ ] Escalate if existing package is insufficient.

### Package contract

- [ ] Write `DECK_PACKAGE_FORMAT.md`.
- [ ] Define required files.
- [ ] Define allowed files.
- [ ] Define deck TXT grammar.
- [ ] Define card identity mapping.
- [ ] Define image mapping.
- [ ] Define validation behavior.
- [ ] Define importer schema version.

### Backend importer

- [ ] Add upload route.
- [ ] Add staging.
- [ ] Validate ZIP signature.
- [ ] Protect against traversal.
- [ ] Protect against symlinks.
- [ ] Protect against ZIP bombs.
- [ ] Enforce measured resource limits.
- [ ] Parse deck TXT.
- [ ] Preserve source-line diagnostics.
- [ ] Resolve cards through Forge.
- [ ] Validate PNGs.
- [ ] Build internal manifest.
- [ ] Persist deck metadata.
- [ ] Persist normalized artwork.
- [ ] Make import atomic.
- [ ] Clean temporary files.
- [ ] Add structured error codes.

### Persistent storage

- [ ] Inspect existing Unraid/Docker appdata configuration.
- [ ] Document actual host-side persistent path.
- [ ] Mount persistent application data into `/data`.
- [ ] Create `/data/decks/<deck-id>/`.
- [ ] Keep filesystem layout independent of users.
- [ ] Verify deck files survive container replacement.
- [ ] Verify temporary staging cleanup.

### Persistence

- [ ] Add Flyway migration.
- [ ] Add imported-deck records.
- [ ] Add card-entry persistence as required.
- [ ] Add artwork relationships.
- [ ] Add package checksum.
- [ ] Add import schema version.
- [ ] Do not add fake user ownership.
- [ ] Test restart persistence.
- [ ] Implement deck deletion.
- [ ] Test deletion cleanup.

### APIs

- [ ] Import deck.
- [ ] List decks.
- [ ] Retrieve deck.
- [ ] Serve card artwork.
- [ ] Delete deck in allowed environment.
- [ ] Never expose server file paths.

### Frontend

- [ ] Add `/decks`.
- [ ] Add ZIP file selection.
- [ ] Add upload state.
- [ ] Add validation state.
- [ ] Add success state.
- [ ] Add useful error display.
- [ ] Add imported deck list.
- [ ] Add imported deck details.
- [ ] Display imported artwork.
- [ ] Add deletion where enabled.

### Forge

- [ ] Use Phase 0 card-resolution strategy.
- [ ] Verify every required card resolves.
- [ ] Test Arena manifest → Forge deck construction.
- [ ] Verify quantities.
- [ ] Test basic lands.
- [ ] Test duplicate cards.
- [ ] Test exact printing if package supports it.
- [ ] Test double-faced card if package supports it.
- [ ] Do not implement Arena rules logic.

### Security

- [ ] Validate real archive type.
- [ ] Bound upload size.
- [ ] Bound extraction.
- [ ] Bound entry count.
- [ ] Reject unsafe archive paths.
- [ ] Reject unsupported content.
- [ ] Validate real PNG content.
- [ ] Sanitize storage.
- [ ] Prevent anonymous public mutations before authentication.
- [ ] Keep production import disabled until access control exists.

### Ownership boundary

- [ ] Do not create fake users.
- [ ] Do not add temporary owner IDs.
- [ ] Do not organize storage by user directory.
- [ ] Preserve stable deck IDs for later ownership.
- [ ] Reserve authenticated ownership for Accounts/Authentication + Deck Depot phases.
- [ ] Reserve deck sharing for Deck Depot.

### Independence

- [ ] Import succeeds without external card APIs.
- [ ] No artwork download exists.
- [ ] No generic deck-site importer exists.
- [ ] No dependency on Deck Builder being installed at runtime.
- [ ] Old Proxic Arena remains untouched.
- [ ] Proxic Deck Builder remains untouched.
- [ ] Upstream Forge remains untouched except approved patches.

### Tests

- [ ] Real package import passes.
- [ ] Synthetic package import passes.
- [ ] Invalid archive tests pass.
- [ ] Archive security tests pass.
- [ ] Deck parser tests pass.
- [ ] Forge resolution tests pass.
- [ ] PNG tests pass.
- [ ] Atomic failure test passes.
- [ ] Persistence test passes.
- [ ] Container recreation persistence test passes.
- [ ] Image-serving test passes.
- [ ] Browser import test passes locally.
- [ ] Public mutation protection test passes.
- [ ] Static analysis passes.
- [ ] Docker tests pass.

### Documentation

- [ ] Package contract written.
- [ ] Import pipeline documented.
- [ ] Unraid storage mapping documented.
- [ ] Troubleshooting documented.
- [ ] README updated.
- [ ] BUILD_PLAN updated.
- [ ] Phase status accurate.

---

## 2.127 Mandatory Acceptance Tests

### P2-A — Real Deck Builder Export Inspection

At least one actual current Proxic Deck Builder ZIP has been inspected.

Its TXT and PNG structure are documented.

**Required evidence:** inspection report.

### P2-B — Deck Builder Integrity

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

was not modified during Phase 2.

**Required evidence:** integrity check.

### P2-C — Real Package Import

A real Deck Builder ZIP imports successfully through the production importer.

**Required evidence:** RUN.

### P2-D — Forge Resolution

Every required card from the accepted test package resolves through the Phase-0-approved Forge mechanism.

**Required evidence:** RUN.

### P2-E — Forge Deck Construction

The normalized imported deck can construct the expected Forge deck with correct quantities.

**Required evidence:** RUN.

### P2-F — Artwork Mapping

Every required deck card in the representative package maps to the intended imported PNG asset.

**Required evidence:** RUN.

### P2-G — Persistent Import

Restarting the application stack preserves:

```text
deck record
deck entries
internal manifest
card artwork
```

**Required evidence:** RUN.

### P2-H — Container Recreation Persistence

Recreate the Arena container while preserving the Unraid-backed application-data mount.

The imported deck remains available.

**Required evidence:** RUN.

### P2-I — ZIP Traversal Protection

A malicious archive containing traversal paths cannot write outside its staging area.

**Required evidence:** RUN.

### P2-J — Extraction Limit

A package exceeding configured extraction limits is rejected cleanly.

**Required evidence:** RUN.

### P2-K — Invalid PNG

A fake/corrupt PNG with a `.png` filename is rejected.

**Required evidence:** RUN.

### P2-L — Missing Card

A deck entry Forge cannot resolve causes an actionable import failure.

Arena does not substitute another card.

**Required evidence:** RUN.

### P2-M — Missing Required Art

A package missing artwork required by the accepted package contract fails clearly.

**Required evidence:** RUN.

### P2-N — Atomic Failure

A failed import produces no usable partial deck.

**Required evidence:** RUN.

### P2-O — Browser Import

In an enabled local/development environment:

```text
open /decks
select Deck Builder ZIP
upload
import succeeds
deck appears
artwork displays
```

**Required evidence:** Playwright/browser RUN.

### P2-P — Delete Isolation

Deleting one imported deck does not damage another imported deck.

**Required evidence:** RUN.

### P2-Q — No External Card Service

A valid import succeeds with external card-information services unavailable.

**Required evidence:** RUN.

### P2-R — Public Mutation Protection

Before authentication/access control exists:

```text
anonymous internet client
```

cannot upload or delete deck packages through the production hostname.

**Required evidence:** RUN.

### P2-S — Old Arena Integrity

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

was not modified.

### P2-T — Forge Integrity

Verify upstream Forge contains no unapproved Proxic modifications.

---

## 2.128 Required Phase 2 Deliverables

At completion provide:

```text
1. Summary of implementation.

2. Real Deck Builder ZIP inspection report.

3. Confirmation Proxic Deck Builder remained unchanged.

4. Final DECK_PACKAGE_FORMAT.md.

5. Final DECK_IMPORT_PIPELINE.md.

6. Actual observed deck TXT grammar.

7. Actual observed PNG naming/mapping rules.

8. Any Deck Builder compatibility issue discovered.

9. Database schema/migration.

10. Internal Arena manifest format.

11. Import API routes.

12. Deck listing/detail API routes.

13. Artwork-serving route.

14. Container-side storage structure.

15. Actual Unraid host-side persistent storage mapping.

16. Import resource limits.

17. Security validation behavior.

18. Forge card-resolution strategy used.

19. Forge deck-construction test result.

20. Real package test result.

21. Browser import test result.

22. Persistence test result.

23. Container recreation persistence result.

24. Archive-security test results.

25. Public mutation protection result.

26. Storage/performance measurements.

27. Any deviations.

28. Any unresolved concerns.

29. Proposed requirements for Phase 3.
```

Do not begin Phase 3 automatically.

---

## 2.129 Phase 2 Exit Gate

Phase 2 implementation is complete only when:

```text
the real Deck Builder package format is understood

the Deck Builder source was used read-only

the Deck Builder project remains unchanged

the package contract is documented

Arena accepts a real Deck Builder ZIP

unsafe ZIPs are rejected

deck TXT parsing is deterministic

every required card resolves through Forge

Arena can construct the intended Forge deck

included PNGs map reliably to deck cards

the imported deck persists under Arena-controlled storage

/data is backed by persistent Unraid storage

container replacement does not erase decks

storage is keyed by deck ID, not user directory

failed imports are atomic

the browser can import a package locally

no external card-information service is required

anonymous public ZIP upload is not exposed

user ownership has not been faked before authentication

sharing is deferred to Deck Depot

old Proxic Arena remains unchanged

upstream Forge remains clean

documentation matches actual behavior
```

---

## 2.130 What Phase 2 Does Not Build

The following are intentionally outside Phase 2:

```text
user accounts
login
deck ownership
deck sharing
Deck Depot
public authenticated deck upload
deck editing
generic TXT import
third-party deck-site import
internet artwork download
match lobby
session codes
match creation
battlefield
gameplay
combat UI
stack UI
priority UI
match history
replays
spectators
friends
```

---

## 2.131 Escalation Rule

Stop and ask the project owner before:

```text
changing Proxic Deck Builder in any way

requiring a change to the Deck Builder export format

adding a required package manifest

changing upstream Forge

silently substituting unresolved cards

allowing imports with ambiguous card identity

introducing an external card-data dependency

adding an internet artwork downloader

exposing anonymous ZIP upload publicly

inventing temporary authentication

inventing temporary user ownership

building user-directory-based permanent deck storage

turning Arena into a deck editor

expanding Phase 2 into Deck Depot

expanding Phase 2 into gameplay
```

For a conflict report use:

```text
CONFLICT

Phase 2 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

---

## 2.132 Locked-Phase Amendment Rule

This Phase 2 specification is locked.

If a legitimate change to a locked Phase 2 requirement becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 2 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Affected later phases:
Approved by project owner:
Date:
```

The amendment records the change separately.

---

# Phase 2 Final Principle

Proxic Arena should not need to rediscover a deck every time it is played.

Phase 2 converts:

```text
Deck Builder ZIP
```

into:

```text
validated Arena deck
+
Forge-resolved identities
+
local card artwork
+
stable internal manifest
+
persistent Unraid-backed storage
```

once.

The physical deck data is stored by stable Arena deck ID:

```text
/data/decks/<deck-id>/
```

not by user directory.

Later phases will add:

```text
authenticated user
        ↓
deck ownership
        ↓
Deck Depot sharing and access control
```

without requiring the deck files to move.

After Phase 2, later systems can reference:

```text
deck_id
```

and trust that the imported package was already validated.
