import AppCore
import Observation

/// The capture screen's whole decision surface.
///
/// The view renders and forwards; every decision — whether the camera may
/// open, what an empty scan means, whether a set of pages is a receipt worth
/// sending — is here. That split is what makes "the person said no" and "the
/// scan came back empty" assertable without a camera, which matters more here
/// than anywhere else in the app: none of these states can be reached from a
/// test process, and one of them cannot be reached in the Simulator at all.
///
/// No VisionKit type appears in this file, and that is deliberate rather than
/// incidental. The document camera hands back page images; turning those into
/// bytes is the platform's business, and what arrives here is the same
/// ``ReceiptPart`` a repository takes. So the host toolchain — which has no
/// VisionKit and no camera — still compiles and exercises every branch below.
@MainActor
@Observable
public final class ReceiptCaptureViewModel {
    /// What the screen is showing.
    public private(set) var state: ReceiptCaptureState = .ready

    /// The standing camera decision. Starts at ``CameraAccess/notDetermined``
    /// and is replaced by the first read; the screen does not prompt to draw
    /// itself.
    public private(set) var cameraAccess: CameraAccess = .notDetermined

    /// Why the last capture produced nothing, or `nil`. The domain value
    /// rather than a rendered sentence, so a test asserts which problem
    /// happened instead of asserting on prose a copy edit would break.
    public private(set) var problem: ReceiptCaptureProblem?

    /// Whether the document camera is up. Settable by the view so a
    /// system-driven dismissal is not fought over.
    public internal(set) var isCameraPresented = false

    private let dependencies: AppDependencies
    private let camera: any CameraAuthorizing

    /// - Parameters:
    ///   - dependencies: read for ``ReceiptCaptureRepository`` and nothing
    ///     else, and only to hand on to the result screen.
    ///   - camera: the permission decision, injected because "denied",
    ///     "restricted" and "no camera" are all first-class states no test
    ///     process can arrange for real.
    public init(
        dependencies: AppDependencies,
        camera: any CameraAuthorizing = SystemCameraAuthorization()
    ) {
        self.dependencies = dependencies
        self.camera = camera
    }
}

extension ReceiptCaptureViewModel {
    /// Reads the standing decision without prompting, so the screen can offer
    /// the camera or explain why it cannot before anything is tapped.
    public func refreshCameraAccess() {
        cameraAccess = camera.currentAccess()
    }

    /// Prompts if nobody has been asked, and opens the document camera only if
    /// the answer is yes.
    ///
    /// A refusal updates ``cameraAccess`` and stops there. There is no fallback
    /// path to send anybody down — unlike pairing, where a form sits under the
    /// scanner, a receipt with no photograph is nothing — so the screen's job
    /// in that state is to say which refusal it was and, where it can be
    /// undone, where to undo it.
    public func startCapture() async {
        problem = nil
        cameraAccess = await camera.requestAccess()
        isCameraPresented = cameraAccess == .authorized
    }

    /// Takes what a finished scan produced.
    ///
    /// - Parameters:
    ///   - parts: the pages that could be prepared for upload, in the order
    ///     they were photographed.
    ///   - pageCount: how many pages the scan actually held. Passed separately
    ///     rather than inferred from `parts`, because the two differing is
    ///     itself a failure this has to catch: a page that could not be encoded
    ///     is missing from `parts` and from nothing else.
    public func didCapture(_ parts: [ReceiptPart], from pageCount: Int) {
        isCameraPresented = false

        if let refusal = Self.refusal(for: parts, from: pageCount) {
            problem = refusal
            state = .ready
            return
        }

        problem = nil
        state = .reading(ReceiptSubmission(parts: parts))
    }

    /// Somebody backed out. Not a failure and not reported as one: closing the
    /// camera without a photograph is a decision, and painting an error over
    /// the screen for it would make every changed mind look like a fault.
    public func didCancelCapture() {
        isCameraPresented = false
        problem = nil
        state = .ready
    }

    /// The document camera reported a failure rather than a scan.
    ///
    /// The underlying error is deliberately not carried: VisionKit's failures
    /// are about its own capture session, there is nothing a person holding the
    /// phone can do differently for any particular one, and the honest next
    /// action — try again — is the same for all of them.
    public func didFailCapture() {
        isCameraPresented = false
        problem = .cameraFailed
        state = .ready
    }

    /// Back to the camera prompt, keeping the screen for a second receipt.
    ///
    /// The result screen is otherwise terminal, which would leave this tab
    /// showing one receipt's outcome until the app was relaunched.
    public func captureAnother() {
        problem = nil
        state = .ready
    }

    /// The result screen's model for a submission this screen produced.
    ///
    /// Built here rather than in the view because the repository arrives with
    /// ``AppDependencies``, and a view that reached for it would be a second
    /// place deciding what a capture is submitted through.
    public func result(for submission: ReceiptSubmission) -> ReceiptResultViewModel {
        ReceiptResultViewModel(parts: submission.parts, dependencies: dependencies)
    }

    /// Which problem, if any, stops these pages being a receipt.
    ///
    /// Ordered by what the person can act on. Too many pages is checked before
    /// a preparation failure because it is the one with a clear next move, and
    /// a scan long enough to be refused is likely to have a page or two that
    /// also failed to encode — reporting the encode would send somebody to
    /// retake a receipt that would be refused again for its length.
    private static func refusal(
        for parts: [ReceiptPart],
        from pageCount: Int
    ) -> ReceiptCaptureProblem? {
        guard pageCount > 0 else { return .noPages }
        guard pageCount <= ReceiptPart.maxPerReceipt else { return .tooManyPages(pageCount) }
        guard parts.count == pageCount else { return .unpreparedPages }
        return nil
    }
}
