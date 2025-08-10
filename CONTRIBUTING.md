# Contributing to Mitsi

Thank you for your interest in contributing to **Mitsi**, an open-source WebRTC video conferencing platform! We aim to make contributing easy and welcoming for everyone, from first-time contributors to seasoned developers. This guide explains how to contribute to any Mitsi repository (`mitsi-client`, `mitsi-signaling`, `mitsi-media`, etc.).

## Getting Started

1. **Explore Repositories**:
   - Mitsi is split into separate repositories under [softhon](https://github.com/softhon). Start with:

- [mitsi-web](https://github.com/softhon/mitsi-web): Mitsi web client - react base web application for mitsi.
- [mitsi-mobile](https://github.com/softhon/mitsi-mobile): Mitsi mobile app - react native application for mitsi.
- [mitsi-signaling](https://github.com/softhon/mitsi-signaling): Mitsi Signaling Service for manage peer connections and room coordination.
- [mitsi-media](https://github.com/softhon/mitsi-media): Mitsi media service powered by mediasoup for media routing.
  - See [README.md](README.md) for the full list.
  - Each repo has its own `README.md` and `docs/` folder with setup instructions.

2. **Find Issues**:
   - Browse issues in each repository’s GitHub Issues tab.
   - Look for `good-first-issue` labels for beginner-friendly tasks.
   - Use [mitsi-docs issues](https://github.com/softhon/mitsi-docs/issues) for cross-repo or documentation tasks.

3. **Join the Community**:
   - Participate in [GitHub Discussions](https://github.com/softhon/mitsi-docs/discussions) for ideas and questions.
   - Join our [Discord](https://discord.gg/mitsi) (coming soon) for real-time collaboration.

## Contribution Workflow

1. **Fork the Repository**:
   - Fork the relevant repo (e.g., `mitsi-signaling`) to your GitHub account.
   - Clone your fork:
     ```bash
     git clone https://github.com/your-username/mitsi-<repo>.git
     cd mitsi-<repo>
     ```

2. **Set Up the Environment**:
   - Install Node.js >= 18 and npm >= 9.
   - Install dependencies:
     ```bash
     npm install
     ```
   - Enable Git hooks (for ESLint and Prettier):
     ```bash
     npx husky install
     ```
   - See the repo’s `docs/setup.md` for specific instructions.

3. **Create a Branch**:
   - Create a feature or bugfix branch:
     ```bash
     git checkout -b feature/your-feature-name
     ```
   - Use descriptive branch names (e.g., `fix/signaling-ice-candidate`, `docs/add-api-reference`).

4. **Make Changes**:
   - Follow the coding standards:
     - Use TypeScript for all `.ts` and `.tsx` files.
     - Adhere to ESLint rules (`.eslintrc.js`) and Prettier formatting (`.prettierrc`).
     - Pre-commit hooks (via Husky and lint-staged) automatically run `eslint --fix` and `prettier --write` on staged files.
   - Write tests for new features or bug fixes (using Jest in `tests/`).
   - Update documentation in the repo’s `docs/` folder if needed.

5. **Commit Changes**:
   - Use clear commit messages:
     ```bash
     git commit -m "Add WebSocket handler for room joining in mitsi-signaling"
     ```
   - Pre-commit hooks will enforce linting and formatting. If the commit fails, fix errors and retry.

6. **Push and Create a Pull Request**:
   - Push your branch:
     ```bash
     git push origin feature/your-feature-name
     ```
   - Open a pull request (PR) on the original repo (e.g., `softhon/mitsi-signaling`).
   - Include a description of your changes and link to any related issues (e.g., `Fixes #123`).

7. **Code Review**:
   - Respond to feedback in your PR.
   - Ensure tests pass in the GitHub Actions CI/CD pipeline.
   - A maintainer will merge your PR once approved.

## Coding Standards

- **Language**: Use TypeScript for all code in `src/` (`.ts` or `.tsx` files).
- **Linting**: ESLint with `@typescript-eslint` rules enforces code quality. Run `npm run lint` to check.
- **Formatting**: Prettier ensures consistent style. Run `npm run format` to apply.
- **Testing**: Write unit tests with Jest in `tests/`. Run `npm test` to verify.
- **Documentation**: Update `docs/` files for new features or changes. Use Markdown for clarity.

## Repository-Specific Guidelines

Each repo may have additional requirements in its `docs/contributing.md`. For example:

- **mitsi-signaling**: Focus on WebSocket event handlers (e.g., `join-room`, `ice-candidate`).
- **mitsi-client**: Follow React best practices and test WebRTC integration.
- **mitsi-media**: Ensure compatibility with mediasoup’s native dependencies.

## Tips for Contributors

- **Start Small**: Try `good-first-issue` tasks to get familiar with the codebase.
- **Ask Questions**: Use GitHub Discussions or Discord for help.
- **Test Locally**: Run `npm run dev` (uses nodemon) to test changes locally.
- **Avoid `--no-verify`**: Don’t bypass pre-commit hooks unless absolutely necessary, as they ensure code quality.

## License

All Mitsi repositories are licensed under the [MIT License](LICENSE). By contributing, you agree to license your contributions under MIT.

## Thank You!

Your contributions help make Mitsi a better platform for everyone. We appreciate your time and effort!
