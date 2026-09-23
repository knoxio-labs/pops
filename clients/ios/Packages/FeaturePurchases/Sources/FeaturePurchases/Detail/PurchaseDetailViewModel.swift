import AppCore
import Foundation
import Observation

internal enum PurchaseDetailFailure: Hashable, Sendable {
    case offline
    case unreachable
    case notFound
    case unauthorized
    case contractMismatch

    internal init(_ error: Error) {
        switch error as? RepositoryError {
        case .transport: self = .offline
        case .unavailable: self = .unreachable
        case .unauthorized: self = .unauthorized
        case .contractMismatch, .conflict, .dependencyNotBound: self = .contractMismatch
        case nil: self = .offline
        }
    }
}

internal enum PurchaseDetailPhase: Hashable, Sendable {
    case loading
    case loaded(PurchaseDetail, refresh: PurchaseDetailFailure?)
    case failed(PurchaseDetailFailure)
}

internal struct PurchaseReceiptThumbnail: Identifiable, Hashable, Sendable {
    internal let pageIndex: Int
    internal let image: ReceiptImage

    internal var id: Int { pageIndex }
}

@MainActor @Observable
internal final class PurchaseDetailViewModel {
    internal private(set) var phase: PurchaseDetailPhase = .loading
    internal private(set) var receiptPages: [PurchaseReceiptThumbnail] = []
    internal private(set) var receiptFull: ReceiptImage?
    internal private(set) var openReceiptIndex: Int?

    internal var receiptThumbnails: [ReceiptImage] { receiptPages.map(\.image) }

    internal func receiptImages(for detail: PurchaseDetail) -> [Data] {
        detail.receiptURIs.indices.map { index in
            if openReceiptIndex == index, let receiptFull {
                return receiptFull.data
            }
            return receiptPages.first(where: { $0.pageIndex == index })?.image.data ?? Data()
        }
    }

    private let id: Purchase.ID
    private let repository: any PurchasesRepository
    private var detailGeneration = 0
    private var thumbnailGeneration = 0
    private var fullImageGeneration = 0

    internal init(id: Purchase.ID, dependencies: AppDependencies) {
        self.id = id
        repository = dependencies.purchases
    }

    internal func load() async {
        let previous = phase
        phase = .loading
        await read(previous: previous, isRefresh: false)
    }

    internal func retry() async {
        guard case .failed(let failure) = phase, PurchaseDetailCopy.isRetryable(failure) else {
            return
        }
        await load()
    }

    internal func refresh() async {
        guard case .loaded = phase else { return }
        await read(previous: phase, isRefresh: true)
    }

    internal func applySaved(_ detail: PurchaseDetail) {
        let keepsReceipts =
            if case .loaded(let current, _) = phase {
                current.receiptURIs == detail.receiptURIs
            } else {
                false
            }
        invalidateRequests()
        phase = .loaded(detail, refresh: nil)
        if !keepsReceipts {
            receiptPages = []
            receiptFull = nil
            openReceiptIndex = nil
        }
    }

    internal func openReceipt(at index: Int) async {
        guard case .loaded(let detail, _) = phase,
            detail.receiptURIs.indices.contains(index),
            let sha256 = ReceiptURI.sha256(from: detail.receiptURIs[index])
        else { return }

        fullImageGeneration += 1
        let requestGeneration = fullImageGeneration
        receiptFull = nil
        openReceiptIndex = index
        do {
            let image = try await repository.receiptImage(sha256: sha256)
            guard requestGeneration == fullImageGeneration, openReceiptIndex == index else {
                return
            }
            guard !Task.isCancelled else { return }
            receiptFull = image
        } catch {
            guard requestGeneration == fullImageGeneration, openReceiptIndex == index else {
                return
            }
            receiptFull = nil
        }
    }

    private func read(previous: PurchaseDetailPhase, isRefresh: Bool) async {
        detailGeneration += 1
        let requestGeneration = detailGeneration
        do {
            let detail = try await repository.purchaseDetail(id: id)
            guard requestGeneration == detailGeneration else { return }
            guard !Task.isCancelled else {
                phase = previous
                return
            }
            guard let detail else {
                settle(.notFound, previous: previous, isRefresh: isRefresh)
                return
            }
            fullImageGeneration += 1
            receiptFull = nil
            openReceiptIndex = nil
            phase = .loaded(detail, refresh: nil)
            await loadThumbnails(for: detail)
        } catch let error where error is CancellationError || Task.isCancelled {
            guard requestGeneration == detailGeneration else { return }
            phase = previous
        } catch {
            guard requestGeneration == detailGeneration else { return }
            settle(PurchaseDetailFailure(error), previous: previous, isRefresh: isRefresh)
        }
    }

    private func settle(
        _ failure: PurchaseDetailFailure, previous: PurchaseDetailPhase, isRefresh: Bool
    ) {
        if isRefresh, case .loaded(let detail, _) = previous {
            phase = .loaded(detail, refresh: failure)
        } else {
            phase = .failed(failure)
        }
    }

    private func loadThumbnails(for detail: PurchaseDetail) async {
        thumbnailGeneration += 1
        let requestGeneration = thumbnailGeneration
        let requests = detail.receiptURIs.enumerated().compactMap { index, uri in
            ReceiptURI.sha256(from: uri).map { (index, $0) }
        }
        receiptPages = []
        guard !requests.isEmpty else { return }

        let repository = repository
        let pages = await withTaskGroup(of: PurchaseReceiptThumbnail?.self) { group in
            for (index, sha256) in requests {
                group.addTask {
                    guard let image = try? await repository.receiptThumbnail(sha256: sha256) else {
                        return nil
                    }
                    return PurchaseReceiptThumbnail(pageIndex: index, image: image)
                }
            }
            var received: [PurchaseReceiptThumbnail] = []
            for await page in group {
                if let page { received.append(page) }
            }
            return received.sorted { $0.pageIndex < $1.pageIndex }
        }
        guard requestGeneration == thumbnailGeneration, !Task.isCancelled else { return }
        receiptPages = pages
    }

    private func invalidateRequests() {
        detailGeneration += 1
        thumbnailGeneration += 1
        fullImageGeneration += 1
    }
}
