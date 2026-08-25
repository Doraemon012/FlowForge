# ADR 007: Simple V1 Identity and Project Ownership

## Context

The API must isolate user resources, while enterprise identity and collaboration are outside the first product boundary.

## Decision

Represent an authenticated caller as a `User`. V1 uses built-in email/password authentication with slow password hashes and short-lived bearer access tokens, plus a single-owner `Project` model. Every project-owned query enforces ownership. Workers use separate service credentials and cannot act as users. Password reset, collaborators, advanced roles, and external SSO are deferred.

## Alternatives considered

- Anonymous API: unsuitable for resource isolation.
- Full organization/RBAC model: useful later, but expands the domain before orchestration is proven.
- Enterprise identity provider first: adds deployment dependency without improving core execution semantics.

## Tradeoffs

V1 cannot support team collaboration or sophisticated policy. The model is explicit, testable, and provides a clean migration path to memberships and roles.

## Consequences

Authentication is scheduled in Phase 2, authorization is enforced on every resource endpoint, webhook authentication is separate and scoped, and worker credentials are least-privilege service identities.
