import AppCore
import Foundation
import OpenAPIRuntime

/// The transactions list, read from the BFM.
///
/// The screen that renders these knows only ``TransactionsRepository``. Which
/// host answers, what a `503` from finance means, and how a decimal on the wire
/// becomes integer cents are all decided here, once — a feature that had to
/// know any of it would be a feature that cannot be run against a fake.
///
/// Carries no credential of its own. The `/mobile/*` routes need a bearer
/// token, and the client handed in is expected to already have the middleware
/// that attaches one; this type never sees it. That split is what keeps the
/// retry-and-refresh rules in one place instead of once per repository.
public struct BFMTransactionsRepository: TransactionsRepository {
    private let client: BFMHTTPClient
    private let timeZone: @Sendable () -> TimeZone

    /// - Parameters:
    ///   - client: Already carrying whatever authenticates a `/mobile/*` call.
    ///   - timeZone: The zone a date-only value is read in. It is the device's
    ///     own because that is the zone the row is later formatted back in, and
    ///     those two have to agree or a transaction dated the 5th renders as
    ///     the 4th for everybody west of UTC. Injected so a test can pin it.
    public init(
        client: BFMHTTPClient,
        timeZone: @escaping @Sendable () -> TimeZone = { .autoupdatingCurrent }
    ) {
        self.client = client
        self.timeZone = timeZone
    }

    /// One page, and a restart when the server disowns the cursor it is given.
    ///
    /// `invalid_cursor` is not a failure to report. It says the token this app
    /// is holding is not one this server issued — a cursor encoding that
    /// changed under a running app — and the server's own instruction is to
    /// start the list again. Doing that here rather than surfacing an error
    /// keeps the rows already on screen: the caller merges by id, so a first
    /// page it has already seen adds nothing and paging resumes against a
    /// cursor that works.
    ///
    /// The restart cannot recurse. It passes no cursor, and the BFM only ever
    /// rejects one it was given.
    public func transactions(after cursor: String?) async throws -> TransactionPage {
        switch try await fetch(after: cursor) {
        case .page(let page):
            return page
        case .cursorRejected:
            guard cursor != nil else { throw RepositoryError.contractMismatch }
            guard case .page(let page) = try await fetch(after: nil) else {
                throw RepositoryError.contractMismatch
            }
            return page
        }
    }
}

/// A page, or the one refusal that is answered rather than thrown.
private enum PageOutcome {
    case page(TransactionPage)
    case cursorRejected
}

extension BFMTransactionsRepository {
    private func fetch(after cursor: String?) async throws -> PageOutcome {
        let output: ListTransactions.Output
        do {
            // No `limit`: the BFM sizes a page for a phone screen and the
            // scroll ahead of it, and a number chosen here would be a second
            // opinion about the same thing, shipped in a binary that cannot be
            // changed once it is on a handset.
            output = try await client.generated.mobileFinance_listTransactions(
                query: .init(cursor: cursor)
            )
        } catch let error as ClientError {
            throw Self.failure(error)
        }

        return try outcome(of: output)
    }

    /// - Note: Every `try …body.json` here is outside the `do`/`catch` above,
    ///   for the reason ``BFMClientError`` states: a body the generated client
    ///   could not decode is already wrapped as a `ClientError` by the time it
    ///   reaches this switch.
    private func outcome(of output: ListTransactions.Output) throws -> PageOutcome {
        switch output {
        case .ok(let ok):
            return .page(try page(from: try ok.body.json))
        case .badRequest(let refused):
            guard try refused.body.json.code == .invalidCursor else {
                throw RepositoryError.transport("\(ListTransactions.id): invalid request")
            }
            return .cursorRejected
        // The device, not the request. Both end the session — a `403` through
        // `AuthenticatingMiddleware` has already destroyed the credentials by
        // the time this runs — and the screen says the same thing about each.
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(ListTransactions.id): rate limited")
        case .badGateway(let upstream):
            throw Self.upstreamFailure(try upstream.body.json.code.rawValue)
        case .serviceUnavailable(let upstream):
            throw Self.upstreamFailure(try upstream.body.json.code.rawValue)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(ListTransactions.id): undocumented status \(statusCode)"
            )
        }
    }

    /// The BFM's upstream vocabulary, collapsed onto what a screen can do about
    /// it — but not past the one distinction that matters.
    ///
    /// `upstream_unavailable` and `upstream_contract_mismatch` must not
    /// converge. The first is "finance is not answering", which is worth
    /// retrying; the second is "finance answered something this build cannot
    /// read", which is not, and which the list renders as a different sentence
    /// with a different next action.
    ///
    /// `upstream_misconfigured` joins the unavailable side rather than the
    /// mismatch one: a pillar whose configuration is wrong is not serving, and
    /// nothing about the phone's build is implicated. Matched on the raw string
    /// because the generator emits one closed enum per status and the two are
    /// distinct types carrying identical cases.
    private static func upstreamFailure(_ code: String) -> RepositoryError {
        switch code {
        case "upstream_unavailable", "upstream_degraded", "upstream_misconfigured":
            return .unavailable
        case "upstream_contract_mismatch":
            return .contractMismatch
        default:
            return .transport("\(ListTransactions.id): upstream \(code)")
        }
    }

    /// What a call that did not complete — or completed with a body this build
    /// could not decode — means.
    ///
    /// The status is the actionable half and it survives even when the body
    /// does not, which is the case an intermediary in front of this BFM
    /// produces: an HTML error page on a documented status never reaches the
    /// switch above. `502`/`503` resolve to `unavailable` rather than to the
    /// mismatch they might have carried, because "not answering" is the reading
    /// that costs least when it is wrong. A `400` cannot be resolved at all —
    /// `invalid_cursor` and `invalid_request` differ only in the body — so it
    /// stays a transport failure rather than triggering a restart this app
    /// cannot justify.
    private static func failure(_ error: ClientError) -> RepositoryError {
        switch error.response?.status.code {
        case 401, 403:
            return .unauthorized
        case 502, 503:
            return .unavailable
        default:
            // Through `BFMClientError` for its sanitiser and not around it: a
            // `ClientError`'s own description renders the operation's typed
            // input and every request header, `Authorization` included.
            return .transport(
                BFMClientError.transportFailure(error, operation: ListTransactions.id).description
            )
        }
    }
}

