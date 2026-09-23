import DesignSystem
import SwiftUI

/// Arranges captured pages into receipts before reading begins.
internal struct PurchaseStagingGrid: View {
    private let model: PurchaseStagingModel
    private let onRead: () -> Void
    private let onCancel: () -> Void
    private let onAdd: (PurchaseCaptureSource) -> Void
    private let onReplace: (String, PurchaseCaptureSource) -> Void

    @State private var viewing: StagedPage?
    @State private var targeted: DropTarget?
    @State private var discarding = false

    internal init(
        model: PurchaseStagingModel,
        onRead: @escaping () -> Void,
        onCancel: @escaping () -> Void,
        onAdd: @escaping (PurchaseCaptureSource) -> Void,
        onReplace: @escaping (String, PurchaseCaptureSource) -> Void
    ) {
        self.model = model
        self.onRead = onRead
        self.onCancel = onCancel
        self.onAdd = onAdd
        self.onReplace = onReplace
    }

    private typealias DropTarget = PurchaseStagingGridLogic.DropTarget

    private let columns = [
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
    ]
    private let tileWidth: CGFloat = 96
    private let groupTileWidth: CGFloat = 72
    private let groupTargetScale: CGFloat = 0.94
    private let looseMinimumHeight: CGFloat = 160

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                ForEach(model.groups) { group in
                    groupPlatter(group)
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
                looseArea
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .navigationTitle(PurchaseStagingCopy.title(receiptCount: model.count))
        .popsTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { cancelButton }
            ToolbarItem(placement: .confirmationAction) { readButton }
        }
        .popsStage(item: $viewing) { page in
            PurchasePageViewer(
                model: model,
                showing: page,
                onReplaceWithScan: { onReplace($0.id, .scan) },
                onReplaceWithPhoto: { onReplace($0.id, .photos) },
                onReplaceWithFile: { onReplace($0.id, .file) }
            )
        }
        .confirmationDialog(
            PurchaseStagingCopy.discardTitle(pageCount: model.everyPage.count),
            isPresented: $discarding,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive, action: onCancel)
            Button("Keep picking", role: .cancel) {}
        }
        .alert(
            "Couldn't add receipt",
            isPresented: refusalPresented,
            presenting: model.refusal
        ) { _ in
            Button("OK") { model.acknowledgeRefusal() }
        } message: { problem in
            Text(ReceiptCaptureCopy.message(for: problem))
        }
        .popsMotion(value: model.receipts)
        .popsMotion(value: targeted)
        .tint(.popsPurchases)
        .accessibilityIdentifier(PurchaseStagingAccessibility.root)
    }

    private var readButton: some View {
        Button("Read", action: onRead)
            .popsProminentGlassButton()
            .disabled(model.isEmpty)
            .accessibilityIdentifier(PurchaseStagingAccessibility.read)
    }

    private var cancelButton: some View {
        Button("Cancel") {
            switch PurchaseStagingGridLogic.cancel(isEmpty: model.isEmpty) {
            case .leave: onCancel()
            case .confirmDiscard: discarding = true
            }
        }
        .accessibilityIdentifier(PurchaseStagingAccessibility.cancel)
    }
}

extension PurchaseStagingGrid {
    private func groupPlatter(_ group: StagedReceipt) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.md) {
                ForEach(group.pages) { page in
                    tile(page, width: groupTileWidth, caption: nil)
                }
            }
            .padding(PopsSpacing.md)
        }
        .scrollIndicators(.hidden)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card * 2))
        .scaleEffect(targeted == .receipt(group.id) ? groupTargetScale : 1)
        .background { StagedDropWell(active: targeted == .receipt(group.id)) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("One receipt, \(group.pages.count) pages")
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .receipt(group.id)) { ids in
                model.move(ids, into: group.id)
            })
    }

    private var looseArea: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: PopsSpacing.lg) {
            addTile
            ForEach(model.loose) { page in
                tile(page, width: tileWidth, caption: page.label)
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, minHeight: looseMinimumHeight, alignment: .topLeading)
        .padding(PopsSpacing.sm)
        .contentShape(.rect)
        .background(
            RoundedRectangle(cornerRadius: PopsRadius.card * 2)
                .fill(Color.popsPurchases.opacity(targeted == .loose ? 0.16 : 0))
        )
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .loose) { ids in model.separate(ids) }
        )
        .accessibilityIdentifier(PurchaseStagingAccessibility.looseWell)
    }

    private var addTile: some View {
        Menu {
            Button(
                PurchaseCaptureSource.scan.title,
                systemImage: PurchaseCaptureSource.scan.symbol
            ) { onAdd(.scan) }
            Button(
                PurchaseCaptureSource.photos.title,
                systemImage: PurchaseCaptureSource.photos.symbol
            ) { onAdd(.photos) }
            Button(
                PurchaseCaptureSource.file.title,
                systemImage: PurchaseCaptureSource.file.symbol
            ) { onAdd(.file) }
        } label: {
            VStack(spacing: PopsSpacing.xs) {
                Image(systemName: "plus")
                    .font(.popsTitle)
                    .frame(
                        width: tileWidth,
                        height: tileWidth * PopsSize.pageHeight / PopsSize.pageWidth
                    )
                    .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
                Text("Add")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityLabel("Add pages")
        .accessibilityIdentifier(PurchaseStagingAccessibility.add)
    }

    private func tile(_ page: StagedPage, width: CGFloat, caption: String?) -> some View {
        StagedPageTile(
            page: page,
            width: width,
            caption: caption,
            isTarget: targeted == .page(page.id),
            onTap: { viewing = page },
            drop: delegate(for: .page(page.id)) { ids in
                model.combine(ids, with: page.id)
            }
        )
        .accessibilityIdentifier(PurchaseStagingAccessibility.tile(page.id))
    }

    private func delegate(
        for target: DropTarget,
        perform: @escaping ([String]) -> Void
    ) -> PageDropDelegate {
        PageDropDelegate(
            onEntered: { note(true, as: target) },
            onExited: { note(false, as: target) },
            onDropped: { ids in
                perform(ids)
                targeted = nil
            }
        )
    }

    private func note(_ over: Bool, as target: DropTarget) {
        targeted = PurchaseStagingGridLogic.highlight(after: over, on: target, current: targeted)
    }

    private var refusalPresented: Binding<Bool> {
        Binding(
            get: { model.refusal != nil },
            set: { presented in if !presented { model.acknowledgeRefusal() } })
    }
}
