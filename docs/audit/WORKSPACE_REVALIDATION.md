# Workspace audit revalidation

Date: 2026-10-13 (Asia/Karachi). Scope: Phase A only.

## Current workspace

- Active project: `D:/Fasal Guard Development Workspace/fasalguard-ai`.
- Reference clones: `D:/Fasal Guard Development Workspace/banokabal/<repository>`.
- Existing baseline sandbox: `../banokabal/phaseb/openfarm` relative to the active project.
- Project HEAD: `1b7c889dd10fa9e45dc20c626640964d18e86b6c`.
- The project has substantial staged dashboard, diagnosis, farm, and API changes plus an untracked `.claude/` directory. These were preserved. No application code was changed.
- Local `.env` files exist in the active project. Their values were not read or copied. The imported legacy inventory's statement that no `.env` exists applies only to its older locations.

## Checks performed in this session

For each of the nine reference clones: `git rev-parse HEAD`, `git remote get-url origin`, and `git status --porcelain`, using per-command `safe.directory` for the explicitly inspected clone. All HEADs match the audit table; all working trees were clean. No fetch was performed, so the historical claim that clones are current with upstream was not revalidated.

| Repository | Verified HEAD |
|---|---|
| OpenFarm | `884a61567dd0d149214090baf9edebc533a2a0df` |
| botanix-mobile-ai | `379fd137a119a54ae3efba1f5d849dbb5a8d58fd` |
| pyfao56 | `1d242ee985be0edbc4946f06e7e94a487d4bc0c9` |
| fao-wetl-pywapor | `388b536f59b56e3ba7ea000e28d1ffc621e8319d` |
| kissan-alert-solution | `6a5f143eab72eeac938f9d1dab9ce0cb084c530b` |
| AgroTrust | `5239452f79d0759ec9014d4e88bd2821e34b2935` |
| Farmiq | `7680e4e982a07c0473c38e3c7fc57beeaf220ba6` |
| Kisan_Rabta | `30dadb4836a2636991e68b6c3399a5e669bbdbee` |
| Crop-Yield-Prediction-System | `989534169d196db6cabb7c13cc809d8bba48cd9e` |

Git emitted warnings that the sandbox cannot read the owner's global ignore file. No global Git configuration was changed.

## Existing evidence, not newly executed tests

The imported reports retain their original findings and historical test results. Raw logs and screenshots remain in the sibling `banokabal/docs/audit` directory; linked evidence uses relative workspace paths. They are not bundled in this repository and must accompany it if moved. No model assets, provider configuration, runtime exports, or credentials were imported.

Evidence inspected:

- `kissan_alert_deno_test.log`: 13 tests passed; type checking failed with 91 errors.
- `farmiq_credit_model_test.log`: pytest failed during collection with an unavailable `CombineWithReferenceFeature` import; exit 2.
- `crop_yield_scripts.log`: script/API import run reported exit 0. This does not establish validated prediction accuracy.
- `pyfao56_regression.log`: substantive numerical differences remain in test09, including irrigation and seasonal ET totals. The detailed PF-2 audit attributes these differences to a different parameterized scenario and reports exact matching for case00. That explanation was not independently rerun in this session. **Treat blanket regression equivalence as unverified; retain the scenario-specific qualification when considering reuse.**

No test suite, Docker stack, migration, or provider request was executed in this session. Historical Phase B results do not prove that the stack currently works after relocation.

## Audit gate and next work

The four requested Phase A reports are now available in the active project: `REPOSITORY_AUDIT.md`, `LICENSE_MATRIX.md`, `DEPENDENCIES.md`, and `REAL_VS_MOCK.md`. Supporting historical baseline/security/science reports are included for context. Phase A still requires independently verifying the pyfao56 scenario-specific regression explanation and checking any historical claims needed for the chosen integration against their exact source and logs. Provider terms and dependency advisories in imported reports are historical, not a fresh external verification.

Before implementation, revalidate the OpenFarm baseline in its current location, including credential-dependent authentication and map flows. The existing baseline documents record unresolved launch, authorization, imagery, and credential issues. Do not infer that importing those reports completes the baseline gate.

All features F01-F14 remain **NOT_STARTED for this integration task**. Existing Fasal Guard functionality is not reclassified or certified by this documentation update. No source code was imported, no architecture migration was started, and no feature was marked TESTED or PRODUCTION_VERIFIED.