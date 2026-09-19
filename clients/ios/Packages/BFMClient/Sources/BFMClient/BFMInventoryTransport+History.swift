import AppCore
import OpenAPIRuntime

extension BFMInventoryTransport {
    public func fetchItemEvents(itemId: String, cursor: String?, limit: Int) async throws
        -> InventoryEventPage
    {
        let output: ItemHistory.Output
        do {
            output = try await client.generated.mobileInventory_itemHistory(
                path: .init(id: itemId), query: .init(cursor: cursor, limit: limit)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: ItemHistory.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return InventoryEventPage(
                events: try payload.events.map(inventoryEvent(from:)),
                nextCursor: payload.nextCursor
            )
        case .notFound:
            // `fetchItemEvents` has no optional return the way
            // `BFMTransactionsRepository.transactionDetail` does, so a
            // deleted item's history has nowhere to answer "nothing here"
            // except a thrown error. It is a fact about the id, not this
            // build, so `.transport` rather than `.contractMismatch`.
            throw RepositoryError.transport("\(ItemHistory.id): item not found")
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        default:
            throw try Self.commonFailure(output, operation: ItemHistory.id)
        }
    }

    fileprivate static func commonFailure(_ output: ItemHistory.Output, operation: String) throws
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
        case .ok, .notFound, .upgradeRequired:
            preconditionFailure("handled by the caller's own switch")
        }
    }
}

private typealias ItemHistory = Operations.MobileInventory_itemHistory
