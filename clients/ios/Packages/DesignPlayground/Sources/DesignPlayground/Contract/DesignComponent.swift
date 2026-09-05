/// One control from the DesignSystem, in every shape it comes in.
///
/// Distinct from a ``DesignSurface`` by what it is *for*: a component is a
/// thing a surface composes, and reviewing it means seeing its variants
/// together — every prominence of a button, every tone of a status header —
/// rather than seeing one of them in a layout. The same distinction
/// `src/kit/` draws against `src/screens/` in the web playground.
public struct DesignComponent: Identifiable {
    public let id: String
    public let name: String
    /// What the component is for, and any contract worth knowing before using
    /// it. Read straight off the Swift docstring where there is one.
    public let synopsis: String
    /// Each shape the component comes in, as its own state.
    public let states: [DesignState]

    public init(id: String, name: String, synopsis: String, states: [DesignState]) {
        self.id = id
        self.name = name
        self.synopsis = synopsis
        self.states = states
    }
}
