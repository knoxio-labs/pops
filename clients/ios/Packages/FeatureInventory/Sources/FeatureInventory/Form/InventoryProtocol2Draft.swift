import AppCore

/// The stable-ID portion of an item form. It is deliberately separate from
/// the protocol-1 keyed draft so a cached catalogue revision can never be
/// mixed with legacy keys in one mutation.
internal struct InventoryProtocol2Draft: Hashable, Sendable {
    internal var typeId: String
    internal let catalogueRevision: Int
    internal var entries: [String: [InventoryProtocol2DraftEntry]]
    internal var touched: Set<String>
    internal var typeSelectionChanged = false

    internal init(
        type: InventoryCatalogueType, catalogueRevision: Int, item: InventoryItem? = nil
    ) {
        typeId = type.id
        self.catalogueRevision = catalogueRevision
        let itemEntries = Dictionary(
            uniqueKeysWithValues: (item?.fieldValues ?? []).map { ($0.fieldId, $0) })
        entries = Dictionary(
            uniqueKeysWithValues: type.fields.compactMap { field in
                guard field.storage == .stored else { return nil }
                let stored: [InventoryPrimitiveValue]
                if case .value(let values)? = itemEntries[field.id]?.state,
                    itemEntries[field.id]?.source == .stored
                {
                    stored = values
                } else {
                    stored = []
                }
                let values = stored.enumerated().map { index, value in
                    InventoryProtocol2DraftEntry(id: "\(field.id):\(index)", value: value)
                }
                if values.isEmpty, field.cardinality == .one, field.archivedAt == nil {
                    return (field.id, [InventoryProtocol2DraftEntry(id: "\(field.id):empty")])
                }
                return values.isEmpty ? nil : (field.id, values)
            })
        touched = []
    }

    internal var hasStagedWork: Bool {
        typeSelectionChanged || !touched.isEmpty
    }

    internal func values(for field: InventoryCatalogueField) -> [InventoryPrimitiveValue] {
        entries[field.id, default: []].compactMap(\.value)
    }

    internal func draftEntries(
        for field: InventoryCatalogueField
    ) -> [InventoryProtocol2DraftEntry] {
        entries[field.id] ?? []
    }

    internal mutating func addEntry(id: String, for field: InventoryCatalogueField) {
        guard field.storage == .stored, field.cardinality == .many else { return }
        entries[field.id, default: []].append(InventoryProtocol2DraftEntry(id: id))
        touched.insert(field.id)
    }

    internal mutating func removeEntry(id: String, for field: InventoryCatalogueField) {
        entries[field.id]?.removeAll { $0.id == id }
        touched.insert(field.id)
    }

    internal mutating func moveEntry(
        id: String, by offset: Int, for field: InventoryCatalogueField
    ) {
        guard let index = entries[field.id]?.firstIndex(where: { $0.id == id }) else { return }
        let destination = index + offset
        guard entries[field.id]?.indices.contains(destination) == true else { return }
        entries[field.id]?.swapAt(index, destination)
        touched.insert(field.id)
    }

    internal mutating func setText(
        _ input: String, entryId: String, for field: InventoryCatalogueField
    ) {
        update(entryId, for: field) { entry in entry.setText(input, for: field) }
    }

    internal mutating func setValue(
        _ value: InventoryPrimitiveValue?, entryId: String, for field: InventoryCatalogueField
    ) {
        update(entryId, for: field) { entry in entry.setValue(value) }
    }

    internal mutating func setReferenceKind(
        _ kind: InventoryReferenceTargetKind, entryId: String,
        for field: InventoryCatalogueField
    ) {
        update(entryId, for: field) { entry in entry.setReferenceKind(kind) }
    }

    internal func issues(for type: InventoryCatalogueType) -> [InventoryProtocol2DraftIssue] {
        type.fields.flatMap { field -> [InventoryProtocol2DraftIssue] in
            guard field.storage == .stored, field.archivedAt == nil else { return [] }
            let entries = entries[field.id, default: []]
            let malformed = entries.compactMap(\.issue).map {
                InventoryProtocol2DraftIssue(fieldId: field.id, message: "\(field.label): \($0)")
            }
            if field.required, entries.compactMap(\.value).isEmpty {
                return malformed + [
                    InventoryProtocol2DraftIssue(
                        fieldId: field.id, message: "\(field.label) is required.")
                ]
            }
            return malformed
        }
    }

    private mutating func update(
        _ entryId: String, for field: InventoryCatalogueField,
        change: (inout InventoryProtocol2DraftEntry) -> Void
    ) {
        guard let index = entries[field.id]?.firstIndex(where: { $0.id == entryId }) else { return }
        change(&entries[field.id, default: []][index])
        touched.insert(field.id)
    }

    internal func completeValues(
        for type: InventoryCatalogueType
    ) -> [InventoryProtocol2FieldValue] {
        type.fields.compactMap { field in
            let values = entries[field.id, default: []].compactMap(\.value)
            guard field.storage == .stored, !values.isEmpty else {
                return nil
            }
            return .init(fieldId: field.id, values: values)
        }
    }

    internal func patches(for type: InventoryCatalogueType) -> [InventoryProtocol2FieldPatch] {
        type.fields.compactMap { field in
            guard field.storage == .stored, touched.contains(field.id) else { return nil }
            let values = entries[field.id, default: []].compactMap(\.value)
            return .init(fieldId: field.id, values: values.isEmpty ? nil : values)
        }
    }
}
