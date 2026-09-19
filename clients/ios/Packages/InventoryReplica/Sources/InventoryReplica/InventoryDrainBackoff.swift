/// How long the drain waits before trying again after passes that did not
/// empty the log (ADR-002 D11): 2 seconds after the first, doubling with each
/// one after it, and never more than 5 minutes.
internal enum InventoryDrainBackoff {
    static let first: Duration = .seconds(2)
    static let ceiling: Duration = .seconds(300)

    /// - Parameter failures: Consecutive passes that did not empty the log,
    ///   counting the one just finished; below 1 is treated as 1.
    static func delay(afterFailures failures: Int) -> Duration {
        var delay = first
        for _ in 1..<max(failures, 1) {
            delay *= 2
            if delay >= ceiling { return ceiling }
        }
        return delay
    }
}
