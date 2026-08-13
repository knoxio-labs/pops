import Testing

@testable import FeaturePairing

// The imports above are deliberately OUTSIDE the `#if` below, and that is not
// style. With `@testable import FeaturePairing` inside the conditional, this
// file compiled on one CI run and failed the next with "cannot find
// 'SystemCameraAuthorization' in scope" — same bytes, no source change between
// them, so the module simply was not always loaded. Swift compiles test files in
// batches (the failing job batched this one with PairingSubmissionTests and
// PairingViewModelTests), and a conditional import is not reliably honoured
// across that. An unconditional import costs nothing on any platform; only the
// suite below needs guarding.
//
// Simulator-only because a Mac has a camera, so the same assertion run on the
// host toolchain by `mise run test:packages` would be false there and would say
// nothing about the platform this claim is about. `test:device` runs against
// hardware with a camera and is excluded for the same reason.
#if targetEnvironment(simulator)

    /// What the Simulator actually reports, asserted rather than assumed.
    ///
    /// `SystemCameraAuthorization.currentAccess()` answers `.unavailable` when
    /// `AVCaptureDevice.default(for: .video)` is nil, and ``CameraAccess`` says
    /// that case exists so "a simulator or a device with no camera" cannot
    /// present a scanner that shows black forever. Every other test here reaches
    /// that branch through a stub, so nothing had ever checked that the
    /// Simulator still takes it — the real implementation had no coverage at
    /// all, which is precisely how this could rot unnoticed.
    ///
    /// The doubt is specific rather than theoretical. The POPS-1960 spike, on a
    /// newer SDK than the pinned one, saw a Simulator report
    /// `VNDocumentCameraViewController.isSupported == true` and then fail inside
    /// `AVCaptureDeviceInput(device:)` with "Could not create video device
    /// input" — a device object found and rejected, which is not the same event
    /// as no device being found, and not a shape this branch would catch.
    ///
    /// So this asserts the contract the production doc comment claims, on the
    /// toolchain CI pins, and is the standing answer to whether it still holds.
    /// If it ever fails, the branch is no longer what stops the scanner opening
    /// here and `SystemCameraAuthorization` needs an explicit Simulator check
    /// rather than an inference from device lookup.
    @Suite("Simulator camera availability")
    internal struct SystemCameraAvailabilityTests {
        @Test("the Simulator reports no camera to authorise")
        func simulatorReportsUnavailable() {
            #expect(SystemCameraAuthorization().currentAccess() == .unavailable)
        }
    }

#endif