extension BFMTransactionsRepository {
    private func page(from payload: ListTransactions.Output.Ok.Body.JsonPayload) throws
        -> TransactionPage
    {
        TransactionPage(
            transactions: try payload.data.map(row(from:)),
            nextCursor: payload.nextCursor
        )
    }

    /// One wire row into the app's own vocabulary.
    ///
    /// A row this build cannot represent fails the whole page rather than being
    /// dropped from it. ``RepositoryError/contractMismatch`` exists for exactly
    /// this — an app meeting a contract written after it — and a list quietly
    /// missing the transaction somebody is looking for is worse than one that
    /// says it cannot be read.
    ///
    /// `type` goes through as a raw value on purpose: it is the one field the
    /// finance pillar is free to add to, and a Swift enum here would turn a
    /// routine producer change into a blank list on every handset already
    /// carrying this build.
    private func row(from wire: ListTransactionRow) throws -> Transaction {
        guard
            let majorUnits = Self.majorUnits(of: wire.amount),
            let amount = MoneyAmount(majorUnits: majorUnits, currencyCode: wire.currency.rawValue),
            let date = Self.day(from: wire.date, in: timeZone())
        else { throw RepositoryError.contractMismatch }

        return Transaction(
            id: wire.id,
            description: wire.description,
            amount: amount,
            date: date,
            type: TransactionType(rawValue: wire._type),
            entityName: wire.entityName,
            tags: wire.tags
        )
    }

    /// `YYYY-MM-DD` and nothing else, as the instant that day begins in the
    /// given zone.
    ///
    /// The contract types `date` as a bare string with no `format`, so the
    /// generator emits a `String` and something has to decide what it means.
    /// This is the strictest reading that matches what the BFM already enforces
    /// on the way in, and being strict is the point: a producer that started
    /// sending a full timestamp arrives as a contract mismatch, loudly, rather
    /// than as dates that are silently a few hours out.
    ///
    /// The round trip is what makes it strict. `ISO8601FormatStyle` restricted
    /// to date components parses a leading `2026-03-05` happily and ignores
    /// whatever follows it, so parsing alone accepts a timestamp; formatting
    /// the result back and requiring the same bytes does not.
    private static func day(from raw: String, in timeZone: TimeZone) -> Date? {
        let style = Date.ISO8601FormatStyle(dateSeparator: .dash, timeZone: timeZone)
            .year()
            .month()
            .day()

        guard let parsed = try? Date(raw, strategy: style), style.format(parsed) == raw else {
            return nil
        }
        return parsed
    }

    /// The wire carries money as a JSON number, so the generator hands over a
    /// `Double` and this conversion exists only because of that choice.
    ///
    /// It goes through the shortest decimal string that round-trips the value,
    /// never through arithmetic on the `Double` itself.
    /// `19.99` is not a binary float; `Decimal(19.99)` is
    /// `19.989999999999998976` and scaling that yields `1998` cents. Its
    /// `description` is `"19.99"`, which is exactly what the server serialised
    /// and what `Decimal(string:)` reads back without loss.
    private static func majorUnits(of amount: Double) -> Decimal? {
        guard amount.isFinite else { return nil }
        return Decimal(string: String(amount))
    }
}

/// The generated names, shortened. Written out in full they pass 120 columns in
/// every signature below, and the type they abbreviate is `internal` to this
/// module — nothing here widens what a caller can name.
private typealias ListTransactions = Operations.MobileFinance_listTransactions
private typealias ListTransactionRow =
    ListTransactions.Output.Ok.Body.JsonPayload.DataPayloadPayload
