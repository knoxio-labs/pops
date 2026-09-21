import AppCore
import DesignSystem
import SwiftUI

/// What was picked, as the files themselves, in the sheet the capture flow
/// runs in.
///
/// A grid rather than a list: nothing has been read yet, so the picture is the
/// only thing that identifies a receipt. Grouping is direct manipulation, as
/// home-screen folders are, and the same gesture reads forwards and backwards:
///
/// - Drag one page onto another and the two become one receipt.
/// - Drag a page onto a receipt and it joins it.
/// - Drag a page out of a receipt, onto the loose area, and it leaves.
///
/// A receipt of several pages is a platter with its pages in it, and the title
/// counts receipts, so a drop that groups two pages is seen twice: the platter
/// forms and the count drops by one.
///
/// The loose area stays on screen when it has no pages, led by the Add tile,
/// because it is the target that ungroups and a target you cannot see is a
/// gesture with no way back.
///
/// Cancel leads and Read trails, in the navigation bar, as every sheet in the
/// app commits.
internal struct PurchaseStagingGrid: View {
    @State private var staged: StagedReceipts
    @State private var viewing: StagedPage?
    @State private var reading = false
    @State private var added = 0
    @Environment(\.dismiss) private var dismiss
    /// Which drop target the drag is currently over, if any. One value rather
    /// than a flag per tile: a drag is over exactly one thing at a time, and
    /// two tiles both believing they are the target is a state that can only
    /// be wrong.
    @State private var targeted: DropTarget?
    @State private var discarding = false

    internal init(receipts: [StagedReceipt]) {
        _staged = State(initialValue: StagedReceipts(receipts))
    }

    /// What a drag can be let go of. `loose` is the area that ungroups, which
    /// is a target in its own right rather than the absence of one.
    private enum DropTarget: Hashable {
        case page(String)
        case receipt(String)
        case loose
    }

    private let columns = [
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
        GridItem(.flexible(), spacing: PopsSpacing.md, alignment: .top),
    ]
    private let tileWidth: CGFloat = 96
    private let groupTile: CGFloat = 72
    private let groupTargetScale: CGFloat = 0.94
    private let looseMinHeight: CGFloat = 160

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                ForEach(staged.groups) { group in
                    groupPlatter(group)
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
                looseArea
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .navigationTitle(title)
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem { cancel }
        .playgroundTrailingBarItem {
            Button("Read") { reading = true }
                .playgroundProminentGlassButton()
                .disabled(staged.isEmpty)
        }
        .navigationDestination(isPresented: $reading) {
            PurchaseProcessingSurface(
                readings: PurchaseStagingGrid.readings(of: staged),
                landing: PurchaseStagingGrid.landing(for: staged))
        }
        .playgroundStage(item: $viewing) { page in
            PurchasePageViewer(
                staged: staged,
                showing: page,
                onDelete: {
                    staged.delete($0.id)
                    viewing = nil
                }
            )
        }
        .inventoryMotion(value: staged)
        .inventoryMotion(value: targeted)
        .tint(.popsPurchases)
    }

    private var title: String {
        switch staged.count {
        case 0: "Receipts"
        case 1: "1 receipt"
        default: "\(staged.count) receipts"
        }
    }

