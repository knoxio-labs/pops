import AppCore
import Foundation
import OpenAPIRuntime

/// The purchases list, read from the BFM mobile surface.
public struct BFMPurchasesRepository: PurchasesRepository {
    private let client: BFMHTTPClient
    private let timeZone: @Sendable () -> TimeZone

    public init(
        client: BFMHTTPClient,
        timeZone: @escaping @Sendable () -> TimeZone = { .autoupdatingCurrent }
    ) {
        self.client = client
        self.timeZone = timeZone
    }

    public func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        let status: ListPurchases.Input.Query.StatusPayload? =
            switch statusFilter {
            case .all: nil
            case .unsettled: .unsettled
            }
        let output: ListPurchases.Output
        do {
            output = try await client.generated.mobilePurchases_listPurchases(
                query: .init(cursor: cursor, status: status)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: ListPurchases.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return PurchasePage(
                purchases: try payload.data.map { try purchase(from: $0) },
                nextCursor: payload.nextCursor,
                totalCount: payload.total
            )
        case .badRequest:
            throw RepositoryError.transport("\(ListPurchases.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(ListPurchases.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: ListPurchases.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: ListPurchases.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(ListPurchases.id): undocumented status \(statusCode)"
            )
        }
    }

    private func purchase(from wire: ListPurchase) throws -> Purchase {
        guard let orderedOn = Self.day(from: wire.orderedOn, in: timeZone()) else {
            throw RepositoryError.contractMismatch
        }
        return Purchase(
            id: wire.id,
            merchant: Self.merchant(from: wire.merchant, printed: wire.merchantName),
            orderedOn: orderedOn,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: wire.currency),
            itemCount: wire.itemCount,
            receiptURI: wire.receiptUri,
            status: PurchaseSettlement(wire: wire.status)
        )
    }

    /// `printed` is the wire's deprecated `merchantName` field — the till's
    /// own wording, kept for one release alongside `merchant` (POPS-4317
    /// tracks its removal) — and is read here for exactly the case the old,
    /// two-case guess could never answer: an entity resolution names the
    /// contacts entity, not what the receipt printed, so `printed` is the
    /// only place that wording still comes from.
    private static func merchant(
        from wire: ListPurchase.MerchantPayload, printed: String?
    ) -> MerchantIdentity {
        let printed = Self.nonBlank(printed)
        switch wire {
        case .case1(let entity):
            // A resolved entity with neither its own name nor a printed one
            // is a row `identifyMerchant` never produces in practice — an
            // entity link always survives beside the label that created it —
            // so the fallback exists for type-safety, not a case seen live.
            return .entity(
                id: entity.entityId,
                name: entity.name.flatMap(Self.nonBlank) ?? printed ?? entity.entityId,
                printed: printed ?? entity.entityId
            )
        case .case2(let named):
            return .printed(named.name)
        case .case3:
            return .unattributed
        }
    }

    private static func nonBlank(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return value
    }

    private static func day(from raw: String, in timeZone: TimeZone) -> Date? {
        let style = Date.ISO8601FormatStyle(dateSeparator: .dash, timeZone: timeZone)
            .year()
            .month()
            .day()
        guard let date = try? Date(raw, strategy: style), style.format(date) == raw else {
            return nil
        }
        return date
    }
}

private typealias ListPurchases = Operations.MobilePurchases_listPurchases
private typealias ListPurchase = ListPurchases.Output.Ok.Body.JsonPayload.DataPayloadPayload
