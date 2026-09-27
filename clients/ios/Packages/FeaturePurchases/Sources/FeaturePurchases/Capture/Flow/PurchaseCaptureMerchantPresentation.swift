import AppCore

@MainActor
internal struct PurchaseCaptureMerchantPresentation {
    private let directory: PurchaseCaptureMerchantDirectory
    private let errorPresenter: any ErrorPresenter

    internal init(
        directory: PurchaseCaptureMerchantDirectory,
        errorPresenter: any ErrorPresenter
    ) {
        self.directory = directory
        self.errorPresenter = errorPresenter
    }

    internal func search(_ query: String) async -> [ReceiptMerchantChoice] {
        do {
            return try await directory.search(query)
        } catch {
            presentMerchantFailure(error, operation: "Search merchants")
            return []
        }
    }

    internal func merchant(_ id: String) async -> ReceiptMerchantChoice? {
        do {
            return try await directory.merchant(id)
        } catch {
            presentMerchantFailure(error, operation: "Load merchant")
            return nil
        }
    }

    internal func addresses(_ merchantID: String) async -> [ReceiptAddressChoice] {
        do {
            return try await directory.addresses(for: merchantID)
        } catch {
            presentMerchantFailure(error, operation: "Load merchant addresses")
            return []
        }
    }

    internal func address(
        merchantID: String,
        addressID: String
    ) async -> ReceiptAddressChoice? {
        do {
            return try await directory.address(
                merchantID: merchantID,
                addressID: addressID)
        } catch {
            presentMerchantFailure(error, operation: "Load merchant address")
            return nil
        }
    }

    private func presentMerchantFailure(_ error: Error, operation: String) {
        let repositoryError = RepositoryError.describing(error)
        errorPresenter.present(
            PopsError(
                repositoryError: repositoryError,
                fallbackMessage: "Merchant information could not be loaded. Try again."),
            operation: operation,
            context: .foreground)
    }
}
