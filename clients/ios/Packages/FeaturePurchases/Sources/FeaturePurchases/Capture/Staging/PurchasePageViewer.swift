import DesignSystem
import SwiftUI

/// One staged page, open for inspection and replacement.
///
/// Pages are ordered across every staged receipt. Paging uses explicit controls so panning the
/// zoomed photo never competes with a paging gesture.
internal struct PurchasePageViewer: View {
    private let model: PurchaseStagingModel
    private let onReplaceWithScan: (StagedPage) -> Void
    private let onReplaceWithPhoto: (StagedPage) -> Void
    private let onReplaceWithFile: (StagedPage) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: String

    internal init(
        model: PurchaseStagingModel,
        showing: StagedPage,
        onReplaceWithScan: @escaping (StagedPage) -> Void = { _ in },
        onReplaceWithPhoto: @escaping (StagedPage) -> Void = { _ in },
        onReplaceWithFile: @escaping (StagedPage) -> Void = { _ in }
    ) {
        self.model = model
        self.onReplaceWithScan = onReplaceWithScan
        self.onReplaceWithPhoto = onReplaceWithPhoto
        self.onReplaceWithFile = onReplaceWithFile
        _current = State(initialValue: showing.id)
    }

    private var pages: [StagedPage] { model.everyPage }
    private var page: StagedPage? { pages.first { $0.id == current } }
    private var index: Int? { pages.firstIndex { $0.id == current } }

    internal var body: some View {
        ZStack {
            Color.popsBackground
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            if let page {
                PopsZoomablePhoto(data: page.bytes, placeholderSymbol: page.symbolName)
                    .id(page.id)
                    .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.2), value: current)
        .safeAreaInset(edge: .top) { header }
        .overlay(alignment: .bottom) { actions }
    }

    private var location: String? {
        PurchasePageViewerLogic.location(of: current, in: model.receipts)
    }

    private var header: some View {
        HStack(spacing: PopsSpacing.md) {
            circle("xmark") { dismiss() }
                .accessibilityLabel("Close")
                .accessibilityIdentifier(PurchaseStagingAccessibility.viewerClose)
            Spacer(minLength: PopsSpacing.sm)
            if let location {
                Text(location)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: PopsSpacing.sm)
            stepper
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
    }

    private var stepper: some View {
        HStack(spacing: PopsSpacing.sm) {
            circle("chevron.left") { step(-1) }
                .disabled(index == 0)
                .accessibilityLabel("Previous")
            circle("chevron.right") { step(1) }
                .disabled(index.map { $0 == pages.count - 1 } ?? true)
                .accessibilityLabel("Next")
        }
    }

    private func step(_ delta: Int) {
        if let next = PurchasePageViewerLogic.step(from: current, by: delta, in: pages) {
            current = next
        }
    }

    private var actions: some View {
        HStack(spacing: PopsSpacing.md) {
            replace
            Button {
                if let page {
                    model.delete(page.id)
                    dismiss()
                }
            } label: {
                capsuleLabel("trash", "Delete", tone: Color.popsDestructive)
            }
            .popsGlass(in: Capsule())
            .accessibilityIdentifier(PurchaseStagingAccessibility.viewerDelete)
        }
        .padding(.bottom, PopsSpacing.xl)
    }

    private var replace: some View {
        Menu {
            Button {
                replace(using: onReplaceWithScan)
            } label: {
                Label("Scan a receipt", systemImage: "doc.viewfinder")
            }
            Button {
                replace(using: onReplaceWithPhoto)
            } label: {
                Label("Choose a photo", systemImage: "photo.on.rectangle")
            }
            Button {
                replace(using: onReplaceWithFile)
            } label: {
                Label("Choose a file", systemImage: "folder")
            }
        } label: {
            capsuleLabel("arrow.triangle.2.circlepath", "Replace", tone: Color.popsForeground)
        }
        .popsGlass(in: Capsule())
        .accessibilityIdentifier(PurchaseStagingAccessibility.viewerReplace)
    }

    private func replace(using action: (StagedPage) -> Void) {
        guard let page else { return }
        PurchasePageViewerLogic.replace(page, in: model, using: action)
    }

    private func circle(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .padding(PopsSpacing.md)
        }
        .popsGlass(in: Circle())
    }

    private func capsuleLabel(_ symbol: String, _ title: String, tone: Color) -> some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: symbol)
            Text(title)
        }
        .font(.popsSubheadline)
        .fontWeight(.medium)
        .foregroundStyle(tone)
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.md)
    }
}
