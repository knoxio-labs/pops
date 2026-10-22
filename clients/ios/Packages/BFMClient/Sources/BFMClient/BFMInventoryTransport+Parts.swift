import AppCore
import OpenAPIRuntime

extension BFMInventoryTransport: InventoryPartsService {
    public func parts(of itemId: InventoryItem.ID) async throws -> InventoryItemParts {
        let output: ItemParts.Output
        do {
            output = try await client.generated.mobileInventory_itemParts(path: .init(id: itemId))
        } catch let error as ClientError {
            throw Self.partsFailure(error, operation: ItemParts.id)
        }
        switch output {
        case .ok(let ok): return try inventoryItemParts(from: ok.body.json)
        case .notFound: throw InventoryPartsError.notFound
        case .serviceUnavailable: throw InventoryPartsError.unavailable
        case .badRequest: throw Self.partsFailure(.badRequest, ItemParts.id)
        case .unauthorized: throw Self.partsFailure(.unauthorized, ItemParts.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: ItemParts.id)
        case .tooManyRequests: throw Self.partsFailure(.rateLimited, ItemParts.id)
        case .badGateway(let upstream):
            throw Self.partsFailure(.upstream(code: try upstream.body.json.code), ItemParts.id)
        case .undocumented(let status, _):
            throw Self.partsFailure(.undocumented(status), ItemParts.id)
        }
    }

    public func addPart(_ partId: InventoryItem.ID, to assemblyId: InventoryItem.ID) async throws
        -> InventoryItemParts
    {
        let output: AddPart.Output
        do {
            output = try await client.generated.mobileInventory_addItemPart(
                path: .init(id: assemblyId), body: .json(.init(partItemId: partId)))
        } catch let error as ClientError {
            throw Self.partsFailure(error, operation: AddPart.id)
        }
        switch output {
        case .ok(let ok): return try inventoryItemParts(from: ok.body.json)
        case .conflict(let conflict):
            throw InventoryPartsError.refused(try conflict.body.json.message)
        case .notFound: throw InventoryPartsError.notFound
        case .serviceUnavailable: throw InventoryPartsError.unavailable
        case .badRequest: throw Self.partsFailure(.badRequest, AddPart.id)
        case .unauthorized: throw Self.partsFailure(.unauthorized, AddPart.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: AddPart.id)
        case .tooManyRequests: throw Self.partsFailure(.rateLimited, AddPart.id)
        case .badGateway(let upstream):
            throw Self.partsFailure(.upstream(code: try upstream.body.json.code), AddPart.id)
        case .undocumented(let status, _):
            throw Self.partsFailure(.undocumented(status), AddPart.id)
        }
    }

    public func removePart(_ partId: InventoryItem.ID, from assemblyId: InventoryItem.ID)
        async throws -> InventoryItemParts
    {
        let output: RemovePart.Output
        do {
            output = try await client.generated.mobileInventory_removeItemPart(
                path: .init(id: assemblyId, partItemId: partId))
        } catch let error as ClientError {
            throw Self.partsFailure(error, operation: RemovePart.id)
        }
        switch output {
        case .ok(let ok): return try inventoryItemParts(from: ok.body.json)
        case .notFound: throw InventoryPartsError.notFound
        case .serviceUnavailable: throw InventoryPartsError.unavailable
        case .badRequest: throw Self.partsFailure(.badRequest, RemovePart.id)
        case .unauthorized: throw Self.partsFailure(.unauthorized, RemovePart.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: RemovePart.id)
        case .tooManyRequests: throw Self.partsFailure(.rateLimited, RemovePart.id)
        case .badGateway(let upstream):
            throw Self.partsFailure(.upstream(code: try upstream.body.json.code), RemovePart.id)
        case .undocumented(let status, _):
            throw Self.partsFailure(.undocumented(status), RemovePart.id)
        }
    }

    private static func partsFailure(_ failure: BFMInventoryCommonFailure, _ operation: String)
        -> RepositoryError
    {
        BFMInventoryFailureMapping.repositoryError(for: failure, operation: operation)
    }

