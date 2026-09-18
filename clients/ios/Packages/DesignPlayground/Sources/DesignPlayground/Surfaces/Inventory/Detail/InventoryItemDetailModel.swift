import Foundation

/// What the item detail page knows beyond the row (POPS-3980).
///
/// Built on ``InventoryFoundationItem`` rather than instead of it: the row,
/// the action sheet and this page all describe one item, in ADR-001's words,
/// and only what this page adds beyond the row lives here.

/// One identifier someone else assigned. ADR-001: not "code" unqualified,
/// which is POPS's own inventory code and lives on the item itself.
internal struct InventoryDetailExternalIdentifier: Identifiable, Equatable {
    internal let kind: String
    internal let value: String

    internal var id: String { "\(kind)-\(value)" }
}

/// A field the item's type declares, and what this item recorded for it. Not
/// set is a value, not an absence, the presentation ADR-001 and the templates
/// decision settled on.
internal struct InventoryDetailField: Identifiable, Equatable {
    internal let key: String
    internal let value: String

    internal var id: String { key }
}

/// A photograph as the gallery holds it, or the reason it cannot show one.
///
/// `imageData` is a bundled sample JPEG (``SamplePhoto``), not a fetch: the
/// playground never reaches the network (see ``Catalog``), and reading a
/// resource out of `Bundle.module` is local, the same way a shipped item's
/// photo would already be on disk by the time this page draws it.
internal struct InventoryPhoto: Identifiable, Equatable {
    internal let caption: String
    internal let isBroken: Bool
    internal let imageData: Data?

    internal init(caption: String, isBroken: Bool, imageData: Data? = nil) {
        self.caption = caption
        self.isBroken = isBroken
        self.imageData = imageData
    }

    internal var id: String { caption }
}

/// One end of a cable, and whether it is plugged into anything.
///
/// A capability rather than a field: its presence is what puts Connect or
/// Disconnect in the action row and a Connections section on the page, the
/// same way containment puts Open and Close there.
internal struct InventoryConnection: Identifiable, Equatable {
    internal let port: String
    internal let attachedTo: String?

    internal var id: String { port }
    internal var isConnected: Bool { attachedTo != nil }
}

/// Where an item was bought, what it cost, and what proves it.
internal struct InventoryProvenance: Equatable {
    internal let merchant: String
    internal let price: String
    internal let purchasedOn: String
    internal let hasReceipt: Bool
    internal let warranty: String?
}

/// Whether the pillar's document store answered, and what it holds for this
/// item if it did. Missing Paperless is a state of the store, not of the
/// item, which is why an item can have documents and still show this as
/// unavailable, POPS knows they exist and cannot fetch them right now.
internal enum InventoryDocuments: Equatable {
    case linked([String])
    case none
    case paperlessUnavailable
}

/// What a container-capable item's contents look like from its own page.
/// Its own contents are a list on the container's own screen; this is only
/// the summary ADR-001's "container capability summary" asks for, and the
/// hook the container's own page grows from.
internal struct InventoryContainerSummary: Equatable {
    internal let itemCount: Int
    internal let containerCount: Int
}

/// A change the server disagreed with: what it did, in one line, and the one
/// choice that undoes it.
internal struct InventoryDetailConflict: Equatable {
    internal let problem: String
    internal let resolution: String
}

/// Everything the item detail page can show about one item.
///
/// Everything past the item itself has a default, because sections appear as
/// they are needed: a fixture that says nothing about provenance is an item
/// with no provenance, and spelling out eleven absences per fixture made the
/// sparse cases the longest ones to read.
internal struct InventoryItemDetail: Identifiable {
    internal var item: InventoryFoundationItem
    internal let photos: [InventoryPhoto]
    internal let externalIdentifiers: [InventoryDetailExternalIdentifier]
    internal let description: String?
    internal let fields: [InventoryDetailField]
    internal let connections: [InventoryConnection]
    internal let containerSummary: InventoryContainerSummary?
    internal let provenance: InventoryProvenance?
    internal let documents: InventoryDocuments
    internal let activity: [InventoryActivityEntry]
    internal let conflict: InventoryDetailConflict?
    internal let lastSynced: String?
    /// When and why an inactive item stopped counting.
    internal var lifecycleChange: InventoryLifecycleChange?

