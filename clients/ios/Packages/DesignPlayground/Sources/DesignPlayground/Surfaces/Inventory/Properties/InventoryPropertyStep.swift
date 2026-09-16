/// Which moment of the item's life a variant is being asked to draw.
///
/// The variants differ most at the edges, creating something the catalogue
/// has never seen, and finding it again a year later, so a comparison that
/// only showed the detail screen would compare the easy half. Every variant
/// implements all five, on the same fixtures, and a variant that has nothing
/// to show for one of them is answering the question by omission.
internal enum InventoryPropertyStep: Equatable {
    /// An object as it stands, with whatever it knows.
    case detail(InventoryThing)
    /// Something arriving: nothing entered, inference proposing.
    /// `inferring` false is the offline-or-unavailable case.
    case create(InventoryThing, inferring: Bool)
    /// Mid-edit: pending suggestions, a custom key being typed, and a value
    /// whose unit the catalogue does not know.
    case edit(InventoryThing)
    /// Finding objects by what they can do rather than by their name.
    case search([InventoryThing], [InventoryPropertyClause])
    /// Two near-identical objects, where the difference is the point.
    case compare([InventoryThing])
    /// Changing what an object is, and what that does to what it knows.
    /// Added after the first review: the four original variants all assumed a
    /// type was already chosen, which is the assumption a reviewer asked to
    /// see broken.
    case swap(InventoryThing, to: InventoryTemplate)
}
