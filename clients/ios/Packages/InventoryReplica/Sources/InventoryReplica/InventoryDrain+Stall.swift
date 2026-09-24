import AppCore
import os

extension InventoryDrain {
    private static let log = Logger(subsystem: "com.knoxiolabs.pops", category: "inventory-drain")

    /// Shows why a pass stopped (POPS-4493): offline or blocked as the online
    /// store records them, and any other failure as a sending stall, logged,
    /// since no network retry moves it. A stall already showing keeps the
    /// time it began.
    func report(_ error: any Error) {
        online.noteFailure(error)
        guard Self.stallsSending(error) else { return }
        let kind = String(describing: type(of: error))
        let detail = String(reflecting: error)
        Self.log.error(
            "sending stopped on \(kind, privacy: .public): \(detail, privacy: .private)")
        let at = now()
        replica.updateActivity { activity in
            if activity.sendingStall == nil {
                activity.sendingStall = InventorySendingStall(since: at)
            }
        }
    }

    /// A pass got through everything it could send: nothing is stuck.
    func clearStall() {
        replica.updateActivity { $0.sendingStall = nil }
    }

    /// Whether `error` is one no network retry fixes: not the network, not a
    /// resync, not the session or the build (which show as blocked), and not
    /// the pass being cancelled.
    static func stallsSending(_ error: any Error) -> Bool {
        !(error is CancellationError) && OnlineInventoryStore.blockReason(for: error) == nil
            && !OnlineInventoryStore.needsResync(error)
            && !OnlineInventoryStore.isUnreachable(error)
    }
}
