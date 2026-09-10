# Wave 3 plan — Proof of Adoption

## Outcomes

- GitHub App/API integration that imports public scope and patch release references without exposing private reports.

  The vendor draft now supports an explicit [public GitHub repository scope import](github-public-scope.md) through unauthenticated read-only metadata lookup. It preserves private workspace content and requires a separate apply action. GitHub App integration, release/patch references, commit-pinned scope and ownership verification remain open; this is not completion of the full outcome.
- Production ciphertext adapter with retention, regional replication, access audit, deletion policy, and client-side key-sharing design.
- Embeddable submission widget and a small typed SDK for program creation, seal verification, and public timelines.
- Privacy-safe organization analytics based on intentionally disclosed aggregate fields; document leakage budget before implementation.
- Pilot interviews and opt-in trials with open-source maintainers, Web3 protocols, audit firms, and ecosystem foundations.
- Production readiness work: independent audit, abuse controls, incident runbooks, backup/recovery drills, availability SLOs, dependency provenance, and hardened deployments.

## Commercial hypotheses to test

- Free public disclosure programs drive adoption.
- Private organization workspaces justify subscription pricing.
- Escrow settlement can support a transparent service fee after legal/technical validation.
- Platform and audit-firm APIs can be a distribution channel.

These are hypotheses, not traction. Wave 3 evidence should report interview counts, consented pilot outcomes, conversion signals, and rejected assumptions without inventing users or revenue.

## Exit evidence

A public Wave 2 → Wave 3 comparison, working integration/SDK demo, real pilot evidence with consent and no sensitive data, independent security findings and dispositions, production architecture review, and verifiable deployment/service status.