    /// The error middleware throws every non-2xx before the typed switch sees
    /// it, so the statuses a parts screen acts on are recovered here: a
    /// refusal keeps the server's own sentence, which the screen shows as-is.
    private static func partsFailure(_ error: ClientError, operation: String) -> any Error {
        switch BFMRepositoryFailure.statusCode(in: error) {
        case 404:
            return InventoryPartsError.notFound
        case 409:
            guard let message = PopsError.runtimeFailure(from: error)?.message else {
                return Self.failure(error, operation: operation)
            }
            return InventoryPartsError.refused(message)
        case 503:
            return InventoryPartsError.unavailable
        default:
            return Self.failure(error, operation: operation)
        }
    }
}

/// Maps any of the three operations' identical, separately generated
/// payloads into the AppCore model.
internal func inventoryItemParts<Payload: WireItemParts>(from payload: Payload) throws
    -> InventoryItemParts
{
    InventoryItemParts(
        canHaveParts: payload.canHaveParts,
        assembly: payload.assembly.map(reference(from:)),
        parts: try payload.parts.map { part in
            InventoryPart(
                reference: reference(from: part), typeId: part.typeId,
                lifecycle: InventoryLifecycle(wire: part.lifecycle),
                placement: try partPlacement(from: part.placement))
        })
}

private func reference<Ref: WireItemReference>(from wire: Ref) -> InventoryItemReference {
    InventoryItemReference(id: wire.itemId, name: wire.name, code: wire.code)
}

private func partPlacement<Placement: WirePartPlacement>(from wire: Placement) throws
    -> InventoryPartPlacement
{
    switch wire.kindRawValue {
    case "hand":
        return .hand
    case "location":
        guard let id = wire.locationId else { throw RepositoryError.contractMismatch }
        return .location(id: id, name: wire.locationName)
    case "container":
        guard let id = wire.containingItemId else { throw RepositoryError.contractMismatch }
        return .container(id: id, name: wire.containingItemName)
    default:
        throw RepositoryError.contractMismatch
    }
}

internal protocol WireItemReference {
    var itemId: String { get }
    var name: String { get }
    var code: String? { get }
}

internal protocol WirePartPlacement {
    var kindRawValue: String { get }
    var locationId: String? { get }
    var locationName: String? { get }
    var containingItemId: String? { get }
    var containingItemName: String? { get }
}

internal protocol WirePart: WireItemReference {
    associatedtype Placement: WirePartPlacement
    var typeId: String? { get }
    var lifecycle: String { get }
    var placement: Placement { get }
}

internal protocol WireItemParts {
    associatedtype Reference: WireItemReference
    associatedtype Part: WirePart
    var canHaveParts: Bool { get }
    var assembly: Reference? { get }
    var parts: [Part] { get }
}

extension ItemParts.Output.Ok.Body.JsonPayload: WireItemParts {}
extension ItemParts.Output.Ok.Body.JsonPayload.AssemblyPayload: WireItemReference {}
extension ItemParts.Output.Ok.Body.JsonPayload.PartsPayloadPayload: WirePart {}
extension ItemParts.Output.Ok.Body.JsonPayload.PartsPayloadPayload.PlacementPayload:
    WirePartPlacement
{
    var kindRawValue: String { kind.rawValue }
}

extension AddPart.Output.Ok.Body.JsonPayload: WireItemParts {}
extension AddPart.Output.Ok.Body.JsonPayload.AssemblyPayload: WireItemReference {}
extension AddPart.Output.Ok.Body.JsonPayload.PartsPayloadPayload: WirePart {}
extension AddPart.Output.Ok.Body.JsonPayload.PartsPayloadPayload.PlacementPayload:
    WirePartPlacement
{
    var kindRawValue: String { kind.rawValue }
}

extension RemovePart.Output.Ok.Body.JsonPayload: WireItemParts {}
extension RemovePart.Output.Ok.Body.JsonPayload.AssemblyPayload: WireItemReference {}
extension RemovePart.Output.Ok.Body.JsonPayload.PartsPayloadPayload: WirePart {}
extension RemovePart.Output.Ok.Body.JsonPayload.PartsPayloadPayload.PlacementPayload:
    WirePartPlacement
{
    var kindRawValue: String { kind.rawValue }
}

private typealias ItemParts = Operations.MobileInventory_itemParts
private typealias AddPart = Operations.MobileInventory_addItemPart
private typealias RemovePart = Operations.MobileInventory_removeItemPart
