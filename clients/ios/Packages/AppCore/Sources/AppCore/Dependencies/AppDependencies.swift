import SwiftUI

/// Everything a feature is allowed to reach outside itself, as protocols.
///
/// A feature reads what it needs from here and can name no concrete type; the
/// composition root is the only place that decides what each of these is.
public struct AppDependencies: Sendable {
    public let transactions: any TransactionsRepository
    public let pairing: any DevicePairingService
    public let reachability: any ReachabilityWitness

    public init(
        transactions: any TransactionsRepository,
        pairing: any DevicePairingService,
        reachability: any ReachabilityWitness
    ) {
        self.transactions = transactions
        self.pairing = pairing
        self.reachability = reachability
    }

    /// What the environment holds until something binds it. Every call fails
    /// with `dependencyNotBound` rather than trapping, so a missed binding
    /// shows up as a screen's error state instead of as a crash on a phone.
    /// ``reachability`` has no failure mode to fall into instead — reporting
    /// evidence nobody is listening for is simply nothing to do.
    public static let unbound = AppDependencies(
        transactions: UnboundTransactionsRepository(),
        pairing: UnboundDevicePairingService(),
        reachability: UnboundReachabilityWitness()
    )
}

extension EnvironmentValues {
    @Entry public var appDependencies: AppDependencies = .unbound
}
