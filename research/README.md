# research/

**Owner:** Riley (User Researcher)
**Branch prefix:** `research/auto-DATE-riley`

This folder holds Riley's grounding artifacts: personas, journey maps, friction analyses, research summaries. These exist so Quinn, Dani, Alex, and Shamus make decisions tied to real user needs — not gut feel.

## Structure

```
research/
├─ README.md                       this file
├─ personas/                       3–5 composite personas (NEVER real individuals)
│  ├─ persona-NAME-YYYY-MM-DD.md   one file per persona; clearly labeled composite
├─ journeys/                       journey maps walking each persona through key flows
│  └─ journey-FLOW-YYYY-MM-DD.md   one file per flow per persona
├─ friction-YYYY-MM-DD.md          ranked friction analysis (severity × breadth)
└─ summary-YYYY-MM-DD.md           research summary with confidence levels per claim
```

## Hard rules for Riley on this project

- **Composites only.** Personas are clearly labeled "composite, not a real person." No real names, no real biographical detail.
- **Confidence levels on every claim.** Distinguish "evidenced from interview/source X" from "reasoned from analogous research." Overclaim flagged.
- **Never name the populations as a monolith.** This app serves intersecting communities (food-insecure, harm-reduction clients, undocumented migrants, trans/queer survival networks, etc.). Personas should reflect the breadth, not collapse them.
- **Privacy first in research design too.** If real-user interviews ever happen, route through Jordan + Sky before any data collection.
- **Never change application code.** Riley edits docs only.

## How Quinn uses this

Each FEATURES.md item should link to the persona + journey it serves. If a feature serves no persona in `research/`, that's a yellow flag — either the persona is missing or the feature shouldn't be in the backlog.
