/// Where the create flow was opened from.
///
/// The only thing that can pre-fill a placement, and the reason the first
/// segment exists at all: arriving from a container offers that container,
/// arriving from a location offers that location, and arriving from nowhere
/// offers neither.
internal struct InventoryCreationOrigin: Equatable {
    internal let container: String?
    internal let location: String?

    internal init(container: String? = nil, location: String? = nil) {
        self.container = container
        self.location = location
    }

    internal static let none = InventoryCreationOrigin()
}

/// The four answers to "where is it", as a segmented control's segments.
internal enum InventoryPlacementKind: String, CaseIterable, Identifiable {
    case currentContainer
    case anotherContainer
    case directLocation
    case inHand

    internal var id: String { rawValue }

    /// The segments a given entry point can offer. "Here" is not a segment
    /// when there is no here.
    internal static func offered(for origin: InventoryCreationOrigin) -> [InventoryPlacementKind] {
        allCases.filter { $0 != .currentContainer || origin.container != nil }
    }

    /// The choice this segment starts at. Everything the previous segment held
    /// is dropped, which is what makes the four mutually exclusive rather than
    /// four fields with one of them highlighted.
    internal func choice(for origin: InventoryCreationOrigin) -> InventoryPlacementChoice {
        switch self {
        case .currentContainer:
            guard let container = origin.container else {
                return .directLocation(origin.location)
            }
            return .currentContainer(container: container, location: origin.location)
        case .anotherContainer: return .anotherContainer(container: nil, location: nil)
        case .directLocation: return .directLocation(origin.location)
        case .inHand: return .inHand
        }
    }
}

/// Where the item will be when it exists.
///
/// Exactly one of the ADR's three placements, plus the distinction between
/// "the container I came from" and "some other container", which is an entry
/// point rather than a fourth kind of placement.
internal enum InventoryPlacementChoice: Equatable {
    case currentContainer(container: String, location: String?)
    case anotherContainer(container: String?, location: String?)
    case directLocation(String?)
    case inHand

    internal init(_ placement: InventoryPlacement) {
        switch placement {
        case .direct(let location): self = .directLocation(location)
        case .contained(let location, let containers):
            self = .anotherContainer(container: containers.last, location: location)
        case .inHand: self = .inHand
        }
    }

    internal var kind: InventoryPlacementKind {
        switch self {
        case .currentContainer: .currentContainer
        case .anotherContainer: .anotherContainer
        case .directLocation: .directLocation
        case .inHand: .inHand
        }
    }

    /// The container or location named, if one has been. Nil is a segment
    /// chosen and not yet answered, which is a real state the form has to
    /// draw.
    internal var target: String? {
        switch self {
        case .currentContainer(let container, _): container
        case .anotherContainer(let container, _): container
        case .directLocation(let location): location
        case .inHand: nil
        }
    }

    /// Whether the placement can be acted on. In hand needs no target; the
    /// other three do.
    internal var isResolved: Bool {
        kind == .inHand || target != nil
    }

    /// The same placement in the vocabulary every row already draws, so the
    /// review step shows the path rather than a second rendering of it.
    internal var placement: InventoryPlacement? {
        switch self {
        case .currentContainer(let container, let location):
            .contained(location: location, containers: [container])
        case .anotherContainer(let container, let location):
            container.map { .contained(location: location, containers: [$0]) }
        case .directLocation(let location):
            location.map { InventoryPlacement.direct(location: $0) }
        case .inHand:
            .inHand(previous: nil)
        }
    }

    /// What the placement row shows once a segment is chosen. Says what is
    /// still missing rather than showing an empty line.
    internal var summary: String {
        switch self {
        case .currentContainer(let container, _): "In \(container)"
        case .anotherContainer(let container, _): container.map { "In \($0)" } ?? "Pick a container"
        case .directLocation(let location): location ?? "Pick a location"
        case .inHand: "In hand"
        }
    }
}
