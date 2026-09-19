import AppCore
import OpenAPIRuntime

extension BFMInventoryTransport {
    public func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String]
    {
        let output: SuggestCodes.Output
        do {
            output = try await client.generated.mobileInventory_suggestCodes(
                body: .json(.init(name: name, stem: stem, typeKey: typeKey))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: SuggestCodes.id)
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.suggestions
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        case .serviceUnavailable:
            throw InventorySyncTransportError.suggestionsUnavailable
        case .badRequest:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: SuggestCodes.id)
        case .unauthorized:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: SuggestCodes.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: SuggestCodes.id)
        case .tooManyRequests:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: SuggestCodes.id)
        case .badGateway(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue),
                operation: SuggestCodes.id)
        case .undocumented(let status, _):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: SuggestCodes.id)
        }
    }
}

private typealias SuggestCodes = Operations.MobileInventory_suggestCodes
