/// A page: one screen of the app, in every condition worth looking at.
///
/// The unit a design review is about. It carries no data of its own and asks
/// for none — each of its states closes over a fixture, which is what lets the
/// whole playground run with the phone in flight mode.
public struct DesignSurface: Identifiable {
    public let id: SurfaceID
    public let title: String
    /// One line on what question this surface is meant to answer. Shown under
    /// the title in the browser, so a list of twenty surfaces stays readable.
    public let synopsis: String?
    /// The chrome this surface is designed for. A default, not a lock — the
    /// inspector overrides it.
    public let chrome: Chrome
    public let states: [DesignState]

    public init(
        id: SurfaceID,
        title: String,
        synopsis: String? = nil,
        chrome: Chrome = .navigationLarge,
        states: [DesignState]
    ) {
        self.id = id
        self.title = title
        self.synopsis = synopsis
        self.chrome = chrome
        self.states = states
    }

    /// The state to open on, and the one the browser's row previews.
    public var openingState: DesignState? { states.first }

    public func state(id: String) -> DesignState? {
        states.first { $0.id == id }
    }
}
