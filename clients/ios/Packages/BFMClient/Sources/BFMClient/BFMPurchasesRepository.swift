import AppCore
import Foundation
import OpenAPIRuntime

/// The purchases list, read from the BFM mobile surface.
public struct BFMPurchasesRepository: PurchasesRepository {
    let client: BFMHTTPClient
    let timeZone: @Sendable () -> TimeZone

    /// Creates a purchases repository over an authenticated BFM client.
    ///
    /// - Parameters:
    ///   - client: The client used for mobile purchase requests.
    ///   - timeZone: The zone used to interpret date-only purchase values.
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

    public func monthSummary(for month: Date) async throws -> PurchasesMonthSummary {
        let output: GetMonthSummary.Output
        do {
            output = try await client.generated.mobilePurchases_getMonthSummary(
                query: .init(month: Self.month(from: month, in: timeZone()))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetMonthSummary.id)
        }

        switch output {
        case .ok(let ok):
            return Self.summary(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(GetMonthSummary.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetMonthSummary.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMonthSummary.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMonthSummary.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(GetMonthSummary.id): undocumented status \(statusCode)"
            )
        }
    }

    private static func summary(
        from payload: GetMonthSummary.Output.Ok.Body.JsonPayload
    ) -> PurchasesMonthSummary {
        PurchasesMonthSummary(
            totals: payload.totals.map { total in
                currencyTotal(
                    totalCents: total.totalCents,
                    netSpendCents: total.netSpendCents,
                    currency: total.currency,
                    orderCount: total.orderCount)
            },
            purchaseCount: payload.purchaseCount,
            previousMonthTotals: payload.previousMonthTotals?.map { total in
                currencyTotal(
                    totalCents: total.totalCents,
                    netSpendCents: total.netSpendCents,
                    currency: total.currency,
                    orderCount: total.orderCount)
            },
            unmatchedCount: payload.unmatchedCount,
            merchantLeaders: payload.merchantLeaders.map { leader in
                PurchasesMerchantLeader(
                    merchantName: leader.merchantName,
                    netSpend: MoneyAmount(
                        minorUnits: leader.netSpendCents,
                        currencyCode: leader.currency),
                    orderCount: leader.orderCount)
            })
    }

    private static func currencyTotal(
        totalCents: Int, netSpendCents: Int, currency: String, orderCount: Int
    ) -> PurchasesCurrencyTotal {
        PurchasesCurrencyTotal(
            total: MoneyAmount(minorUnits: totalCents, currencyCode: currency),
            netSpend: MoneyAmount(minorUnits: netSpendCents, currencyCode: currency),
            orderCount: orderCount
        )
    }

    private static func month(from date: Date, in timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
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

    static func nonBlank(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return value
    }

    static func day(from raw: String, in timeZone: TimeZone) -> Date? {
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
private typealias GetMonthSummary = Operations.MobilePurchases_getMonthSummary
