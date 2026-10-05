# Contributing to blehh ⚡

Thank you for your interest in contributing! We welcome bug reports, feature proposals, and pull requests from developers of all skill levels.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

---

## Development Workflow

### 1. Fork & Clone

```bash
git clone https://github.com/s4meer-dev/blehhh.git
cd blehhh
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Feature Branch

Use descriptive branch names:
- `feat/feature-name`
- `fix/bug-fix-name`
- `docs/documentation-update`

```bash
git checkout -b feat/your-feature
```

### 4. Code Standards & Testing

Ensure that all TypeScript types are strictly compliant and unit tests pass before submitting your PR:

```bash
# Typecheck
npm run lint

# Build
npm run build

# Run automated tests
npm test
```

### 5. Commit Guidelines

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring with no functional change
- `ci:` Continuous integration updates

---

## Submitting Pull Requests

1. Keep pull requests focused on a single concern.
2. Provide a clear PR title and descriptive summary.
3. Link related issues in the PR description (e.g. `Fixes #12`).
4. Ensure all CI status checks are passing.

Thank you for helping build resilient open-source software!
