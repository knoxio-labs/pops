/// Where a reviewable surface sits, and the only name it has.
///
/// Mirrors the web playground's address — `area/group…/slug` — because the two
/// playgrounds share a comment store and an id that means one thing on the web
/// and another on the phone would make a thread ambiguous about what it is
/// pinned to.
///
/// The area heads the browser and is the pillar the surface belongs to
/// (`accounts`, `receipts`) or a cross-cutting name (`shell`). Groups nest as
/// deep as the subject does and mean nothing else.
public struct SurfaceID: Hashable, Sendable, CustomStringConvertible {
    public let area: String
    public let groups: [String]
    public let slug: String

    public init(area: String, groups: [String] = [], slug: String) {
        self.area = area
        self.groups = groups
        self.slug = slug
    }

    /// The address a comment is anchored to, and what the browser shows.
    public var description: String {
        ([area] + groups + [slug]).joined(separator: "/")
    }
}
