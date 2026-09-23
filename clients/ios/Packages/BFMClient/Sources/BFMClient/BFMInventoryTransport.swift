import AppCore
import Foundation
import OpenAPIRuntime

/// `InventorySyncTransport`, read from the BFM's relay of the inventory
/// pillar's sync protocol (`/mobile/inventory/*`).
///
/// Every response case is mapped rather than left to fall through to
/// `.undocumented`: a `409` becomes `InventorySyncTransportError.resyncRequired`,
/// a `426` becomes `.clientTooOld`, and every other documented refusal becomes
/// the ``RepositoryError`` a screen already knows how to render
/// (`BFMInventoryFailureMapping`). Wire values this build has never seen
/// (an event kind, an actor kind, a lifecycle string) decode to their type's
/// `.unrecognised` case rather than failing the page, per D10.
public struct BFMInventoryTransport: InventorySyncTransport {
    internal let client: BFMHTTPClient
    internal let timeZone: @Sendable () -> TimeZone

    /// - Parameter timeZone: The zone a day-only wire value (an item's
    ///   `provenance.purchasedOn`/`warrantyExpires`) is read in.
    public init(
        client: BFMHTTPClient,
        timeZone: @escaping @Sendable () -> TimeZone = { .autoupdatingCurrent }
    ) {
        self.client = client
        self.timeZone = timeZone
    }

    public func fetchCatalogue(knownVersion: String?) async throws -> InventoryCatalogue? {
        let output: Catalogue.Output
        do {
            output = try await client.generated.mobileInventory_catalogue()
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: Catalogue.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return try BFMInventoryCatalogueWire.catalogue(
                version: payload.version,
                units: payload.units.map {
                    WireCatalogueUnit(
                        symbol: $0.symbol, dimension: $0.dimension, multiplier: $0.multiplier)
                },
                types: payload.types.map(Self.catalogueType(from:))
            )
        case .upgradeRequired:
            throw InventorySyncTransportError.clientTooOld
        case .badRequest:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: Catalogue.id)
        case .unauthorized:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: Catalogue.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: Catalogue.id)
        case .tooManyRequests:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: Catalogue.id)
        case .badGateway(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: Catalogue.id)
        case .serviceUnavailable(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: Catalogue.id)
        case .undocumented(let status, _):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: Catalogue.id)
        }
    }

    public func fetchCatalogue(revision: Int) async throws -> InventoryCatalogueSnapshot {
        let output: CatalogueRevision.Output
        do {
            output = try await client.generated.mobileInventory_catalogueRevision(
                query: .init(revision: revision))
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: CatalogueRevision.id)
        }
        switch output {
        case .ok(let ok):
            return try protocol2Catalogue(from: ok.body.json)
        case .badRequest:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: CatalogueRevision.id)
        case .unauthorized:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: CatalogueRevision.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: CatalogueRevision.id)
        case .tooManyRequests:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: CatalogueRevision.id)
        case .badGateway(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue),
                operation: CatalogueRevision.id)
        case .serviceUnavailable(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue),
                operation: CatalogueRevision.id)
        case .undocumented(let status, _):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: CatalogueRevision.id)
        }
    }

    private static func catalogueType(
        from wire: Catalogue.Output.Ok.Body.JsonPayload.TypesPayloadPayload
    ) -> WireCatalogueType {
        WireCatalogueType(
            key: wire.key, name: wire.name, capabilities: wire.capabilities,
            fields: wire.fields.map(catalogueField(from:)),
            legacyLabels: wire.legacyLabels
        )
    }

    private static func catalogueField(
        from wire: Catalogue.Output.Ok.Body.JsonPayload.TypesPayloadPayload.FieldsPayloadPayload
    ) -> WireCatalogueField {
        WireCatalogueField(
            key: wire.key, label: wire.label, kind: wire.kind, dimension: wire.dimension,
            unit: wire.unit, choices: wire.choices, highlighted: wire.highlighted ?? false,
            required: wire.required ?? false
        )
    }

    /// Both documented `403` shapes (`device_revoked`, `capability_not_granted`)
    /// land on ``RepositoryError/unauthorized`` — the same reading every other
    /// `/mobile/*` repository gives them (`BFMTransactionsRepository`) — but
    /// each is matched explicitly rather than left to fall through, per the
    /// slice's own bar: an unmapped case here is one this build never chose
    /// to treat this way, it merely happened to.
    internal static func forbiddenFailure<Body: WireForbiddenBody>(
        _ body: Body, operation: String
    ) -> RepositoryError {
        if let capability = body.capabilityNotGranted {
            return BFMInventoryFailureMapping.repositoryError(
                for: .capabilityDenied(capability: capability), operation: operation)
        }
        return BFMInventoryFailureMapping.repositoryError(for: .unauthorized, operation: operation)
    }
}

private typealias Catalogue = Operations.MobileInventory_catalogue
private typealias CatalogueRevision = Operations.MobileInventory_catalogueRevision
