import AppCore
import Foundation

internal func documentFileFailure(response: HTTPURLResponse, body: Data) -> any Error {
    switch response.statusCode {
    case 401: return RepositoryError.unauthorized
    case 403:
        let value = try? JSONDecoder().decode(DocumentFileRefusal.self, from: body)
        return value?.code == "capability_not_granted"
            ? RepositoryError.featureUnavailable : RepositoryError.unauthorized
    case 404: return DocumentAccessError.notFound
    case 412: return DocumentAccessError.notConfigured
    case 429:
        let value = try? JSONDecoder().decode(DocumentFileRefusal.self, from: body)
        return RepositoryError.rateLimited(
            retryAfterSeconds: value?.retryAfterSeconds.flatMap { $0 >= 0 ? $0 : nil }
                ?? BFMRetryAfter.seconds(response.value(forHTTPHeaderField: "Retry-After")))
    case 502, 503: return RepositoryError.unavailable
    default: return RepositoryError.contractMismatch
    }
}

private struct DocumentFileRefusal: Decodable {
    let code: String?
    let retryAfterSeconds: Int?
}
