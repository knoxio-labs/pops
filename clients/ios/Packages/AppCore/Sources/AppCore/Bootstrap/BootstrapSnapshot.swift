import Foundation

/// Something the app can put on screen, named by the BFM rather than by this
/// build.
///
/// A `RawRepresentable` wrapper for the same reason ``TransactionType`` is one:
/// the server's vocabulary grows and this app is on hardware nobody controls.
/// A feature id this build has never heard of arrives intact and is skipped by
/// whatever maps ids to screens, rather than failing to decode and taking the
/// whole response with it.
///
/// The constants below are conveniences for that mapping and for tests. They
/// are **not** a list of what exists — only the BFM knows that.
public struct MobileFeature: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let transactions = MobileFeature(rawValue: "transactions")
    public static let accounts = MobileFeature(rawValue: "accounts")
    public static let purchases = MobileFeature(rawValue: "purchases")
    public static let receiptCapture = MobileFeature(rawValue: "receipt-capture")
}

/// How reachable the BFM found the pillar behind a feature.
///
/// Four states rather than a boolean, and the two that look alike are the
/// reason: ``unavailable`` is "nothing answered", ``contractMismatch`` is
/// "something answered and this build cannot speak to it". They call for
/// different words on screen — one is worth waiting out and the other is not —
/// and a boolean would throw away the only useful information on the one
/// occasion this response earns its keep.
public struct FeatureReachability: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let healthy = FeatureReachability(rawValue: "healthy")
    public static let degraded = FeatureReachability(rawValue: "degraded")
    public static let unavailable = FeatureReachability(rawValue: "unavailable")
    public static let contractMismatch = FeatureReachability(rawValue: "contract-mismatch")

    /// Whether a screen for this feature is worth opening.
    ///
    /// `degraded` counts as usable: it means slow or partially answering, not
    /// absent, and a list that loads eventually beats a sentence explaining
    /// that it might not. Anything this build does not recognise counts as
    /// usable too — a state added after this binary shipped is more likely to
    /// be a finer shade of "working" than a new way of being broken, and
    /// hiding a feature on a word we cannot read is the worse mistake.
    public var isUsable: Bool {
        self != .unavailable && self != .contractMismatch
    }
}

/// One feature, and what the BFM says about it.
public struct FeatureAvailability: Hashable, Sendable {
    public let id: MobileFeature
    public let reachability: FeatureReachability

    public init(id: MobileFeature, reachability: FeatureReachability) {
        self.id = id
        self.reachability = reachability
    }
}

/// How fresh the BFM's own view of the federation was.
///
/// Worth carrying because it separates "finance is down" from "the BFM could
/// not ask" — the second is a reason to show what we have and say so, not a
/// reason to hide anything.
public struct RegistrySource: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let fresh = RegistrySource(rawValue: "fresh")
    public static let cached = RegistrySource(rawValue: "cached")
    public static let staleFallback = RegistrySource(rawValue: "stale-fallback")
    public static let unavailable = RegistrySource(rawValue: "unavailable")

    /// Whether the answer was built from a registry the BFM could actually
    /// reach. `cached` counts: a TTL'd read is the normal path, not a
    /// degradation.
    public var isCurrent: Bool {
        self == .fresh || self == .cached
    }
}

/// The app's first authenticated call, as the app reads it.
///
/// This is what replaces a compiled-in idea of what the app can do. The build
/// knows how to *draw* a set of features; it is told which of them are there.
///
/// The BFM's response also lists every pillar it can see. That list is not
/// modelled here, deliberately: it is the federation's own observability and
/// nothing on a phone screen is derived from it, so carrying it would be a
/// field that exists to be inspected in a debugger.
public struct BootstrapSnapshot: Hashable, Sendable {
    /// The device as the BFM knows it, which is the only place its
    /// operator-facing name comes from — the phone never had one to give.
    public let device: BootstrapDevice
    public let registrySource: RegistrySource
    /// Every feature the BFM named, in the order it named them. Order is the
    /// server's to choose and is preserved rather than sorted here.
    public let features: [FeatureAvailability]

    public init(
        device: BootstrapDevice,
        registrySource: RegistrySource,
        features: [FeatureAvailability]
    ) {
        self.device = device
        self.registrySource = registrySource
        self.features = features
    }
}

/// What the BFM says about the handset asking.
public struct BootstrapDevice: Hashable, Sendable {
    public let id: String
    /// The label the operator sees on the revoke screen, echoed back so the app
    /// can show the same words.
    public let name: String
    /// When the BFM last saw this device, which this very call has just
    /// updated. The server's clock, not the phone's.
    public let lastSeenAt: Date

    public init(id: String, name: String, lastSeenAt: Date) {
        self.id = id
        self.name = name
        self.lastSeenAt = lastSeenAt
    }
}

/// Asking the BFM what this app should show.
public protocol BootstrapService: Sendable {
    /// - Throws: ``RepositoryError``. A failure here must not stop the app
    ///   opening — see ``AppShellModel``.
    func bootstrap() async throws -> BootstrapSnapshot
}
