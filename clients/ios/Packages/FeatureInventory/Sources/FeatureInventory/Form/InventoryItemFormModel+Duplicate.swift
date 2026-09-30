import AppCore

/// Seeds a `.duplicate` request: New item, filled in as a copy of another.
///
/// The copy is an ordinary create. Its overrides travel inside the create
/// and its photos follow it as `item.attachPhoto`, by hash, since the server
/// already holds the bytes. A photo that fails to attach after the create
/// landed leaves `created` set, so pressing Create again sends only what is
/// left rather than a second item.
extension InventoryItemFormModel {
    internal func seedDuplicate(_ context: InventoryItemFormContext) -> Phase {
        guard let source = context.duplicating else { return .unavailable }
        draft = InventoryItemDraft(
            duplicating: source, id: draft.id, placementName: context.placementName)
        if let catalogue = context.protocol2Catalogue, let typeId = source.typeId {
            guard let type = catalogue.effectiveType(id: typeId) else { return .unavailable }
            protocol2Draft = InventoryProtocol2Draft(
                duplicating: source, type: type, catalogueRevision: catalogue.revision.revision)
        }
        clampContainerQuantity()
        return .ready
    }
}

extension InventoryItemDraft {
    /// A new item with `source`'s name, type, fields, note, quantity,
    /// placement and photos, under its own `id`. The code is bumped
    /// (``InventoryCodeSequence/bumped(_:)``) because codes are unique;
    /// identifiers are not carried, since a serial belongs to one unit.
    /// Each photo is ready to attach, not attached: it is on `source`, not on
    /// the new item.
    internal init(
        duplicating source: InventoryItem, id: InventoryItem.ID, placementName: String?
    ) {
        self.init(id: id, placement: source.placement, placementName: placementName)
        name = source.name
        typeKey = source.typeKey
        fields = source.fields.compactMapValues(InventoryFieldEntry.init)
        note = source.note ?? ""
        code = InventoryCodeEntry(value: InventoryCodeSequence.bumped(source.code))
        quantity = source.quantity.count
        photos = source.photos.map {
            InventoryFormPhoto(
                sha256: $0.sha256, caption: $0.caption, upload: .uploaded, handedOver: true)
        }
    }
}

extension InventoryProtocol2Draft {
    /// `source`'s stored values under `type`, with each computed-field
    /// override it holds staged to travel inside the create.
    internal init(
        duplicating source: InventoryItem, type: InventoryCatalogueType, catalogueRevision: Int
    ) {
        self.init(type: type, catalogueRevision: catalogueRevision, item: source)
        overrides = Dictionary(
            source.fieldValues.compactMap { entry -> (String, InventoryPrimitiveValue)? in
                guard entry.source == .override, case .value(let values) = entry.state,
                    let value = values.first
                else { return nil }
                return (entry.fieldId, value)
            },
            uniquingKeysWith: { first, _ in first })
    }
}
