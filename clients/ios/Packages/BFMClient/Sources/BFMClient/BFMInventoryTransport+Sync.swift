import AppCore
import OpenAPIRuntime

extension BFMInventoryTransport {
    public func fetchSnapshot(cursor: String?, limit: Int) async throws -> InventorySnapshotPage {
        let output: Snapshot.Output
        do {
            output = try await client.generated.mobileInventory_snapshot(
                query: .init(cursor: cursor, limit: limit)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: Snapshot.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return InventorySnapshotPage(
                epoch: payload.epoch, highWaterSeq: payload.highWaterSeq,
                catalogueVersion: payload.catalogueVersion, total: payload.total,
                items: try payload.items.map { try inventoryItem(from: $0, timeZone: timeZone()) },
                locations: try payload.locations.map { try $0.inventoryLocation() },
                nextCursor: payload.nextCursor
            )
        case .conflict:
            throw InventorySyncTransportError.resyncRequired
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        default:
            throw try Self.commonFailure(output, operation: Snapshot.id)
        }
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
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
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
        let output: Changes.Output
        do {
            output = try await client.generated.mobileInventory_changes(
                query: .init(since: since, epoch: epoch, limit: limit)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: Changes.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return InventoryChangesPage(
                epoch: payload.epoch,
                items: try payload.items.map { try inventoryItem(from: $0, timeZone: timeZone()) },
                locations: try payload.locations.map { try $0.inventoryLocation() },
                events: try payload.events.map(inventoryEvent(from:)),
                nextSince: payload.nextSince, hasMore: payload.hasMore,
                catalogueVersion: payload.catalogueVersion
            )
        case .conflict:
            throw InventorySyncTransportError.resyncRequired
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        default:
            throw try Self.commonFailure(output, operation: Changes.id)
        }
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
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
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