    /// A receipt is a platter with its pages in it, rather than a folder glyph
    /// that hides them. Hiding them would make the pages undraggable, and
    /// dragging a page out is the only way to ungroup.
    private func groupPlatter(_ group: StagedReceipt) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.md) {
                ForEach(group.pages) { page in
                    tile(page, width: groupTile, caption: nil)
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
                staged.move(ids, into: group.id)
            })
    }

    private func delegate(
        for target: DropTarget, perform: @escaping ([String]) -> Void
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

    /// Only ever clears the target it was told about, so a `false` arriving
    /// late from the tile a drag has already left cannot blank the highlight
    /// on the one it has moved onto.
    private func note(_ over: Bool, as target: DropTarget) {
        if over {
            targeted = target
        } else if targeted == target {
            targeted = nil
        }
    }

    private var looseArea: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: PopsSpacing.lg) {
            addTile
            ForEach(staged.loose) { page in
                tile(page, width: tileWidth, caption: page.label)
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, minHeight: looseMinHeight, alignment: .topLeading)
        .padding(PopsSpacing.sm)
        // Without a shape the drop region is whatever the tiles happen to
        // cover, so the empty half of a part-filled row rejects the drag,
        // which is exactly where a page being taken out of a receipt is aimed.
        .contentShape(.rect)
        .background(
            RoundedRectangle(cornerRadius: PopsRadius.card * 2)
                .fill(Color.popsPurchases.opacity(targeted == .loose ? 0.16 : 0))
        )
        .onDrop(
            of: [.plainText],
            delegate: delegate(for: .loose) { ids in
                staged.separate(ids)
            })
    }

    /// More pages, from the same three sources the capture control offers
    /// for paper. Leads the loose pages, as the camera tile leads Inventory's
    /// photo strip, and lands what it adds on its own.
    private var addTile: some View {
        Menu {
            Button("Camera", systemImage: "camera") {
                add("Scan \(added + 1)", media: .jpeg)
            }
            Button("Photo library", systemImage: "photo.on.rectangle") {
                add("IMG_48\(31 + added).HEIC", media: .jpeg)
            }
            Button("Files", systemImage: "folder") {
                add("invoice-\(2_210 + added).pdf", media: .pdf)
            }
        } label: {
            VStack(spacing: PopsSpacing.xs) {
                Image(systemName: "plus")
                    .font(.popsTitle)
                    .frame(width: tileWidth, height: tileWidth * PurchaseCaptureSurfaces.pageRatio)
                    .background(
                        Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
                Text("Add")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityLabel("Add pages")
    }

    private func add(_ label: String, media: ReceiptMediaType) {
        added += 1
        staged.add(PurchaseCaptureSurfaces.page(100 + added, label, media: media))
    }

    private func tile(_ page: StagedPage, width: CGFloat, caption: String?) -> some View {
        StagedPageTile(
            page: page,
            width: width,
            caption: caption,
            isTarget: targeted == .page(page.id),
            onTap: { viewing = page },
            drop: delegate(for: .page(page.id)) { ids in
                staged.combine(ids, with: page.id)
            }
        )
    }

    /// Asks first when anything is staged. Nothing has been uploaded yet, so
    /// leaving costs only the picking, but the picking is the part that took
    /// somebody walking around with a phone.
    private var cancel: some View {
        Button("Cancel") {
            if staged.isEmpty { dismiss() } else { discarding = true }
        }
        .confirmationDialog(
            discardTitle, isPresented: $discarding, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep picking", role: .cancel) {}
        }
    }

    private var discardTitle: String {
        let pages = staged.everyPage.count
        return pages == 1 ? "Discard this page?" : "Discard these \(pages) pages?"
    }
}

extension PurchaseStagingGrid {
    /// What Read starts with: the first receipt out, the rest waiting.
    fileprivate static func readings(of staged: StagedReceipts) -> [ReceiptReading] {
        staged.receipts.enumerated().map { index, receipt in
            ReceiptReading(
                id: receipt.id, pages: receipt.pages, outcome: index == 0 ? .reading : .queued)
        }
    }

    /// What each staged receipt reads back as, in the playground: the fixture
    /// merchants in turn, so a walk from staging lands on real-looking rows.
    fileprivate static func landing(for staged: StagedReceipts) -> [String: ReceiptReading.Outcome]
    {
        let outcomes = PurchaseCaptureSurfaces.readOutcomes
        return Dictionary(
            uniqueKeysWithValues: staged.receipts.enumerated().map { index, receipt in
                (receipt.id, outcomes[index % outcomes.count])
            })
    }
}
