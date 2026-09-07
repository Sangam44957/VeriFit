# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email `security@verifit.example` with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix

You will receive an acknowledgement within 48 hours and a resolution timeline within 7 days.

## Scope

| Area | In scope |
|------|----------|
| Authentication / authorisation bypass | ✅ |
| SQL injection | ✅ |
| Secrets exposed in source or logs | ✅ |
| Dependency vulnerabilities (CVSS ≥ 7) | ✅ |
| Denial of service | ⚠️ case-by-case |
| Social engineering | ❌ |

## Security controls

- Dependencies scanned on every CI run (`pnpm audit --audit-level=high`)
- SAST via Semgrep (`p/typescript`, `p/nodejs`, `p/secrets`) on every push
- Secret scanning via TruffleHog on every push
- Passwords stored as bcrypt hashes — never in plaintext
- `DATABASE_URL` and Redis credentials kept in `.env.local` (git-ignored)

## Disclosure policy

We follow coordinated disclosure. Once a fix is merged and released, the reporter is credited in the release notes unless they prefer to remain anonymous.
