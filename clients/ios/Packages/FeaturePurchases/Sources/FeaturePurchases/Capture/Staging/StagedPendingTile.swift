import AppCore
import DesignSystem
import Foundation
import SwiftUI

internal struct PendingStagedItem: Identifiable, Hashable, Sendable {
    internal enum Phase: Hashable, Sendable {
        case loading
        case failed(reason: ReceiptStagingConversion.Failure)
    }

    internal let id: String
    internal let label: String
    internal var phase: Phase
}

internal struct StagedPendingTile: View {
    private let item: PendingStagedItem
    private let width: CGFloat
    private let onRemove: () -> Void

    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth

    internal init(item: PendingStagedItem, width: CGFloat, onRemove: @escaping () -> Void) {
        self.item = item
        self.width = width
        self.onRemove = onRemove
    }

    internal var body: some View {
        VStack(spacing: PopsSpacing.xs) {
            state
                .frame(width: width, height: width * ratio)
                .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
            Text(item.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: width)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.label)
    }

    @ViewBuilder private var state: some View {
        switch item.phase {
        case .loading:
            ProgressView()
                .accessibilityLabel("Loading")
        case .failed:
            VStack(spacing: PopsSpacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsDestructive)
                Button("Remove", action: onRemove)
                    .font(.popsCaption)
                    .buttonStyle(.borderless)
            }
        }
    }
}

#if DEBUG

    @MainActor
    private let pendingPreviewModel = PurchaseStagingModel(
        receipts: [
            StagedReceipt(
                id: "ready",
                pages: [
                    StagedPage(
                        id: "ready-page",
                        label: "ready.txt",
                        part: ReceiptPart(
                            mediaType: .plainText,
                            data: Data("Coffee 4.50".utf8)))
                ])
        ],
        pending: [
            PendingStagedItem(id: "loading", label: "IMG_4822.HEIC", phase: .loading),
            PendingStagedItem(
                id: "failed",
                label: "receipt.docx",
                phase: .failed(reason: .unsupportedType)),
        ])

    #Preview("Staging — pending and failed") {
        NavigationStack {
            PurchaseStagingGrid(
                model: pendingPreviewModel,
                onRead: {},
                onCancel: {},
                onAdd: { _ in },
                onReplace: { _, _ in })
        }
    }

#endif
