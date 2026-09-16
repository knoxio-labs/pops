/// One item as a row needs it.
///
/// A row-shaped view of the vocabulary, not a record: it carries what a
/// person reads, and nothing about how an item is stored. `code` in
/// particular is shown as an opaque string; the fixtures use short codes and a
/// long one only to exercise layout, and neither is a decision about what a
/// code looks like.
internal struct InventoryFoundationItem: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    /// Nil for an item filed before its type exists, the path POPS-4016
    /// designs, and a state every row has to survive.
    internal let typeName: String?
    internal let code: String?
    internal let quantity: InventoryQuantity
    internal var placement: InventoryPlacement
    /// Present only on containers. Its presence is what makes one a container.
    internal var access: InventoryAccess?
    internal var lifecycle: InventoryLifecycle
    internal var sync: InventorySync

    internal init(
        id: String,
        name: String,
        typeName: String?,
        code: String? = nil,
        quantity: Int = 1,
        placement: InventoryPlacement,
        access: InventoryAccess? = nil,
        lifecycle: InventoryLifecycle = .active,
        sync: InventorySync = .synchronized
    ) {
        self.id = id
        self.name = name
        self.typeName = typeName
        self.code = code
        self.quantity = InventoryQuantity(count: quantity)
        self.placement = placement
        self.access = access
        self.lifecycle = lifecycle
        self.sync = sync
    }

    internal var isContainer: Bool { access != nil }

    internal var symbol: InventorySymbol {
        access.map(InventorySymbol.container) ?? .item
    }
}
