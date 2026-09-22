import AppCore
import DesignSystem
import Foundation
import SwiftUI

/// Shows each staged receipt as bounded extraction work completes.
internal struct PurchaseReadingView: View {
    private let model: PurchaseReadingViewModel
    private let onCancel: () -> Void
    private let onReview: ([PurchaseReadingRow]) -> Void

    internal init(
        model: PurchaseReadingViewModel,
        onCancel: @escaping () -> Void,
        onReview: @escaping ([PurchaseReadingRow]) -> Void
    ) {
        self.model = model
        self.onCancel = onCancel
        self.onReview = onReview
    }

    internal var body: some View {
        List(model.rows) { row in
            PurchaseReadingRowView(row: row)
        }
        .purchaseReadingListStyle()
        .navigationTitle(PurchaseReadingCopy.title)
        .navigationSubtitle(
            PurchaseReadingCopy.subtitle(done: model.done, total: model.rows.count)
        )
        .popsTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(PurchaseReadingCopy.cancel, action: onCancel)
                    .accessibilityIdentifier(PurchaseReadingAccessibility.cancel)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(PurchaseReadingCopy.review) { onReview(model.rows) }
                    .popsProminentGlassButton()
                    .disabled(!model.isFinished)
                    .accessibilityIdentifier(PurchaseReadingAccessibility.review)
            }
        }
        .popsMotion(PopsMotion.smooth, value: model.rows)
        .task { await model.start() }
        .tint(.popsPurchases)
        .accessibilityIdentifier(PurchaseReadingAccessibility.root)
    }
}

/// One staged receipt's pages and current reading outcome.
internal struct PurchaseReadingRowView: View {
    internal let row: PurchaseReadingRow

    private let stackWidth: CGFloat = 36
    private let fanStep: CGFloat = 3

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            fan
            detail
                .frame(maxWidth: .infinity, alignment: .leading)
            mark
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var fan: some View {
        ZStack {
            ForEach(Array(row.parts.prefix(3).enumerated()), id: \.offset) { index, part in
                PopsPhoto(data: imageData(part), placeholderSymbol: symbol(for: part))
                    .frame(
                        width: stackWidth,
                        height: stackWidth * PopsSize.pageHeight / PopsSize.pageWidth
                    )
                    .rotationEffect(.degrees(Double(index - 1) * fanStep))
                    .offset(x: CGFloat(index - 1) * PopsSpacing.xs)
            }
        }
        .frame(width: stackWidth + PopsSpacing.sm)
        .opacity(row.outcome == .queued ? 0.4 : 1)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var detail: some View {
        switch row.outcome {
        case .queued:
            Text(PurchaseReadingCopy.waiting)
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        case .reading:
            PurchaseReadingSkeleton()
        case .read(let reading):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchaseReadingCopy.merchant(reading.extracted.merchantName))
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(
                    "\(reading.extracted.total) · "
                        + PurchaseReadingCopy.items(reading.extracted.lines.count)
                )
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
            }
            .transition(.opacity)
        case .unreadable(let reason):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchaseReadingCopy.unreadable)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(reason)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .transition(.opacity)
        }
    }

    @ViewBuilder private var mark: some View {
        switch row.outcome {
        case .queued, .reading:
            EmptyView()
        case .read:
            Image(systemName: "checkmark.circle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsSuccess)
                .transition(.scale.combined(with: .opacity))
        case .unreadable:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
                .transition(.scale.combined(with: .opacity))
        }
    }

    private func imageData(_ part: ReceiptPart) -> Data? {
        switch part.mediaType {
        case .jpeg, .png, .webp, .gif: part.data
        case .pdf, .plainText: nil
        }
    }

    private func symbol(for part: ReceiptPart) -> String {
        switch part.mediaType {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }
}

internal struct PurchaseReadingSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            bar(width: 128, height: 14)
            bar(width: 88, height: 11)
        }
        .phaseAnimator(reduceMotion ? [1.0] : [1.0, 0.45]) { content, phase in
            content.opacity(phase)
        } animation: { _ in
            .easeInOut(duration: 0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(PurchaseReadingCopy.title)
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        Capsule()
            .fill(Color.popsMutedForeground.opacity(0.25))
            .frame(width: width, height: height)
    }
}
