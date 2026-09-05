import AppCore

/// The camera decision the capture surface is designed against, fixed rather
/// than read from a device.
///
/// The playground has no camera at all — not "declines to open one", simply
/// none present in the process — so every ``CameraAccess`` this feature can
/// meet has to be reachable without hardware. `FeatureReceiptCapture` keeps
/// its own equivalent for `#Preview` behind `#if DEBUG` and `private`, which
/// is exactly what `ModuleBoundaryTests.fakesAreTestOnly` means for
/// `AppCoreFakes`: a fake belongs to whoever renders it, not to a shared
/// target another module can reach into.
///
/// Named for this area rather than `PlaygroundCameraAuthorization` because
/// `FeaturePairing`'s own surfaces already claim that name for the same seam —
/// two areas needing the same fixed decision is not a reason to share a type
/// across files edited by different, concurrent work.
internal struct ReceiptCameraAuthorization: CameraAuthorizing {
    private let standing: CameraAccess

    internal init(_ standing: CameraAccess) {
        self.standing = standing
    }

    internal func currentAccess() -> CameraAccess { standing }
    internal func requestAccess() async -> CameraAccess { standing }
}

/// What a receipt upload answers with, fixed for review rather than sent
/// anywhere.
///
/// One value rather than three call sites: every outcome, every
/// ``RepositoryError``, and the call that never answers at all (a `Task` that
/// sleeps until the surface is torn down) are the same repository with a
/// different literal, which is what lets every result state be a one-line
/// difference in the catalogue rather than a new type.
internal struct PlaygroundReceiptCaptureRepository: ReceiptCaptureRepository {
    private let answer: Result<ReceiptOutcome, RepositoryError>
    private let neverAnswers: Bool

    internal init(_ answer: Result<ReceiptOutcome, RepositoryError>, neverAnswers: Bool = false) {
        self.answer = answer
        self.neverAnswers = neverAnswers
    }

    internal func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        if neverAnswers { try await Task.sleep(for: .seconds(3600)) }
        return try answer.get()
    }
}
