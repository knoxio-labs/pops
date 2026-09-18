/// How many identical things one record stands for, all in one placement.
///
/// The server enforces `quantity >= 1` (ADR-002 D3): no approved action ever
/// produces zero, so `badge` handling a count below one is defensive rather
/// than a state this app expects to draw, and is kept only so a value this
/// build should never see still renders instead of crashing.
public struct InventoryQuantity: Hashable, Sendable {
    public let count: Int

    public init(count: Int) {
        self.count = count
    }

    /// What a row shows. A single thing shows nothing, a "1" on every row is
    /// noise, and a count below the server's invariant says so rather than
    /// showing a value that reads like an error.
    public var badge: String? {
        switch count {
        case 1: nil
        case ..<1: "None left"
        default: "×\(count)"
        }
    }
}
