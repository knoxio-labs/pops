/// What deleting a place does to what it holds, and the sentence its delete
/// confirmation says it in. The one statement of the rule both the app and the
/// design playground show, so the two cannot drift apart.
///
/// Child places move up to the deleted place's parent, or to the top level
/// when it had none. Everything placed directly in it, containers included,
/// becomes unlocated whatever the parent: it goes in hand, remembering the
/// deleted place. A container's contents stay in the container, so they are
/// not counted.
public struct InventoryLocationDeletion: Hashable, Sendable {
    public let name: String
    public let parentName: String?
    public let childPlaces: Int
    public let directContainers: Int
    public let directItems: Int

    public init(
        name: String, parentName: String?, childPlaces: Int, directContainers: Int,
        directItems: Int
    ) {
        self.name = name
        self.parentName = parentName
        self.childPlaces = childPlaces
        self.directContainers = directContainers
        self.directItems = directItems
    }

    /// The confirmation's sentence, e.g. "1 place moves to Home. 1 container
    /// and 2 items become unlocated."
    public var confirmation: String {
        let places = Self.phrase([Self.count(childPlaces, "place", "places")])
        let things = Self.phrase([
            Self.count(directContainers, "container", "containers"),
            Self.count(directItems, "item", "items"),
        ])
        var sentences: [String] = []
        if let places {
            let verb = childPlaces == 1 ? "moves" : "move"
            sentences.append("\(places) \(verb) to \(parentName ?? "the top level").")
        }
        if let things {
            let verb = directContainers + directItems == 1 ? "becomes" : "become"
            sentences.append("\(things) \(verb) unlocated.")
        }
        return sentences.isEmpty ? "Only \(name) is removed." : sentences.joined(separator: " ")
    }

    private static func count(_ value: Int, _ one: String, _ many: String) -> String? {
        value == 0 ? nil : "\(value) \(value == 1 ? one : many)"
    }

    private static func phrase(_ counts: [String?]) -> String? {
        let parts = counts.compactMap(\.self)
        guard let last = parts.last else { return nil }
        let head = parts.dropLast()
        return head.isEmpty ? last : head.joined(separator: ", ") + " and " + last
    }
}
