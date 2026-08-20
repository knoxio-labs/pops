import AppCore
import AppCoreFakes
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture

/// The camera half of the capture screen: whether it opens, what happens when
/// it may not, and what a finished scan becomes.
///
/// Every one of these is a state no test process can reach for real — the
/// permission dialog cannot be answered from one, and the Simulator's document
/// camera never produces a frame at all — which is exactly why the decisions
/// live in a model that takes the camera as a seam and takes pages as bytes.
@MainActor
@Suite("ReceiptCaptureViewModel — capturing")
internal struct ReceiptCaptureFlowTests {
    private static func model(
        camera: StubCameraAuthorization,
        repository: InMemoryReceiptCaptureRepository = InMemoryReceiptCaptureRepository()
    ) -> ReceiptCaptureViewModel {
        ReceiptCaptureViewModel(
            dependencies: .fake(receiptCapture: repository),
            camera: camera
        )
    }

    /// Pages that are bytes and nothing more. What VisionKit produced, and
    /// whether it was legible, is not this layer's question — only that a
    /// receipt's photographs arrive in order and stay that way.
    private static func pages(_ count: Int) -> [ReceiptPart] {
        (0..<count).map {
            ReceiptPart(mediaType: .jpeg, data: Data("page-\($0)".utf8))
        }
    }

    @Test("granting access opens the document camera")
    func authorizedOpensTheCamera() async {
        let camera = StubCameraAuthorization(standing: .notDetermined, afterPrompt: .authorized)
        let model = Self.model(camera: camera)

        await model.startCapture()

        #expect(model.cameraAccess == .authorized)
        #expect(model.isCameraPresented)
        #expect(camera.promptCount == 1)
    }

    /// The acceptance criterion, and the one that matters on a real phone: a
    /// refusal is a state, not a crash and not a camera showing black forever.
    ///
    /// `.unavailable` is in this list for a specific reason rather than for
    /// symmetry. It is what every Simulator reports — asserted against the real
    /// `SystemCameraAuthorization` by `AppCore`'s own Simulator suite — so it is
    /// the state an automated UI flow actually meets, and
    /// `VNDocumentCameraViewController.isSupported` cannot be used to detect it
    /// because it answers `true` there.
    @Test(
        "a refusal leaves the camera shut and says so",
        arguments: [CameraAccess.denied, .restricted, .unavailable])
    func refusalKeepsTheCameraShut(refusal: CameraAccess) async {
        let camera = StubCameraAuthorization(standing: .notDetermined, afterPrompt: refusal)
        let model = Self.model(camera: camera)

        await model.startCapture()

        #expect(model.cameraAccess == refusal)
        #expect(!model.isCameraPresented)
        #expect(model.state == .ready)
        // Not reported as a capture problem: nothing was captured and nothing
        // went wrong with a capture. Which refusal it was is what the screen
        // renders, and it is on `cameraAccess`.
        #expect(model.problem == nil)
    }

    @Test("the standing decision is read without prompting")
    func refreshDoesNotPrompt() {
        let camera = StubCameraAuthorization(standing: .denied)
        let model = Self.model(camera: camera)

        model.refreshCameraAccess()

        #expect(model.cameraAccess == .denied)
        #expect(camera.promptCount == 0)
    }

    /// Somebody who allowed the camera in Settings comes back to a screen that
    /// has not been re-created. Without a re-read it keeps claiming it cannot
    /// use the camera until the app is relaunched.
    @Test("a decision changed outside the app is picked up on the next read")
    func accessChangedInSettingsIsPickedUp() {
        let camera = StubCameraAuthorization(standing: .denied)
        let model = Self.model(camera: camera)
        model.refreshCameraAccess()

        camera.standing = .authorized
        model.refreshCameraAccess()

        #expect(model.cameraAccess == .authorized)
    }