    internal init(
        item: InventoryFoundationItem,
        photos: [InventoryPhoto] = [],
        externalIdentifiers: [InventoryDetailExternalIdentifier] = [],
        description: String? = nil,
        fields: [InventoryDetailField] = [],
        connections: [InventoryConnection] = [],
        containerSummary: InventoryContainerSummary? = nil,
        provenance: InventoryProvenance? = nil,
        documents: InventoryDocuments = .none,
        activity: [InventoryActivityEntry] = [],
        conflict: InventoryDetailConflict? = nil,
        lastSynced: String? = nil,
        lifecycleChange: InventoryLifecycleChange? = nil
    ) {
        self.item = item
        self.photos = photos
        self.externalIdentifiers = externalIdentifiers
        self.description = description
        self.fields = fields
        self.connections = connections
        self.containerSummary = containerSummary
        self.provenance = provenance
        self.documents = documents
        self.activity = activity
        self.conflict = conflict
        self.lastSynced = lastSynced
        self.lifecycleChange = lifecycleChange
    }

    internal var id: String { item.id }

    /// The line under the name: what kind of thing it is, and how many the
    /// record stands for when that is not one.
    internal var subtitle: String {
        var parts = [item.typeName ?? "No type yet"]
        if item.quantity.count != 1 { parts.append("\(item.quantity.count) in this group") }
        return parts.joined(separator: " · ")
    }

    /// The fields the item's type marks as highlighted, which sit beside the
    /// placement. An item whose type has no shipped template highlights none.
    internal var highlightedFields: [InventoryDetailField] {
        fields.filter { isHighlighted($0) }
    }

    /// Every other recorded field, shown under the actions as Details.
    internal var otherFields: [InventoryDetailField] {
        fields.filter { !isHighlighted($0) }
    }

    private var template: InventoryTemplate? {
        InventoryPropertyTemplates.all.first { $0.name == item.typeName }
    }

    private func isHighlighted(_ field: InventoryDetailField) -> Bool {
        let key = InventoryPropertySchema.normalized(field.key)
        return template?.fields.contains { $0.highlighted && $0.id == key } ?? false
    }
}

/// Something that happened to this item, in the ADR's verbs: one line in the
/// History section and page, and the full account its sheet opens into.
internal struct InventoryActivityEntry: Identifiable, Hashable {
    internal let id: String
    internal let verb: String
    internal let subject: String
    internal let detail: String
    internal let when: String
    internal let kind: InventoryHistoryKind
    internal let symbol: InventorySymbol
    /// The month heading the History page files the line under.
    internal let month: String
    internal let from: String?
    internal let to: String?
    internal let reason: InventoryDiscardReason?
    internal let device: String?
    /// Recent enough that its account still offers Undo.
    internal let isUndoable: Bool

    internal init(
        id: String,
        verb: String,
        subject: String,
        detail: String,
        when: String,
        kind: InventoryHistoryKind = .edit,
        symbol: InventorySymbol? = nil,
        month: String = "",
        from: String? = nil,
        to: String? = nil,
        reason: InventoryDiscardReason? = nil,
        device: String? = nil,
        isUndoable: Bool = false
    ) {
        self.id = id
        self.verb = verb
        self.subject = subject
        self.detail = detail
        self.when = when
        self.kind = kind
        self.symbol = symbol ?? kind.symbol
        self.month = month
        self.from = from
        self.to = to
        self.reason = reason
        self.device = device
        self.isUndoable = isUndoable
    }

    /// What happened, as the one line says it.
    internal var title: String {
        let head = subject.isEmpty ? verb : "\(verb) \(subject)"
        return reason.map { "\(head) · \($0.label)" } ?? head
    }
}
