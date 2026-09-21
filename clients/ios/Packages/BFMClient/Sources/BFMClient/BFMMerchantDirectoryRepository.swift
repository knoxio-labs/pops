import AppCore
import OpenAPIRuntime

/// Searching, reading and creating a merchant, and a merchant's recorded
/// addresses — all through the BFM's `/mobile/contacts/*` surface
/// (POPS-3753, ADR-053).
///
/// Carries no credential of its own, matching ``BFMReceiptCaptureRepository``:
/// every route here is a device-authenticated call, and the client handed in
/// is expected to already carry the middleware that attaches one.
public struct BFMMerchantDirectoryRepository: MerchantDirectoryRepository {
    /// The page size `search` asks for. There is no cursor on this route
    /// (POPS-3753's design: a searchable sheet over server-side matching, not
    /// a scroll the phone pages through), so this is simply "enough
    /// candidates that the reader's typing narrows them below what fits" —
    /// the same width `MobilePageLimit` caps every mobile list route at.
    private static let searchLimit = 50

    private let client: BFMHTTPClient

    /// - Parameter client: Already carrying whatever authenticates a
    ///   `/mobile/*` call.
    public init(client: BFMHTTPClient) {
        self.client = client
    }

    public func search(_ query: String) async throws -> [MerchantDirectoryEntry] {
        let output: SearchMerchants.Output
        do {
            output = try await client.generated.mobileContacts_searchMerchants(
                query: .init(q: query, limit: Self.searchLimit)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: SearchMerchants.id)
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.data.map(Self.entry(from:))
        case .badRequest:
            throw RepositoryError.transport("\(SearchMerchants.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(SearchMerchants.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: SearchMerchants.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: SearchMerchants.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(SearchMerchants.id): undocumented status \(statusCode)"
            )
        }
    }

    public func get(_ id: String) async throws -> MerchantDirectoryEntry? {
        let output: GetMerchant.Output
        do {
            output = try await client.generated.mobileContacts_getMerchant(path: .init(id: id))
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetMerchant.id)
        }

        switch output {
        case .ok(let ok):
            return Self.entry(from: try ok.body.json)
        case .notFound:
            return nil
        case .badRequest:
            throw RepositoryError.transport("\(GetMerchant.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetMerchant.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMerchant.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMerchant.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(GetMerchant.id): undocumented status \(statusCode)"
            )
        }
    }

    public func create(name: String) async throws -> MerchantDirectoryEntry {
        let output: CreateMerchant.Output
        do {
            output = try await client.generated.mobileContacts_createMerchant(
                body: .json(.init(name: name))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: CreateMerchant.id)
        }

        switch output {
        case .ok(let ok):
            return Self.entry(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(CreateMerchant.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(CreateMerchant.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: CreateMerchant.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: CreateMerchant.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(CreateMerchant.id): undocumented status \(statusCode)"
            )
        }
    }

    public func addresses(forMerchant id: String) async throws -> [MerchantAddressEntry] {
        let output: GetMerchantAddresses.Output
        do {
            output = try await client.generated.mobileContacts_getMerchantAddresses(
                path: .init(id: id)
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetMerchantAddresses.id)
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.data.map(Self.address(from:))
        case .notFound:
            throw RepositoryError.transport("\(GetMerchantAddresses.id): no such merchant")
        case .badRequest:
            throw RepositoryError.transport("\(GetMerchantAddresses.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetMerchantAddresses.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMerchantAddresses.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetMerchantAddresses.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(GetMerchantAddresses.id): undocumented status \(statusCode)"
            )
        }
    }

    public func createAddress(forMerchant id: String, value: String) async throws
        -> MerchantAddressEntry
    {
        let output: CreateMerchantAddress.Output
        do {
            output = try await client.generated.mobileContacts_createMerchantAddress(
                path: .init(id: id),
                body: .json(.init(value: value))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: CreateMerchantAddress.id)
        }

        switch output {
        case .ok(let ok):
            return Self.address(from: try ok.body.json)
        case .notFound:
            throw RepositoryError.transport("\(CreateMerchantAddress.id): no such merchant")
        case .badRequest:
            throw RepositoryError.transport("\(CreateMerchantAddress.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(CreateMerchantAddress.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: CreateMerchantAddress.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: CreateMerchantAddress.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(CreateMerchantAddress.id): undocumented status \(statusCode)"
            )
        }
    }
}

extension BFMMerchantDirectoryRepository {
    fileprivate static func entry(from wire: MerchantPayload) -> MerchantDirectoryEntry {
        MerchantDirectoryEntry(id: wire.id, name: wire.name)
    }

    fileprivate static func address(from wire: AddressPayload) -> MerchantAddressEntry {
        MerchantAddressEntry(id: wire.id, value: wire.value)
    }
}

private typealias SearchMerchants = Operations.MobileContacts_searchMerchants
private typealias GetMerchant = Operations.MobileContacts_getMerchant
private typealias CreateMerchant = Operations.MobileContacts_createMerchant
private typealias GetMerchantAddresses = Operations.MobileContacts_getMerchantAddresses
private typealias CreateMerchantAddress = Operations.MobileContacts_createMerchantAddress

/// The wire shape one merchant answers as, common to search/get/create's
/// `Ok` bodies — three distinct generated types with the same two fields,
/// unified so one mapper serves all three (matching
/// ``BFMReceiptCaptureRepository``'s `PurchaseDetailPayload`).
private protocol MerchantPayload {
    var id: String { get }
    var name: String { get }
}

extension Operations.MobileContacts_searchMerchants.Output.Ok.Body.JsonPayload.DataPayloadPayload:
    MerchantPayload
{}
extension Operations.MobileContacts_getMerchant.Output.Ok.Body.JsonPayload: MerchantPayload {}
extension Operations.MobileContacts_createMerchant.Output.Ok.Body.JsonPayload: MerchantPayload {}

/// The wire shape one address answers as, common to the list and create
/// `Ok` bodies.
private protocol AddressPayload {
    var id: String { get }
    var value: String { get }
}

extension Operations.MobileContacts_getMerchantAddresses.Output.Ok.Body.JsonPayload
    .DataPayloadPayload: AddressPayload
{}
extension Operations.MobileContacts_createMerchantAddress.Output.Ok.Body.JsonPayload: AddressPayload
{}
