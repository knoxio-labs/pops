import Foundation

/// One command, addressed for the wire: the idempotency key, what it depends
/// on, and the revision it was based on (ADR-002 D8, D9). `InventoryCommand`
/// itself carries none of this, because a view deciding what changed has no
/// business minting an idempotency key or reading the replica's current
/// revision — that is `InventoryReplica`'s job when it drains its log.
public struct InventoryOutboundMutation: Hashable, Sendable {
    public let mutationId: String
    public let command: InventoryCommand
    /// Nil for a create, per D8.
    public let baseRevision: Int?
    public let dependsOn: [String]
    public let clientTime: Date
    /// Catalogue revision against which the command's values were authored,
    /// or nil when the sender holds none. Never defaulted to a revision the
    /// sender did not see: nil goes on the wire as absent, which the server
    /// reads as the legacy (protocol-1) path.
    public let catalogueRevision: Int?

    public init(
        mutationId: String, command: InventoryCommand, baseRevision: Int?, dependsOn: [String],
        clientTime: Date, catalogueRevision: Int? = nil
    ) {
        self.mutationId = mutationId
        self.command = command
        self.baseRevision = baseRevision
        self.dependsOn = dependsOn
        self.clientTime = clientTime
        self.catalogueRevision = catalogueRevision
    }
}

/// Why the server would not apply a mutation. Closed server-side, open on the
/// wire (ADR-002's wire contract), so this keeps `InventoryLifecycle`'s
/// pattern of an `unrecognised` case rather than refusing to show the row.
public enum InventoryRejectedReason: Hashable, Sendable {
    case invalid
    case typeUnknown
    case cycle
    case targetMissing
    case notContainer
    case hasContents
    case illegalTransition
    case mediaMissing
    /// The catalogue revision the change was authored against is not one
    /// the server can judge it by, or cannot be rebased onto its active one:
    /// refresh the definitions and send it again against the newer revision.
    case catalogueUpdateRequired
    /// The change was rebased onto the active catalogue and no longer fits
    /// it (a field or type it used was archived or replaced): it needs a
    /// person to decide, not a retry.
    case catalogueRepairRequired
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "invalid": self = .invalid
        case "type_unknown": self = .typeUnknown
        case "cycle": self = .cycle
        case "target_missing": self = .targetMissing
        case "not_container": self = .notContainer
        case "has_contents": self = .hasContents
        case "illegal_transition": self = .illegalTransition
        case "media_missing": self = .mediaMissing
        case "catalogue_update_required": self = .catalogueUpdateRequired
        case "catalogue_repair_required": self = .catalogueRepairRequired
        default: self = .unrecognised(wire)
        }
    }
}

/// One mutation's result, the shape ADR-002's wire contract declares for
/// `Outcome`.
public enum InventoryMutationOutcome: Hashable, Sendable {
    case applied(revision: Int, seq: Int, converged: Bool)
    case conflictField(
        field: String, mine: String, theirs: String, source: InventorySyncSource, at: Date,
        currentRevision: Int)
    case conflictCodeCollision(heldById: String, heldByName: String, suggestedCode: String)
    case conflictDeleted(source: InventorySyncSource, at: Date)
    /// `catalogueChanges` names what stands in the way of a
    /// `catalogueUpdateRequired` or `catalogueRepairRequired` refusal; empty
    /// for every other reason, and from a server that predates them.
    case rejected(
        reason: InventoryRejectedReason, message: String,
        catalogueChanges: [InventoryCatalogueChange] = [])
    case deferred(waitingOn: String)
}

/// One page of the initial download: items, locations and photo references
/// as of the high-water `seq` the first page fixed.
public struct InventorySnapshotPage: Hashable, Sendable {
    public let epoch: String
    public let highWaterSeq: Int
    public let minimumProtocol: Int
    public let catalogueVersion: String
    public let catalogueRevision: Int?
    public let total: Int
    public let items: [InventoryItem]
    public let locations: [InventoryLocation]
    public let nextCursor: String?

    public init(
        epoch: String, highWaterSeq: Int, minimumProtocol: Int = 1, catalogueVersion: String,
        total: Int,
        items: [InventoryItem], locations: [InventoryLocation], nextCursor: String?,
        catalogueRevision: Int? = nil
    ) {
        self.epoch = epoch
        self.highWaterSeq = highWaterSeq
        self.minimumProtocol = minimumProtocol
        self.catalogueVersion = catalogueVersion
        self.total = total
        self.items = items
        self.locations = locations
        self.nextCursor = nextCursor
        self.catalogueRevision = catalogueRevision
    }
}

/// One page of the change feed: every row and event with `seq > since`,
/// tombstones included.
public struct InventoryChangesPage: Hashable, Sendable {
    public let epoch: String
    public let minimumProtocol: Int
    public let items: [InventoryItem]
    public let locations: [InventoryLocation]
    public let events: [InventoryEvent]
    public let nextSince: Int
    public let hasMore: Bool
    public let catalogueVersion: String
    public let catalogueRevision: Int?

