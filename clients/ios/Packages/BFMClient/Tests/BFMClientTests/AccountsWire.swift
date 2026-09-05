import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// The bodies the `/mobile/finance/accounts` routes answer with, written as the
/// JSON the BFM actually sends — see ``TransactionsWire`` for why these are
/// strings rather than encoded generated types.
internal enum AccountsWire {
    internal static func account(
        id: String = "acc-1",
        name: String = "Everyday",
        kind: String = "checking",
        currency: String = "AUD",
        archived: String = "false",
        institutionId: String = "\"inst-anz\"",
        institutionName: String = "\"ANZ\"",
        contact: String = "null",
        balanceCents: Int = 125_000,
        asOf: String = "2026-09-05",
        basis: String = "checkpoint",
        inconsistent: String = "false"
    ) -> String {
        """
        {"id":"\(id)","name":"\(name)","kind":"\(kind)","currency":"\(currency)",\
        "archived":\(archived),"institutionId":\(institutionId),\
        "institutionName":\(institutionName),"contact":\(contact),\
        "balance":{"balanceCents":\(balanceCents),"asOf":"\(asOf)",\
        "basis":"\(basis)","inconsistent":\(inconsistent)}}
        """
    }

    internal static func page(_ accounts: String...) -> String {
        """
        {"data":[\(accounts.joined(separator: ","))]}
        """
    }

    internal static func point(month: String, balanceCents: Int) -> String {
        """
        {"month":"\(month)","balanceCents":\(balanceCents)}
        """
    }

    internal static func detail(account: String = account(), history: [String] = []) -> String {
        """
        {"account":\(account),"history":[\(history.joined(separator: ","))]}
        """
    }
}

extension BFMAccountsRepository {
    /// A repository over a stubbed transport, in the zone every date assertion
    /// in these suites is written against.
    internal static func stubbed(_ transport: StubTransport) throws -> BFMAccountsRepository {
        BFMAccountsRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            ),
            timeZone: { TransactionsWire.timeZone }
        )
    }
}

extension StubTransport {
    /// Answers the account routes with one body and the transactions route with
    /// another, so the two calls behind a dashboard can be stubbed apart.
    ///
    /// Routed on the path rather than on call order: the detail fetch makes its
    /// two requests in a fixed sequence today, and a stub that encoded that
    /// would pass a repository that made them in either order or twice.
    internal static func routed(
        accounts: (status: HTTPResponse.Status, json: String),
        transactions: (status: HTTPResponse.Status, json: String)
    ) -> StubTransport {
        StubTransport { request, _ in
            let chosen =
                (request.path ?? "").contains("/accounts") ? accounts : transactions
            return (
                HTTPResponse(
                    status: chosen.status, headerFields: [.contentType: "application/json"]),
                HTTPBody(chosen.json)
            )
        }
    }
}
