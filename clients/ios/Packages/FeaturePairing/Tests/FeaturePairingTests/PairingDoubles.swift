import AppCore
import AppCoreFakes

@testable import FeaturePairing

internal struct StubDeviceDescription: DeviceDescribing {
    internal var suggestedName = "iPhone"
    internal var modelIdentifier = "iPhone17,1"
}

/// A pairing service that parks mid-call until the test lets it go.
///
/// The only way to observe what the screen does *while* a pairing is in
/// flight — the spinner, and the guard that stops a second tap spending the
/// code twice. Both are actor-serialised, so the handshake is deterministic
/// rather than a sleep.
internal actor GatedPairingService: DevicePairingService {
    internal private(set) var callCount = 0

    private var arrival: CheckedContinuation<Void, Never>?
    private var held: [CheckedContinuation<Void, Never>] = []
    private let result: Result<PairedDevice, PairingError>

    internal init(result: Result<PairedDevice, PairingError> = .success(.fake())) {
        self.result = result
    }

    internal func pair(_ request: PairingRequest) async throws -> PairedDevice {
        callCount += 1
        arrival?.resume()
        arrival = nil
        await withCheckedContinuation { held.append($0) }
        return try result.get()
    }

    /// Returns once ``pair(_:)`` has been entered at least once.
    internal func waitUntilCalled() async {
        guard callCount == 0 else { return }
        await withCheckedContinuation { arrival = $0 }
    }

    internal func release() {
        for continuation in held { continuation.resume() }
        held = []
    }
}
