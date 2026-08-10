import AppCore
import Auth
import Synchronization

/// A ``PairedDeviceStore`` that keeps the device in memory, and can be told to
/// refuse.
///
/// The refusal is the reason this is not simply a dictionary. Storing the
/// identity is the last step of pairing, and a failure there leaves a device
/// registered on a server it can no longer name — the one outcome
/// ``BFMDevicePairingService`` cleans up after, and the one no test can arrange
/// against a store that always works.
public final class InMemoryPairedDeviceStore: PairedDeviceStore {
    private let state = Mutex<State>(State())

    public init(initial: PairedDevice? = nil) {
        state.withLock { $0.device = initial }
    }

    /// Makes every ``save(_:)`` from now on throw.
    public func failWrites() {
        state.withLock { $0.writesFail = true }
    }

    public func load() throws -> PairedDevice? {
        state.withLock { $0.device }
    }

    public func save(_ device: PairedDevice) throws {
        try state.withLock {
            guard !$0.writesFail else { throw PairedDeviceStoreError.corruptedPayload }
            $0.device = device
        }
    }

    public func wipe() throws {
        state.withLock { $0.device = nil }
    }
}

extension InMemoryPairedDeviceStore {
    private struct State {
        var device: PairedDevice?
        var writesFail = false
    }
}
