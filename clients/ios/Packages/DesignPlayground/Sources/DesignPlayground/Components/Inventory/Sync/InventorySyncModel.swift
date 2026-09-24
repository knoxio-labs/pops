/// Where one side of a disagreement came from.
internal enum InventorySyncSource: Equatable {
    case thisPhone
    case iPad
    case server

    internal var title: String {
        switch self {
        case .thisPhone: "This phone"
        case .iPad: "iPad"
        case .server: "Server"
        }
    }

    internal var symbol: String {
        switch self {
        case .thisPhone: "iphone"
        case .iPad: "ipad"
        case .server: "server.rack"
        }
    }
}

/// One change made on this phone that the server has not taken yet.
internal struct InventoryQueuedOperation: Identifiable, Equatable {
    internal let id: String
    /// The record the change is about, for its photo and name.
    internal let recordID: String?
    internal let symbol: InventorySymbol
    internal let title: String
    internal let detail: String
    /// Position the phone recorded it in, before dependencies reorder it.
    internal let enqueued: Int
    internal let dependsOn: String?
    /// How far through sending it is, while it is being sent.
    internal var progress: Double?
    /// Why it is waiting rather than being sent, when that is not the network.
    internal var hold: InventoryQueueHold?

    internal init(
        id: String,
        recordID: String? = nil,
        symbol: InventorySymbol,
        title: String,
        detail: String,
        enqueued: Int,
        dependsOn: String? = nil,
        progress: Double? = nil,
        hold: InventoryQueueHold? = nil
    ) {
        self.id = id
        self.recordID = recordID
        self.symbol = symbol
        self.title = title
        self.detail = detail
        self.enqueued = enqueued
        self.dependsOn = dependsOn
        self.progress = progress
        self.hold = hold
    }
}

/// The order a queue is replayed in, which is the order its rows are listed.
internal enum InventoryQueue {
    /// Enqueue order, corrected so nothing precedes what it depends on.
    ///
    /// A stable topological sort: at each step the earliest-enqueued operation
    /// whose dependency has already been emitted. Operations whose dependency
    /// is absent or circular are emitted last in enqueue order rather than
    /// dropped, because a queue that silently loses a change is the one
    /// failure sync exists to prevent.
    internal static func ordered(
        _ operations: [InventoryQueuedOperation]
    ) -> [InventoryQueuedOperation] {
        var remaining = operations.sorted { $0.enqueued < $1.enqueued }
        var emitted: Set<String> = []
        var result: [InventoryQueuedOperation] = []

        while !remaining.isEmpty {
            let index = remaining.firstIndex { operation in
                guard let dependency = operation.dependsOn else { return true }
                return emitted.contains(dependency)
                    || !remaining.contains { $0.id == dependency }
            }
            guard let index else {
                result.append(contentsOf: remaining)
                return result
            }
            let next = remaining.remove(at: index)
            emitted.insert(next.id)
            result.append(next)
        }
        return result
    }
}

/// What kind of repair a change needs, and so which two ways out it offers.
internal enum InventoryRepairKind: Equatable {
    /// The same field was changed here and elsewhere.
    case conflict
    /// The code printed here is already on another record.
    case codeCollision
    /// The record was deleted on another device.
    case deletedElsewhere
    /// A photo taken here could not be uploaded.
    case photoFailed
    /// A field or type the change used was archived or replaced since.
    case catalogueChanged

    /// The one fix a row offers inline, as an icon.
    internal var fix: (title: String, symbol: InventorySymbol) {
        switch self {
        case .conflict: ("Keep mine", InventorySymbol(system: "iphone", lucide: "Smartphone"))
        case .codeCollision: ("New code", .suggest)
        case .deletedElsewhere: ("Restore", .restore)
        case .photoFailed: ("Retry", .retry)
        case .catalogueChanged: ("Review", .edit)
        }
    }

    /// Whether the one-tap entry points (the row's icon, the item's notice)
    /// open the repair rather than committing its fix: a catalogue repair's
    /// right move depends on what is still in the way, which only the repair
    /// shows (POPS-4494, owner decision 2026-09-24).
    internal var opensRepair: Bool { self == .catalogueChanged }

    /// The repair page's two commits: the one that keeps this phone's work,
    /// and the one that lets it go.
    internal var keep: String {
        switch self {
        case .conflict: "Keep"
        case .codeCollision: "Save"
        case .deletedElsewhere: "Restore"
        case .photoFailed, .catalogueChanged: "Retry"
        }
    }