    public init(
        epoch: String, minimumProtocol: Int = 1, items: [InventoryItem],
        locations: [InventoryLocation],
        events: [InventoryEvent], nextSince: Int, hasMore: Bool, catalogueVersion: String,
        catalogueRevision: Int? = nil
    ) {
        self.epoch = epoch
        self.minimumProtocol = minimumProtocol
        self.items = items
        self.locations = locations
        self.events = events
        self.nextSince = nextSince
        self.hasMore = hasMore
        self.catalogueVersion = catalogueVersion
        self.catalogueRevision = catalogueRevision
    }
}

/// One page of one entity's history.
public struct InventoryEventPage: Hashable, Sendable {
    public let events: [InventoryEvent]
    public let nextCursor: String?

    public init(events: [InventoryEvent], nextCursor: String?) {
        self.events = events
        self.nextCursor = nextCursor
    }
}

/// A batch's worth of outcomes plus the server's high-water `seq` afterwards.
public struct InventoryMutationBatchResult: Hashable, Sendable {
    public let outcomes: [String: InventoryMutationOutcome]
    public let highWaterSeq: Int

    public init(outcomes: [String: InventoryMutationOutcome], highWaterSeq: Int) {
        self.outcomes = outcomes
        self.highWaterSeq = highWaterSeq
    }
}

/// The image formats the media route accepts.
public enum InventoryMediaContentType: Hashable, Sendable {
    case jpeg
    case heic
}

/// What `PUT /media/:sha256` answers.
public struct InventoryMediaUploadResult: Hashable, Sendable {
    public let sha256: String
    public let alreadyStored: Bool

    public init(sha256: String, alreadyStored: Bool) {
        self.sha256 = sha256
        self.alreadyStored = alreadyStored
    }
}

/// Every call `InventoryReplica` makes over the network, in domain terms
/// rather than wire JSON: the mapping from bfm's `/mobile/inventory/*` shapes
/// (ADR-002's wire contract) into these types is the implementing package's
/// job, the same way `TransactionsRepository` never sees a wire payload
/// either. `BFMClient` implements this against the generated client; nothing
/// else in the app performs HTTP (`ModuleBoundaryTests`).
///
/// `resyncRequired` and `clientTooOld` are thrown rather than folded into a
/// return value because every call can hit them (D10), and a caller that
/// forgot to check a return case would otherwise treat a stale replica as an
/// empty one.
public protocol InventorySyncTransport: Sendable {
    /// - Returns: `nil` when the server answered `304` against
    ///   `knownVersion`.
    func fetchCatalogue(knownVersion: String?) async throws -> InventoryCatalogue?

    /// Reads the immutable protocol-2 catalogue revision an item page names.
    /// Callers must obtain this before exposing or storing rows that reference
    /// it, so an offline replica never presents values against another schema.
    func fetchCatalogue(revision: Int) async throws -> InventoryCatalogueSnapshot

    func fetchSnapshot(cursor: String?, limit: Int) async throws -> InventorySnapshotPage

    /// - Throws: ``InventorySyncTransportError/resyncRequired`` when `since`
    ///   is beyond the server's high-water mark or `epoch` is one it does not
    ///   recognise.
    func fetchChanges(since: Int, epoch: String, limit: Int) async throws -> InventoryChangesPage

    func fetchItemEvents(itemId: String, cursor: String?, limit: Int) async throws
        -> InventoryEventPage

    /// Submits up to 50 mutations. A retried batch is safe to resend: the
    /// server replays stored outcomes for any `mutationId` it has already
    /// seen rather than reapplying it (D9).
    func submit(_ mutations: [InventoryOutboundMutation]) async throws
        -> InventoryMutationBatchResult

    func uploadMedia(sha256: String, data: Data, contentType: InventoryMediaContentType)
        async throws -> InventoryMediaUploadResult

    func fetchMedia(sha256: String, variant: InventoryPhotoVariant) async throws -> Data

    /// - Throws: ``InventorySyncTransportError/suggestionsUnavailable`` on a
    ///   `503`, which the phone shows as the approved `.offline` assist
    ///   state.
    func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String]
}

/// Failures specific to the sync protocol, distinct from `RepositoryError`
/// because a caller needs to react to these differently: a resync means
/// re-snapshotting while keeping the mutation log, not showing an error.
public enum InventorySyncTransportError: Error, Hashable, Sendable {
    case resyncRequired
    case clientTooOld
    case suggestionsUnavailable
    /// `413` on the media route: the bytes are over its cap. Sending them
    /// again changes nothing, so a phone that staged them opens the failed
    /// photo repair instead of retrying.
    case mediaTooLarge
    /// `415` on the media route: neither JPEG nor HEIC. As final as
    /// ``mediaTooLarge``.
    case mediaUnsupported
}
