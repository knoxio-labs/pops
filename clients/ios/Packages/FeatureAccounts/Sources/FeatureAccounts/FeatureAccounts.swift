import AppCore

/// The accounts list, the account picker sheet, and the read-only account
/// dashboard.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens and primitives in `DesignSystem`.
/// `Auth` and `BFMClient` are deliberately absent — this reads an
/// ``AccountsRepository``, and only the composition root knows what is behind
/// it, if anything is bound at all.
///
/// This module is not registered on `RootFeature.renderable`: the BFM has no
/// `/mobile` accounts route yet, so there is nothing this build could bootstrap
/// against, and a screen wired into the tab bar ahead of that would show
/// `AppDependencies.unbound`'s failure state on every real device rather than
/// a screen nobody can reach.
public enum FeatureAccounts {
    public static let moduleName = "FeatureAccounts"

    /// Where this feature hangs off the app's route table.
    public static let entryRoute: Route = .accountsList
}