    internal var letGo: String {
        switch self {
        case .conflict, .codeCollision: "Discard mine"
        case .deletedElsewhere, .catalogueChanged: "Let go"
        case .photoFailed: "Remove"
        }
    }
}

/// One side of a conflict: the value, where it came from, and when.
internal struct InventoryRepairOption: Identifiable, Hashable {
    internal let value: String
    internal let source: InventorySyncSource
    internal let when: String

    internal var id: String { "\(source.title)-\(value)" }
}

/// One change the server would not take as it was, and what it needs.
internal struct InventoryRepair: Identifiable, Hashable {
    internal let id: String
    internal let recordID: String
    internal let kind: InventoryRepairKind
    /// What happened, in one line.
    internal let problem: String
    /// The field a conflict is about.
    internal var field: String?
    /// A conflict's two sides, this phone's first.
    internal var options: [InventoryRepairOption] = []
    /// The code a collision proposes instead.
    internal var suggestedCode: String?
    /// What a `catalogueChanged` repair's change carried.
    internal var catalogue: InventoryCatalogueChange?

    /// What resolving it says, in the Resolved row and the undo capsule.
    internal func outcome(keepingMine: Bool, code: String? = nil) -> String {
        switch kind {
        case .conflict:
            let kept = keepingMine ? options.first : options.last
            return "Kept \(kept?.value ?? "")"
        case .codeCollision:
            return keepingMine ? "Relabelled \(code ?? suggestedCode ?? "")" : "Code discarded"
        case .deletedElsewhere:
            return keepingMine ? "Restored" : "Let go"
        case .photoFailed:
            return keepingMine ? "Photo sent" : "Photo removed"
        case .catalogueChanged:
            return keepingMine ? "Sent with current fields" : "Let go"
        }
    }
}

/// A repair settled, by a person or on its own.
internal struct InventoryResolvedEntry: Identifiable, Equatable {
    internal let id: String
    internal let recordID: String
    internal let outcome: String
    internal let when: String
    internal var isToday = true
}

/// Everything the Sync page lists: what is waiting, what needs attention, and
/// what was resolved, with the undo a resolution leaves behind.
internal struct InventorySyncLedger: Equatable {
    internal private(set) var waiting: [InventoryQueuedOperation]
    internal private(set) var repairs: [InventoryRepair]
    internal private(set) var resolved: [InventoryResolvedEntry]
    private var undone: [String: Removed] = [:]

    /// A resolved repair and where it stood, so Undo puts it back in place.
    private struct Removed: Equatable {
        let repair: InventoryRepair
        let index: Int
    }

    internal init(
        waiting: [InventoryQueuedOperation] = [],
        repairs: [InventoryRepair] = [],
        resolved: [InventoryResolvedEntry] = []
    ) {
        self.waiting = InventoryQueue.ordered(waiting)
        self.repairs = repairs
        self.resolved = resolved
    }

    internal var resolvedToday: Int { resolved.filter(\.isToday).count }

    internal var sending: [InventoryQueuedOperation] {
        waiting.filter { $0.progress != nil }
    }

    /// Resolves `id` with its inline fix, or with the other side when
    /// `keepingMine` is false, and returns the capsule that can undo it.
    @discardableResult
    internal mutating func resolve(
        _ id: String, keepingMine: Bool = true
    ) -> InventoryUndoOffer? {
        guard let index = repairs.firstIndex(where: { $0.id == id }) else { return nil }
        let repair = repairs.remove(at: index)
        let outcome = repair.outcome(keepingMine: keepingMine)
        resolved.insert(
            InventoryResolvedEntry(
                id: repair.id, recordID: repair.recordID, outcome: outcome, when: "Just now"),
            at: 0)
        undone[repair.id] = Removed(repair: repair, index: index)
        return InventoryUndoOffer(message: outcome, symbol: .resolved, id: repair.id)
    }

    /// Puts a resolved repair back where it was.
    internal mutating func undo(_ offer: InventoryUndoOffer) {
        guard let removed = undone.removeValue(forKey: offer.id) else { return }
        resolved.removeAll { $0.id == offer.id }
        repairs.insert(removed.repair, at: min(removed.index, repairs.count))
    }
}
