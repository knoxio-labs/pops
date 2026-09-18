/// Whether a container can take more items. Only a container has one
/// (`isContainer`), and it is closed as `open | closed` per ADR-002 D1:
/// `sealed` is a history event on the phone, not a state a row holds, so it
/// has no case here.
public enum InventoryAccess: Hashable, Sendable {
    case open
    case closed

    public init(wire: String) {
        self = wire == "closed" ? .closed : .open
    }
}
