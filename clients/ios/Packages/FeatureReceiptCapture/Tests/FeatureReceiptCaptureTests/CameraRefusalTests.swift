import AppCore
import Testing

@testable import FeatureReceiptCapture

/// The refusal states, asserted as values rather than as pixels.
///
/// This is the half of the capture screen that a render comparison cannot
/// reach. `ReceiptCaptureRenderingTests` shows the four camera answers draw
/// differently from one another, but they do that by copy alone — the Settings
/// link can be added to or taken from any of them and every one of those
/// comparisons still passes. It also only runs where the colour catalogue
/// compiled. These run everywhere and say what the screen is actually for.
@Suite("Camera refusal")
internal struct CameraRefusalTests {
    /// The states that mean "there is a camera", which get the button.
    private static let permitting: [CameraAccess] = [.notDetermined, .authorized]
    private static let refusing: [CameraAccess] = [.denied, .restricted, .unavailable]

    @Test("a camera that can be opened is not a refusal", arguments: permitting)
    func permittedAccessIsNoRefusal(access: CameraAccess) {
        #expect(CameraRefusal.refusing(access) == nil)
    }

    @Test("every refusal says something", arguments: refusing)
    func everyRefusalHasCopy(access: CameraAccess) throws {
        let refusal = try #require(CameraRefusal.refusing(access))

        #expect(!refusal.message.isEmpty)
    }

    /// The rule this file exists for. `restricted` is a profile or Screen Time
    /// policy and `unavailable` is a device with no camera; neither is
    /// something the person can go and change, so neither is offered the trip.
    @Test("only a camera the person refused themselves is offered Settings")
    func onlyDeniedOffersSettings() throws {
        let denied = try #require(CameraRefusal.refusing(.denied))
        let restricted = try #require(CameraRefusal.refusing(.restricted))
        let unavailable = try #require(CameraRefusal.refusing(.unavailable))

        #expect(denied.offersSettings)
        #expect(
            !restricted.offersSettings,
            "a profile or Screen Time refusal cannot be undone in Settings")
        #expect(
            !unavailable.offersSettings, "a device with no camera has nothing to change in Settings"
        )
    }

    /// Three refusals, three sentences. One line covering all of them would
    /// leave somebody under an MDM profile reading that they declined a
    /// permission they were never asked for.
    @Test("no two refusals say the same thing")
    func refusalsReadDifferently() throws {
        let messages = try Self.refusing.map { try #require(CameraRefusal.refusing($0)).message }

        #expect(Set(messages).count == messages.count)
    }
}
