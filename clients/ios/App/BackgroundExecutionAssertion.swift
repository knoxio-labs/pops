import UIKit

/// Keeps the app running while `work` finishes after it leaves the
/// foreground. The assertion ends exactly once: when `work` returns, or when
/// the system's expiration handler fires first. `begin` and `end` are
/// `UIApplication`'s `beginBackgroundTask` and `endBackgroundTask`.
@MainActor
internal final class BackgroundExecutionAssertion {
    private let end: (UIBackgroundTaskIdentifier) -> Void
    private var identifier = UIBackgroundTaskIdentifier.invalid

    private init(end: @escaping (UIBackgroundTaskIdentifier) -> Void) {
        self.end = end
    }

    /// Begins the assertion, runs `work`, and ends it. A refused assertion
    /// (`.invalid`) still runs `work`.
    @discardableResult
    internal static func hold(
        begin: (@escaping @MainActor @Sendable () -> Void) -> UIBackgroundTaskIdentifier,
        end: @escaping (UIBackgroundTaskIdentifier) -> Void,
        while work: @escaping @MainActor () async -> Void
    ) -> Task<Void, Never> {
        let assertion = BackgroundExecutionAssertion(end: end)
        assertion.identifier = begin { assertion.release() }
        return Task {
            await work()
            assertion.release()
        }
    }

    private func release() {
        guard identifier != .invalid else { return }
        end(identifier)
        identifier = .invalid
    }
}
