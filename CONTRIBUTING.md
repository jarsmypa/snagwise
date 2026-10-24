# Contributing to Snagwise

Thanks for helping. Code, fixes and SnagSkills are all welcome.

## License of your contribution

Snagwise is published under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). The maintainers may also offer Snagwise under other terms (for example, a commercial hosted version). So that this stays possible, by opening a pull request you agree that:

1. You wrote the contribution, or you have the right to submit it.
2. You keep the copyright of your contribution.
3. You license it to the public under AGPL-3.0-only, like the rest of the project.
4. You also grant the Snagwise maintainers a perpetual, worldwide, non-exclusive, royalty-free license to use, modify and distribute your contribution under other license terms, including proprietary ones.

If you don't agree with point 4, say so in the pull request before it is merged.

## SnagSkills

Shopping skills live in [`skills/`](skills/). The format and review rules are in [skills/README.md](skills/README.md).

## Before opening a pull request

```bash
npm ci
npm run check   # typecheck, tests, build and npm audit
```
