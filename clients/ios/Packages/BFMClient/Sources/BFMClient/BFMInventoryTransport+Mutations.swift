import AppCore
import OpenAPIRuntime

extension BFMInventoryTransport {
    /// - Throws: ``RepositoryError/contractMismatch`` if any mutation in the
    ///   batch cannot be encoded (`BFMInventoryCommandEncoding`) — the whole
    ///   batch fails together, since submitting the rest without it would
    ///   silently drop a change the caller believes it made.
    public func submit(_ mutations: [InventoryOutboundMutation]) async throws
        -> InventoryMutationBatchResult
    {
        let wire = try mutations.map(Self.wireMutation(from:))
        let output: Mutations.Output
        do {
            output = try await client.generated.mobileInventory_mutations(
                body: .json(.init(mutations: wire))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: Mutations.id)
        }

        switch output {
        case .ok(let ok):
            return BFMInventoryMutationsWire.result(from: try ok.body.json)
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        case .contentTooLarge:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .payloadTooLarge, operation: Mutations.id)
        case .badRequest:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: Mutations.id)
        case .unauthorized:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: Mutations.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: Mutations.id)
        case .tooManyRequests:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: Mutations.id)
        case .badGateway(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: Mutations.id)
        case .serviceUnavailable(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: Mutations.id)
        case .undocumented(let status, _):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: Mutations.id)
        }
    }

    private static func wireMutation(
        from outbound: InventoryOutboundMutation
    ) throws -> Mutations.Input.Body.JsonPayload.MutationsPayloadPayload {
        let envelope = try BFMInventoryCommandEncoding.envelope(for: outbound.command)
        return Mutations.Input.Body.JsonPayload.MutationsPayloadPayload(
            args: try OpenAPIValueContainer(unvalidatedValue: envelope.args),
            baseRevision: outbound.baseRevision,
            catalogueRevision: outbound.catalogueRevision,
            clientTime: outbound.clientTime,
            dependsOn: outbound.dependsOn,
            entityId: envelope.entityId,
            mutationId: outbound.mutationId,
            op: envelope.op
        )
    }
}

private typealias Mutations = Operations.MobileInventory_mutations
