import Foundation

/// How the drain waits out its backoff. `SystemDrainClock` really sleeps;
/// tests decide when a sleep ends.
public protocol InventoryDrainClock: Sendable {
    /// Returns after `duration`, or throws `CancellationError` if the task
    /// is cancelled first.
    func sleep(for duration: Duration) async throws
}

/// ``InventoryDrainClock`` over `ContinuousClock`, which keeps counting
/// while the device sleeps.
public struct SystemDrainClock: InventoryDrainClock {
    public init() {}

    public func sleep(for duration: Duration) async throws {
        try await ContinuousClock().sleep(for: duration)
    }
}