    /// The multi-page contract, end to end and in one assertion: every page of
    /// one scan is one receipt, in the order it was photographed, and it
    /// reaches the repository as ONE call. Several photographs of one piece of
    /// paper are never several receipts.
    @Test("a multi-page scan is one receipt, in order, in one call")
    func multiplePagesAreOneSubmission() async {
        let repository = InMemoryReceiptCaptureRepository()
        let model = Self.model(
            camera: StubCameraAuthorization(standing: .authorized), repository: repository)
        let pages = Self.pages(3)

        model.didCapture(pages, from: 3)

        guard case .reading(let submission) = model.state else {
            Issue.record("a three-page scan did not become a submission: \(model.state)")
            return
        }
        #expect(submission.parts == pages)
        #expect(!model.isCameraPresented)
        #expect(model.problem == nil)

        // Through the result model this screen builds, rather than through the
        // repository directly — the handoff is the half a wrong wiring would
        // break while every assertion above still passed.
        await model.result(for: submission).submit()

        let received = await repository.received
        #expect(received == [pages], "the pages did not reach the repository as one ordered call")
        #expect(await repository.callCount == 1)
    }

    @Test("a single-page scan is still a receipt")
    func onePageIsASubmission() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))

        model.didCapture(Self.pages(1), from: 1)

        guard case .reading(let submission) = model.state else {
            Issue.record("a one-page scan did not become a submission: \(model.state)")
            return
        }
        #expect(submission.parts == Self.pages(1))
    }

    /// Backing out is a decision, not a fault. A screen that painted an error
    /// over every changed mind would be one nobody trusts when something has
    /// actually gone wrong.
    @Test("cancelling closes the camera and reports nothing")
    func cancellingIsNotAFailure() async {
        let model = Self.model(
            camera: StubCameraAuthorization(standing: .authorized))
        await model.startCapture()
        #expect(model.isCameraPresented)

        model.didCancelCapture()

        #expect(!model.isCameraPresented)
        #expect(model.state == .ready)
        #expect(model.problem == nil)
    }

    @Test("a camera failure closes the camera and says so")
    func captureFailureIsReported() async {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        await model.startCapture()

        model.didFailCapture()

        #expect(!model.isCameraPresented)
        #expect(model.state == .ready)
        #expect(model.problem == .cameraFailed)
    }

    @Test("a scan that produced no pages is refused rather than submitted")
    func anEmptyScanSubmitsNothing() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))

        model.didCapture([], from: 0)

        #expect(model.state == .ready)
        #expect(model.problem == .noPages)
    }

    /// A receipt missing a page still adds up to a total — just not the one
    /// printed on the paper — so a short upload would come back as a confident,
    /// wrong reading. Refusing the whole scan is the only outcome that does not
    /// quietly misstate somebody's money.
    @Test("a page that could not be prepared refuses the whole receipt")
    func aDroppedPageRefusesTheReceipt() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))

        model.didCapture(Self.pages(2), from: 3)

        #expect(model.state == .ready)
        #expect(model.problem == .unpreparedPages)
    }

    /// The BFM refuses more than ``ReceiptPart/maxPerReceipt`` parts outright.
    /// Catching it here is what turns an opaque rejection — paid for over
    /// however many megabytes — into a sentence saying what to do instead.
    @Test("a scan longer than the wire limit is refused before it is sent")
    func tooManyPagesAreRefusedOnDevice() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        let overLong = ReceiptPart.maxPerReceipt + 1

        model.didCapture(Self.pages(overLong), from: overLong)

        #expect(model.state == .ready)
        #expect(model.problem == .tooManyPages(overLong))
    }

    /// The precedence the model's own doc comment claims: too-many-pages is
    /// checked before a page that could not be prepared. A scan can only ever
    /// show this ordering when both are true at once — one condition alone
    /// tells you nothing about which came first — so this is the one input
    /// that exercises it. `aDroppedPageRefusesTheReceipt` and
    /// `tooManyPagesAreRefusedOnDevice` each isolate a single condition and
    /// would stay green if the two guards were swapped.
    @Test("a scan that is both over the limit and short a page is refused for its length")
    func tooManyPagesTakesPrecedenceOverAnUnpreparedPage() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        let overLong = ReceiptPart.maxPerReceipt + 1

        model.didCapture(Self.pages(overLong - 1), from: overLong)

        #expect(model.state == .ready)
        #expect(model.problem == .tooManyPages(overLong))
    }

    @Test("exactly the wire limit is still a receipt")
    func theLimitItselfIsAccepted() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        let atLimit = ReceiptPart.maxPerReceipt

        model.didCapture(Self.pages(atLimit), from: atLimit)

        guard case .reading(let submission) = model.state else {
            Issue.record("a scan at the limit was refused: \(String(describing: model.problem))")
            return
        }
        #expect(submission.parts.count == atLimit)
    }

    @Test("starting a capture clears the last complaint")
    func startingAgainClearsTheProblem() async {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        model.didCapture([], from: 0)
        #expect(model.problem == .noPages)

        await model.startCapture()

        #expect(model.problem == nil)
    }

    /// The result screen is otherwise terminal. Without this the tab shows one
    /// receipt's outcome until the app is relaunched.
    @Test("a second receipt is a second submission, not the first one again")
    func aSecondReceiptGetsItsOwnSubmission() {
        let model = Self.model(camera: StubCameraAuthorization(standing: .authorized))
        model.didCapture(Self.pages(1), from: 1)
        guard case .reading(let first) = model.state else {
            Issue.record("the first capture did not become a submission")
            return
        }

        model.captureAnother()
        #expect(model.state == .ready)
        model.didCapture(Self.pages(2), from: 2)

        guard case .reading(let second) = model.state else {
            Issue.record("the second capture did not become a submission")
            return
        }
        // The identity is what SwiftUI keys the result screen on. Two receipts
        // sharing one would mean the second showing the first's outcome having
        // never been sent.
        #expect(second.id != first.id)
        #expect(second.parts.count == 2)
    }

    /// The property above — two submissions get two different IDs — is not
    /// what actually protects anybody. `ReceiptCaptureView` has to key its
    /// `ReceiptResultView` on that ID with `.id(submission.id)`, or SwiftUI
    /// treats the second submission as the same view as the first: the
    /// `@State`-boxed result model never resets, `.task` never reruns, and
    /// the screen keeps showing the first receipt's outcome for a second
    /// receipt that was never uploaded. This test exercises the view, not the
    /// model, so it fails if that key is ever dropped.
    ///
    /// `ImageRenderer` cannot rasterise past a `.task` (see
    /// `ReceiptResultRenderingTests`), so this does not compare pixels. It
    /// reuses one `ImageRenderer` across two submissions — the documented way
    /// to exercise SwiftUI's view-identity/state machinery outside a real
    /// host — and asserts through the repository the screen submits to:
    /// whether the second submission's `.task` ever ran at all.
    @Test("a second receipt's result screen submits again rather than reusing the first one's")
    func aSecondReceiptResubmitsThroughTheView() async {
        let repository = ScriptedReceiptCaptureRepository(
            script: [
                .outcome(.unreadable(receiptCount: 0, reason: "first")),
                .outcome(.unreadable(receiptCount: 0, reason: "second")),
            ])
        let model = ReceiptCaptureViewModel(
            dependencies: .fake(receiptCapture: repository),
            camera: StubCameraAuthorization(standing: .authorized))

        model.didCapture(Self.pages(1), from: 1)
        let renderer = ImageRenderer(
            content: ReceiptCaptureView(model: model).frame(width: 320, height: 700))
        renderer.scale = 1
        _ = renderer.cgImage
        await repository.waitUntilCalled(1)

        model.captureAnother()
        model.didCapture(Self.pages(2), from: 2)
        renderer.content = ReceiptCaptureView(model: model).frame(width: 320, height: 700)
        _ = renderer.cgImage

        // A bounded backstop, not a poll: the success path is the
        // genuinely-signalled `waitUntilCalled` continuation below. Both
        // racers are unstructured `Task`s rather than a `TaskGroup`, because
        // `waitUntilCalled` parks on a plain `withCheckedContinuation` that
        // cancellation does not resume — a structured group would block at
        // scope exit waiting for the loser exactly in the regression this
        // test exists to catch (the second call never arrives). The loser
        // here is left to finish (or, in the regression case, to leak
        // harmlessly past the end of the test) rather than awaited.
        await firstToFinish(
            { await repository.waitUntilCalled(2) },
            { try? await Task.sleep(for: .seconds(2)) }
        )

        #expect(
            await repository.callCount == 2,
            """
            the second receipt never reached the repository — the result screen kept the first \
            submission's identity instead of starting a fresh one
            """)
        #expect(await repository.received.map(\.count) == [1, 2])
    }
}
