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

    public func purchases(after cursor: String?) async throws -> PurchasePage {
        let output: ListPurchases.Output
        do {
            output = try await client.generated.mobilePurchases_listPurchases(
                query: .init(cursor: cursor)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: ListPurchases.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return PurchasePage(
                purchases: try payload.data.map { try purchase(from: $0) },
                nextCursor: payload.nextCursor
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
            merchantName: wire.merchantName,
            orderedOn: orderedOn,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: wire.currency),
            itemCount: wire.itemCount,
            receiptURI: wire.receiptUri
        )
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
