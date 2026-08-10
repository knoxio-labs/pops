import AppCore
import AppCoreFakes
import Testing

/// Which of three screens the app is on, for every way it can get there.
@Suite("App shell routing")
@MainActor
internal struct AppShellRoutingTests {
    @Test("before anything has been read, the app shows neither screen")
    func launchingBeforeRestore() {
        let fixture = AppShellFixture(restored: .paired(.fake()))

        #expect(fixture.destination == .launching)
    }

    /// The acceptance criterion this whole state exists for. A device that is
    /// already paired must never see the pairing screen, not even for the frame
    /// it takes to read a stored credential.
    @Test("a cold launch with valid credentials goes straight to content")
    func coldLaunchWithCredentials() async {
        let fixture = AppShellFixture(restored: .paired(.fake()))

        await fixture.launch()

        #expect(fixture.session.state == .paired(.fake()))
        guard case .content = fixture.destination else {
            Issue.record("expected content, got \(fixture.destination)")
            return
        }
    }

    @Test("a cold launch with nothing stored opens at pairing, with nothing to explain")
    func coldLaunchWithoutCredentials() async {
        let fixture = AppShellFixture()

        await fixture.launch()

        #expect(fixture.destination == .pairing(nil))
    }

    @Test("pairing moves the app to content without anything else being called")
    func pairingMovesToContent() async {
        let fixture = AppShellFixture()
        await fixture.launch()

        fixture.session.send(.paired(.fake()))

        guard case .content = fixture.destination else {
            Issue.record("expected content, got \(fixture.destination)")
            return
        }
    }

    /// A revocation mid-session returns to pairing **carrying the reason**. A
    /// silent bounce is the failure this case exists to prevent.
    @Test(
        "a revocation mid-session returns to pairing with the reason intact",
        arguments: [RevocationReason.revokedByOperator, .credentialsRejected]
    )
    func revokedMidSession(reason: RevocationReason) async {
        let fixture = AppShellFixture(restored: .paired(.fake()))
        await fixture.launch()

        fixture.session.send(.revoked(reason))

        #expect(fixture.destination == .pairing(reason))
    }

    @Test("re-pairing after a revocation clears the explanation")
    func repairingClearsTheExplanation() async {
        let fixture = AppShellFixture(restored: .paired(.fake()))
        await fixture.launch()
        fixture.session.send(.revoked(.revokedByOperator))

        fixture.session.send(.paired(.fake(id: "device-2")))

        guard case .content = fixture.destination else {
            Issue.record("expected content, got \(fixture.destination)")
            return
        }
    }

    @Test("signing out returns to pairing with nothing to explain")
    func signOut() async {
        let fixture = AppShellFixture(restored: .paired(.fake()))
        await fixture.launch()

        fixture.session.send(.signedOut)

        #expect(fixture.destination == .pairing(nil))
    }

    /// Restore reads storage, and storage is read once. A second call would be
    /// a second chance to overwrite a session that has moved on since.
    @Test("the stored session is read once per process")
    func restoreIsIdempotent() async {
        let fixture = AppShellFixture(restored: .paired(.fake()))
        await fixture.model.restoreSession()
        fixture.session.send(.signedOut)

        await fixture.model.restoreSession()

        #expect(fixture.destination == .pairing(nil))
    }
}
