---
name: install-on-phone
description: Install the Pops iOS app (or the Pops Design playground) on Joao's physical iPhone from this checkout. Use whenever asked to "install on my phone", "put it on the phone", "run it on the device" or anything that means a local build on real hardware — never for TestFlight, which ships through CI.
---

# Install on the phone

A phone install is always the **local flavour**: `com.knoxiolabs.pops.local`, the
icon with the amber LOCAL band, "Pops Local" on the home screen. It sits beside
the TestFlight app instead of replacing it, and it pairs and keeps its own
keychain separately. The TestFlight flavour is built only by
`clients/ios/scripts/testflight.sh` in CI; never pass `POPS_FLAVOR` to a local
build.

## Run

From `clients/ios`:

```bash
mise run install:phone
```

For the design playground ("Design Local"):

```bash
mise run install:phone PopsPlayground
```

It generates the project, builds Release for `generic/platform=iOS` with
automatic signing, refuses anything whose bundle identifier does not end in
`.local`, then installs and launches it through `xcrun devicectl`. The phone is
the one paired physical iPhone; with several paired, set `POPS_DEVICE` to its
name or identifier (the script lists them).

## When it fails

- **No paired iPhone:** the phone must be unlocked, trusted by this Mac, and on
  USB or the same network. `xcrun devicectl list devices` shows what is visible.
- **Signing:** needs the team in `~/.config/pops/ios-signing.xcconfig` (see
  `clients/ios/README.md`, "Signing, and installing on a phone") and an Apple
  account signed in to Xcode. The first build of a `.local` identifier
  registers it with Apple; that is expected.
- **Launch refused with the phone locked:** the install succeeded; unlock and
  open "Pops Local" by hand.

Report the bundle identifier and device from the script's last line. Do not
report "installed" from the build step alone.
