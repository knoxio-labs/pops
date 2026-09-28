import AppCore

extension BFMInventoryTransport {
    public func fetchSnapshot(cursor: String?, limit: Int) async throws -> InventorySnapshotPage {
        try await observedSyncRead(
            operation: Snapshot.id,
            mapClientError: { Self.syncReadFailure($0, operation: Snapshot.id) },
            read: {
                let output = try await client.generated.mobileInventory_snapshot(
                    query: .init(cursor: cursor, limit: limit)
                )
                switch output {
                case .ok(let ok):
                    let payload = try ok.body.json
                    return InventorySnapshotPage(
                        epoch: payload.epoch, highWaterSeq: payload.highWaterSeq,
                        minimumProtocol: payload.minimumProtocol,
                        catalogueVersion: payload.catalogueVersion, total: payload.total,
                        items: try payload.items.map {
                            try inventoryItem(from: $0, timeZone: timeZone())
                        },
                        locations: try payload.locations.map { try $0.inventoryLocation() },
                        nextCursor: payload.nextCursor, catalogueRevision: payload.catalogueRevision,
                        issues: (payload.issues ?? []).map(inventorySyncIssue(from:))
                    )
                case .conflict:
                    throw InventorySyncTransportError.resyncRequired
                case .upgradeRequired:
                    throw InventorySyncTransportError.clientTooOld
                default:
                    throw try Self.commonFailure(output, operation: Snapshot.id)
                }
            })
    }

    fileprivate static func commonFailure(_ output: Snapshot.Output, operation: String) throws
        -> RepositoryError
    {
        switch output {
        case .badRequest:
            return BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: operation)
        case .unauthorized:
            return BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: operation)
        case .forbidden(let forbidden):
            return Self.forbiddenFailure(try forbidden.body.json, operation: operation)
        case .tooManyRequests:
            return BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: operation)
        case .badGateway(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .undocumented(let status, _):
            return BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: operation)
        case .ok, .conflict, .upgradeRequired:
            preconditionFailure("handled by the caller's own switch")
        }
    }
}

extension BFMInventoryTransport {
    public func fetchChanges(since: Int, epoch: String, limit: Int) async throws
        -> InventoryChangesPage
    {
        try await observedSyncRead(
            operation: Changes.id,
            mapClientError: { Self.syncReadFailure($0, operation: Changes.id) },
            read: {
                let output = try await client.generated.mobileInventory_changes(
                    query: .init(since: since, epoch: epoch, limit: limit)
                )
                switch output {
                case .ok(let ok):
                    let payload = try ok.body.json
                    return InventoryChangesPage(
                        epoch: payload.epoch,
                        minimumProtocol: payload.minimumProtocol,
                        items: try payload.items.map {
                            try inventoryItem(from: $0, timeZone: timeZone())
                        },
                        locations: try payload.locations.map { try $0.inventoryLocation() },
                        events: try payload.events.map(inventoryEvent(from:)),
                        nextSince: payload.nextSince, hasMore: payload.hasMore,
                        catalogueVersion: payload.catalogueVersion,
                        catalogueRevision: payload.catalogueRevision,
                        issues: (payload.issues ?? []).map(inventorySyncIssue(from:))
                    )
                case .conflict:
                    throw InventorySyncTransportError.resyncRequired
                case .upgradeRequired:
                    throw InventorySyncTransportError.clientTooOld
                default:
                    throw try Self.commonFailure(output, operation: Changes.id)
                }
            })
    }

    fileprivate static func commonFailure(_ output: Changes.Output, operation: String) throws
        -> RepositoryError
    {
        switch output {
        case .badRequest:
            return BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: operation)
        case .unauthorized:
            return BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: operation)
        case .forbidden(let forbidden):
            return Self.forbiddenFailure(try forbidden.body.json, operation: operation)
        case .tooManyRequests:
            return BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: operation)
        case .badGateway(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .undocumented(let status, _):
            return BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: operation)
        case .ok, .conflict, .upgradeRequired:
            preconditionFailure("handled by the caller's own switch")
        }
    }
}

private typealias Snapshot = Operations.MobileInventory_snapshot
private typealias Changes = Operations.MobileInventory_changes
private typealias Item = Operations.MobileInventory_item

extension BFMInventoryTransport {
    public func fetchItem(itemId: String) async throws -> InventorySyncItemResult {
        try await observedSyncRead(
            operation: Item.id,
            mapClientError: { Self.syncReadFailure($0, operation: Item.id) },
            read: {
                let output = try await client.generated.mobileInventory_item(
                    .init(path: .init(id: itemId)))
                switch output {
                case .ok(let ok):
                    let payload = try ok.body.json
                    return InventorySyncItemResult(
                        item: try payload.item.map {
                            try inventoryItem(from: $0, timeZone: timeZone())
                        },
                        issues: (payload.issues ?? []).map(inventorySyncIssue(from:)),
                        catalogueVersion: payload.catalogueVersion,
                        catalogueRevision: payload.catalogueRevision)
                case .upgradeRequired:
                    throw InventorySyncTransportError.clientTooOld
                case .notFound:
                    throw BFMInventoryFailureMapping.syncServerError(
                        for: "upstream_not_found", operation: Item.id)
                default:
                    throw try Self.commonFailure(output, operation: Item.id)
                }
            })
    }

    fileprivate static func commonFailure(_ output: Item.Output, operation: String) throws
        -> RepositoryError
    {
        switch output {
        case .badRequest:
            return BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: operation)
        case .unauthorized:
            return BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: operation)
        case .forbidden(let forbidden):
            return Self.forbiddenFailure(try forbidden.body.json, operation: operation)
        case .tooManyRequests:
            return BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: operation)
        case .notFound:
            return BFMInventoryFailureMapping.syncServerError(
                for: "upstream_not_found", operation: operation)
        case .badGateway(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.syncServerError(
                for: try upstream.body.json.code, operation: operation)
        case .undocumented(let status, _):
            return BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: operation)
        case .ok, .upgradeRequired:
            preconditionFailure("handled by the caller's own switch")
        }
    }
}
