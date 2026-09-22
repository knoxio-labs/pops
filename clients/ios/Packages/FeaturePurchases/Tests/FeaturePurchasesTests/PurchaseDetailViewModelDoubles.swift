import AppCore
import Foundation

internal actor DetailGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    internal func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    internal func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}

internal enum DetailResponse<Value: Sendable>: Sendable {
    case value(Value)
    case failure(RepositoryError)
    case gated(DetailGate, Value)
    case cancelled

    internal func resolve() async throws -> Value {
        switch self {
        case .value(let value): return value
        case .failure(let error): throw error
        case .gated(let gate, let value):
            await gate.wait()
            return value
        case .cancelled: throw CancellationError()
        }
    }
}

internal struct DetailCallCounts: Sendable {
    internal let details: Int
    internal let thumbnails: [String]
    internal let images: [String]
}

internal actor DetailRepositoryDouble: PurchasesRepository {
    private var details: [DetailResponse<PurchaseDetail?>]
    private var thumbnails: [String: DetailResponse<ReceiptImage?>]
    private var images: [String: DetailResponse<ReceiptImage?>]
    private var detailCalls = 0
    private var thumbnailCalls: [String] = []
    private var imageCalls: [String] = []
    private var detailCallWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var imageCallWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    internal init(
        details: [DetailResponse<PurchaseDetail?>],
        thumbnails: [String: DetailResponse<ReceiptImage?>] = [:],
        images: [String: DetailResponse<ReceiptImage?>] = [:]
    ) {
        self.details = details
        self.thumbnails = thumbnails
        self.images = images
    }

    internal func counts() -> DetailCallCounts {
        DetailCallCounts(
            details: detailCalls, thumbnails: thumbnailCalls, images: imageCalls)
    }

    internal func waitForDetailCalls(_ count: Int) async {
        if detailCalls >= count { return }
        await withCheckedContinuation { detailCallWaiters.append((count, $0)) }
    }

    internal func waitForImageCalls(_ count: Int) async {
        if imageCalls.count >= count { return }
        await withCheckedContinuation { imageCallWaiters.append((count, $0)) }
    }

    internal func purchases(
        after: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        PurchasePage(purchases: [], nextCursor: nil, totalCount: 0)
    }

    internal func monthSummary(for: Date) async throws -> PurchasesMonthSummary { .empty }

    internal func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? {
        let response = details.removeFirst()
        detailCalls += 1
        resumeDetailWaiters()
        return try await response.resolve()
    }

    internal func receiptThumbnail(sha256: String) async throws -> ReceiptImage? {
        thumbnailCalls.append(sha256)
        return try await thumbnails[sha256, default: .value(nil)].resolve()
    }

    internal func receiptImage(sha256: String) async throws -> ReceiptImage? {
        imageCalls.append(sha256)
        resumeImageWaiters()
        return try await images[sha256, default: .value(nil)].resolve()
    }

    private func resumeDetailWaiters() {
        let ready = detailCallWaiters.filter { detailCalls >= $0.0 }
        detailCallWaiters.removeAll { detailCalls >= $0.0 }
        for waiter in ready { waiter.1.resume() }
    }

    private func resumeImageWaiters() {
        let ready = imageCallWaiters.filter { imageCalls.count >= $0.0 }
        imageCallWaiters.removeAll { imageCalls.count >= $0.0 }
        for waiter in ready { waiter.1.resume() }
    }
}
