import AppCore
import OpenAPIRuntime

internal func tripReadFailure(_ error: ClientError, operation: String) -> RepositoryError {
    if BFMRepositoryFailure.statusCode(in: error) == 429 {
        let supplied = PopsError.runtimeFailureDetails(from: error)?.retryAfterSeconds
        return .rateLimited(
            retryAfterSeconds: supplied)
    }
    return BFMRepositoryFailure.failure(error, operation: operation)
}
