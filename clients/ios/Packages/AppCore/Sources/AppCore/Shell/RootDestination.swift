/// Everything the root view can be showing, as one value.
///
/// The view switches on this and draws; it decides nothing. That is what makes
/// "what does the app show on a cold launch with valid credentials" a test
/// rather than something somebody checks by relaunching a simulator.
public enum RootDestination: Hashable, Sendable {
    /// Reading what the device left behind. Not a screen anybody should
    /// recognise, and deliberately not the pairing screen: a launch that shows
    /// pairing for a frame and then replaces it reads as a bug, and it is the
    /// first thing an already-paired person would see every single launch.
    case launching

    /// Nothing to resume, or the session ended. The reason is `nil` for a
    /// device that was never paired and carries an explanation for one that
    /// was — a silent bounce back to pairing is the kind of thing that reads as
    /// a defect for months.
    case pairing(RevocationReason?)

    /// Paired, showing what the BFM says this app can show.
    case content(FeatureSurface)
}

/// What the paired app is offering, and how sure it is.
public struct FeatureSurface: Hashable, Sendable {
    /// Features to draw, in the BFM's order once it has answered. Empty means
    /// the server named nothing this build can show — which is a state with its
    /// own words on screen, not an error.
    public let available: [MobileFeature]

    /// Features the BFM named, said were not usable, and that this build would
    /// otherwise have drawn. Carried so the screen can say *which* thing is
    /// missing and why, rather than showing a blank.
    public let unavailable: [FeatureAvailability]

    /// Where the answer above came from.
    public let bootstrap: BootstrapPhase

    public init(
        available: [MobileFeature],
        unavailable: [FeatureAvailability],
        bootstrap: BootstrapPhase
    ) {
        self.available = available
        self.unavailable = unavailable
        self.bootstrap = bootstrap
    }
}

/// How far the app has got in asking the BFM what to show.
public enum BootstrapPhase: Hashable, Sendable {
    /// In flight, or not yet started. The surface underneath is this build's
    /// own guess and is not worth apologising for on screen — it is about to be
    /// replaced by an answer.
    case pending

    /// The BFM answered. ``RegistrySource`` says how current its own view of
    /// the federation was, which is a different question from whether a
    /// feature is up.
    case answered(RegistrySource)

    /// It did not answer. The app opened anyway — see ``AppShellModel`` — and
    /// says so, non-blockingly.
    case failed(RepositoryError)

    /// Whether the app should be telling the user it is working from an
    /// incomplete picture. A failed call qualifies; so does an answer the BFM
    /// built from a registry it could not reach.
    public var isDegraded: Bool {
        switch self {
        case .pending: false
        case .answered(let source): !source.isCurrent
        case .failed: true
        }
    }
}
