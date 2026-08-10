import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePairing

/// When the form may be submitted, and what happens while it is being.
@MainActor
@Suite("PairingViewModel — submission")
internal struct PairingSubmissionTests {
    private func model(
        pairing: any DevicePairingService = FakeDevicePairingService(),
        session: SessionStore = SessionStore()
    ) -> PairingViewModel {
        PairingViewModel(
            session: session,
            dependencies: .fake(pairing: pairing),
            camera: StubCameraAuthorization(standing: .authorized),
            device: StubDeviceDescription()
        )
    }

    @Test("a complete form submits")
    func completeFormSubmits() {
        let model = model()
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"

        #expect(model.canSubmit)
        #expect(model.submissionProblem == nil)
    }

    /// Each blocker names the field to fix, in the order someone would fill
    /// them in. A disabled button with no stated reason is a dead end for
    /// anyone who cannot see which box is still empty — this is what the
    /// button's accessibility hint reads from.
    @Test(
        "an incomplete form says which field is holding it up",
        arguments: [
            ("", "7QK4", "iPhone", PairingInputProblem.missingServer),
            ("not a url", "7QK4", "iPhone", .missingServer),
            ("https://bfm.example.com", "", "iPhone", .missingCode),
            ("https://bfm.example.com", "   ", "iPhone", .missingCode),
            ("https://bfm.example.com", "7QK4", "", .missingName),
            (
                "https://bfm.example.com", String(repeating: "A", count: 65), "iPhone",
                .fieldTooLong
            ),
            (
                "https://bfm.example.com", "7QK4", String(repeating: "N", count: 65),
                .fieldTooLong
            ),
        ])
    func incompleteFormNamesTheProblem(
        baseURL: String,
        code: String,
        name: String,
        expected: PairingInputProblem
    ) {
        let model = model()
        model.baseURLText = baseURL
        model.codeText = code
        model.deviceNameText = name

        #expect(model.submissionProblem == expected)
        #expect(!model.canSubmit)
    }

    @Test("submitting an incomplete form does nothing rather than failing")
    func incompleteFormDoesNotCallTheService() async throws {
        let pairing = FakeDevicePairingService()
        let model = model(pairing: pairing)
        model.codeText = "7QK4"

        await model.pair()

        #expect(await pairing.callCount == 0)
        // No error either: nothing was attempted, so there is nothing to
        // report — the button was disabled and says why.
        #expect(model.failure == nil)
    }

    @Test("the screen reports itself busy for the whole of a pairing")
    func reportsBusyWhileInFlight() async throws {
        let gate = GatedPairingService()
        let session = SessionStore()
        let model = model(pairing: gate, session: session)
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"

        let inFlight = Task { await model.pair() }
        await gate.waitUntilCalled()

        #expect(model.isPairing)
        #expect(!model.canSubmit)

        await gate.release()
        await inFlight.value

        #expect(!model.isPairing)
        #expect(session.state == .paired(.fake()))
    }

    /// A pairing code is single-use. A second submission racing the first would
    /// spend it, and the reply to the loser would be that the code did not work
    /// — after it had already worked.
    @Test("a second submission while one is in flight is dropped, not queued")
    func secondSubmissionIsDropped() async throws {
        let gate = GatedPairingService()
        let model = model(pairing: gate)
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"

        let inFlight = Task { await model.pair() }
        await gate.waitUntilCalled()

        await model.pair()
        #expect(await gate.callCount == 1)

        await gate.release()
        await inFlight.value
    }
}
