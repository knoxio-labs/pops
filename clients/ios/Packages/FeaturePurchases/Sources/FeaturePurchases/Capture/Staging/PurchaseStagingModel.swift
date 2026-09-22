import AppCore
import Foundation
import Observation

#if canImport(PhotosUI) && canImport(UIKit)
    import PhotosUI
    import UIKit
#endif

/// Observable state for arranging pages into receipts before reading begins.
///
/// Receipt groups have no page-count ceiling. The server's request-size limit is the only upload
/// bound, so this model delegates every rearrangement without imposing a second limit.
@MainActor @Observable
public final class PurchaseStagingModel {
    private var staged: StagedReceipts
    private var pendingReplacementID: String?

    internal private(set) var refusal: ReceiptCaptureProblem?
    internal private(set) var pending: [PendingStagedItem]

    /// Creates empty staging state.
    public init() {
        staged = StagedReceipts([])
        pending = []
    }

    internal init(receipts: [StagedReceipt], pending: [PendingStagedItem] = []) {
        staged = StagedReceipts(receipts)
        self.pending = pending
    }

    internal var groups: [StagedReceipt] { staged.groups }
    internal var loose: [StagedPage] { staged.loose }
    internal var receipts: [StagedReceipt] { staged.receipts }
    internal var everyPage: [StagedPage] { staged.everyPage }
    internal var count: Int { staged.count }
    internal var isEmpty: Bool { staged.isEmpty }
    internal var canRead: Bool {
        !staged.isEmpty
            && pending.allSatisfy {
                if case .loading = $0.phase { return false }
                return true
            }
    }

    internal func combine(_ ids: [String], with targetID: String) {
        staged.combine(ids, with: targetID)
    }

    internal func move(_ ids: [String], into receiptID: String) {
        staged.move(ids, into: receiptID)
    }

    internal func separate(_ ids: [String]) {
        staged.separate(ids)
    }

    internal func delete(_ id: String) {
        staged.delete(id)
    }

    internal func removePending(_ id: String) {
        pending.removeAll { $0.id == id }
    }

    internal func addFromFileURLs(_ picked: [(url: URL, data: Data)]) async {
        let inputs = picked.map { picked in
            PendingInput(
                id: UUID().uuidString,
                label: picked.url.lastPathComponent,
                pathExtension: picked.url.pathExtension,
                data: picked.data)
        }
        pending.append(
            contentsOf: inputs.map {
                PendingStagedItem(id: $0.id, label: $0.label, phase: .loading)
            })

        for input in inputs {
            let result = await Task.detached { Self.convert(input) }.value
            resolvePending(input.id, with: result)
        }
    }

    #if canImport(PhotosUI) && canImport(UIKit)
        internal func addFromPhotoLibrary(_ items: [PhotosPickerItem]) async {
            let inputs = items.enumerated().map { index, item in
                PhotoInput(
                    id: UUID().uuidString,
                    label: item.itemIdentifier ?? "Photo \(index + 1)",
                    item: item)
            }
            pending.append(
                contentsOf: inputs.map {
                    PendingStagedItem(id: $0.id, label: $0.label, phase: .loading)
                })

            for input in inputs {
                let result: Result<StagedPage, ReceiptStagingConversion.Failure>
                do {
                    guard let data = try await input.item.loadTransferable(type: Data.self) else {
                        resolvePending(input.id, with: .failure(.unreadable))
                        continue
                    }
                    result = await Task.detached {
                        guard let image = UIImage(data: data) else {
                            return .failure(.unreadable)
                        }
                        return ReceiptStagingConversion.page(
                            id: input.id, label: input.label, image: image)
                    }.value
                } catch {
                    result = .failure(.unreadable)
                }
                resolvePending(input.id, with: result)
            }
        }
    #endif

    internal func acknowledgeRefusal() {
        refusal = nil
    }

    internal func addScanned(_ parts: [ReceiptPart], pageCount: Int) {
        guard pageCount != 0 else {
            refusal = .noPages
            return
        }
        guard parts.count == pageCount else {
            refusal = .unpreparedPages
            return
        }
        refusal = nil
        let receiptID = UUID().uuidString
        let pages = parts.enumerated().map { index, part in
            StagedPage(
                id: "\(receiptID)-\(index)",
                label: "Scan page \(index + 1)",
                part: part)
        }
        staged = StagedReceipts(
            staged.receipts + [StagedReceipt(id: receiptID, pages: pages)])
    }

    internal var readingInput: [StagedReceiptForReading] {
        staged.receipts.map { receipt in
            StagedReceiptForReading(id: receipt.id, parts: receipt.pages.map(\.part))
        }
    }

    internal func beginReplacing(_ pageID: String) {
        pendingReplacementID = everyPage.contains { $0.id == pageID } ? pageID : nil
    }

    internal func replaceIfPending(with page: StagedPage) -> Bool {
        guard let pendingReplacementID else { return false }
        self.pendingReplacementID = nil
        return staged.replace(pendingReplacementID, with: page)
    }

    private func resolvePending(
        _ id: String,
        with result: Result<StagedPage, ReceiptStagingConversion.Failure>
    ) {
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        switch result {
        case .success(let page):
            pending.remove(at: index)
            staged.add([page])
        case .failure(let reason):
            pending[index].phase = .failed(reason: reason)
        }
    }

    nonisolated private static func convert(
        _ input: PendingInput
    ) -> Result<StagedPage, ReceiptStagingConversion.Failure> {
        guard
            let mediaType = ReceiptStagingConversion.mediaType(
                forPathExtension: input.pathExtension)
        else { return .failure(.unsupportedType) }

        switch mediaType {
        case .pdf, .plainText:
            return .success(
                ReceiptStagingConversion.page(
                    id: input.id,
                    label: input.label,
                    data: input.data,
                    mediaType: mediaType))
        case .jpeg, .png, .webp, .gif:
            #if canImport(UIKit)
                guard let image = UIImage(data: input.data) else { return .failure(.unreadable) }
                return ReceiptStagingConversion.page(
                    id: input.id,
                    label: input.label,
                    image: image)
            #else
                return .failure(.unreadable)
            #endif
        }
    }
}

private struct PendingInput: Sendable {
    let id: String
    let label: String
    let pathExtension: String
    let data: Data
}

#if canImport(PhotosUI) && canImport(UIKit)
    private struct PhotoInput: Sendable {
        let id: String
        let label: String
        let item: PhotosPickerItem
    }
#endif
