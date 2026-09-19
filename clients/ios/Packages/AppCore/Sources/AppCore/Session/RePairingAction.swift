import SwiftUI

/// Bounces the app back to the pairing screen, the same way an operator's
/// revocation or a rejected credentials refresh already does.
///
/// A feature reaches for this instead of `SessionStore` directly, which is
/// deliberately not exposed outside the composition root: a feature module
/// may need to start re-pairing (its own replica has decided the session is
/// unusable) without being handed the means to inspect or drive session
/// state generally.
public struct RePairingAction: Sendable {
    private let action: @Sendable @MainActor () -> Void

    public init(_ action: @escaping @Sendable @MainActor () -> Void) {
        self.action = action
    }

    @MainActor
    public func callAsFunction() {
        action()
    }
}

extension EnvironmentValues {
    /// Does nothing until the composition root wires in the real action.
    /// Calling this before that happens is silently a no-op rather than a
    /// crash, the same failure-first default ``AppDependencies/unbound``
    /// gives every seam nothing has bound yet — a preview or a test that
    /// never sets this is not obliged to.
    @Entry public var startRePairing = RePairingAction {}
}
